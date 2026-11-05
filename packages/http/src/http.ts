import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { TurnAlreadyActiveError } from '@worldbook/turn'
import type { AgentService } from '@worldbook/agent'
import type { SessionMeta, SessionService } from '@worldbook/session'
import type { EventSink } from '@worldbook/sink'

export interface HttpDeps {
  session: SessionService
  sink: EventSink
  agent: AgentService
}

export interface HttpOptions {
  port: number
  host?: string
}

export interface HttpServerHandle {
  start(): Promise<void>
  port(): number
  stop(): Promise<void>
}

const HEARTBEAT_MS = 15_000

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(undefined)
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown)
      } catch {
        reject(new Error('请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}

function sseWrite(res: ServerResponse, frame: unknown): void {
  res.write(`data: ${JSON.stringify(frame)}\n\n`)
}

async function streamSession(
  deps: HttpDeps,
  sessionId: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const row = await deps.session.getSession(sessionId)
  if (!row) {
    sendJson(res, 404, { error: `session ${sessionId} not found` })
    return
  }
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })

  const iterator = deps.sink.attach(sessionId)[Symbol.asyncIterator]()
  let closed = false
  const heartbeat = setInterval(() => {
    if (!closed) res.write(': ping\n\n')
  }, HEARTBEAT_MS)
  req.on('close', () => {
    closed = true
    clearInterval(heartbeat)
    void iterator.return?.()
  })

  try {
    while (true) {
      const { done, value } = await iterator.next()
      if (done || closed) break
      sseWrite(res, value)
    }
  } finally {
    clearInterval(heartbeat)
  }
  if (!closed) res.end()
}

export function createHttpServer(deps: HttpDeps, opts: HttpOptions): HttpServerHandle {
  const server = createServer((req, res) => {
    void route(req, res).catch((err: unknown) => {
      if (!res.headersSent) {
        sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
      } else {
        res.destroy()
      }
    })
  })

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const sessionMatch = url.pathname.match(/^\/sessions\/([^/]+)(\/stream|\/history)?$/)

    if (req.method === 'POST' && url.pathname === '/sessions') {
      const body = (await readJsonBody(req)) as { meta?: SessionMeta } | undefined
      if (body !== undefined && typeof body !== 'object') {
        sendJson(res, 400, { error: '请求体须为对象（可选 meta 字段）' })
        return
      }
      const sessionId = await deps.session.createSession(body?.meta ?? {})
      sendJson(res, 201, { sessionId })
      return
    }

    if (req.method === 'POST' && url.pathname === '/turns') {
      const body = (await readJsonBody(req)) as
        | { sessionId?: unknown; input?: unknown }
        | undefined
      if (
        !body ||
        typeof body.sessionId !== 'string' ||
        typeof body.input !== 'string' ||
        body.sessionId === '' ||
        body.input === ''
      ) {
        sendJson(res, 400, { error: '请求体须为 {sessionId, input}，两者均为非空字符串' })
        return
      }
      try {
        const handle = deps.agent.start(body.sessionId, body.input)
        sendJson(res, 202, { turnId: handle.turnId })
      } catch (err) {
        if (err instanceof TurnAlreadyActiveError) {
          sendJson(res, 409, { error: err.message })
        } else {
          throw err
        }
      }
      return
    }

    if (req.method === 'GET' && sessionMatch?.[1] && sessionMatch[2] === '/stream') {
      await streamSession(deps, sessionMatch[1], req, res)
      return
    }

    if (req.method === 'GET' && sessionMatch?.[1] && sessionMatch[2] === '/history') {
      const sessionId = sessionMatch[1]
      const row = await deps.session.getSession(sessionId)
      if (!row) {
        sendJson(res, 404, { error: `session ${sessionId} not found` })
        return
      }
      const events = await deps.session.getHistory(sessionId)
      sendJson(res, 200, { sessionId, events })
      return
    }

    sendJson(res, 404, { error: `no route: ${req.method} ${url.pathname}` })
  }

  let actualPort: number | undefined

  return {
    start(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(opts.port, opts.host, () => {
          const address = server.address()
          actualPort = typeof address === 'object' && address ? address.port : opts.port
          resolve()
        })
      })
    },
    port(): number {
      if (actualPort === undefined) throw new Error('HTTP server not started')
      return actualPort
    },
    stop(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.closeAllConnections()
        server.close((err) => (err ? reject(err) : resolve()))
      })
    },
  }
}
