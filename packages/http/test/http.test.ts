import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AgentService } from '@worldbook/agent'
import { ContextService } from '@worldbook/context'
import { MockModelClient } from '@worldbook/model'
import { EventSink } from '@worldbook/sink'
import { MemoryStore, SessionService } from '@worldbook/session'
import { SubagentService } from '@worldbook/subagent'
import { ToolRegistry } from '@worldbook/tool'
import { TurnRegistry } from '@worldbook/turn'
import { createHttpServer } from '../src/http.js'
import type { SinkFrame } from '@worldbook/sink'

const store = new MemoryStore()
const session = new SessionService(store)
const sink = new EventSink()
const turns = new TurnRegistry()
const tools = new ToolRegistry().toService()
const model = new MockModelClient()
const agent = new AgentService({
  session,
  context: new ContextService(session),
  model,
  tools,
  turns,
  sink,
})
const subagent = new SubagentService({
  session,
  sink,
  turns,
  context: new ContextService(session),
  model,
  tools,
})

const server = createHttpServer({ session, sink, agent, subagent }, { port: 0, host: '127.0.0.1' })
const BASE = 'http://127.0.0.1'

async function createSession(): Promise<string> {
  const res = await fetch(`${BASE}:${server.port()}/sessions`, { method: 'POST' })
  expect(res.status).toBe(201)
  const body = (await res.json()) as { sessionId: string }
  return body.sessionId
}

/** 逐帧读取 SSE，直到出现终态 transition；返回收集到的帧。 */
async function readUntilTerminal(sessionId: string): Promise<SinkFrame[]> {
  const res = await fetch(`${BASE}:${server.port()}/sessions/${sessionId}/stream`)
  expect(res.status).toBe(200)
  const frames: SinkFrame[] = []
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data:')) continue
        const frame = JSON.parse(line.slice('data:'.length)) as SinkFrame
        frames.push(frame)
        if (frame.kind === 'transition' && frame.phase !== 'running') {
          await reader.cancel()
          return frames
        }
      }
    }
  }
  return frames
}

beforeAll(async () => {
  await server.start()
})

afterAll(async () => {
  await server.stop()
})

describe('HTTP 传输层', () => {
  it('创建会话并读取历史', async () => {
    const sessionId = await createSession()
    const res = await fetch(`${BASE}:${server.port()}/sessions/${sessionId}/history`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { sessionId: string; events: unknown[] }
    expect(body.sessionId).toBe(sessionId)
    expect(body.events).toEqual([])
  })

  it('非法请求体 400，未知路由 404，未知会话流 404', async () => {
    const bad = await fetch(`${BASE}:${server.port()}/turns`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: '' }),
    })
    expect(bad.status).toBe(400)

    const missing = await fetch(`${BASE}:${server.port()}/nope`)
    expect(missing.status).toBe(404)

    const noSession = await fetch(`${BASE}:${server.port()}/sessions/does-not-exist/stream`)
    expect(noSession.status).toBe(404)
  })

  it('SSE 收到 turn 全过程帧（transition/event），回放与历史一致', async () => {
    model.enqueue({ text: '你好，世界' })
    const sessionId = await createSession()

    const framesPromise = readUntilTerminal(sessionId)
    const turnRes = await fetch(`${BASE}:${server.port()}/turns`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, input: '打招呼' }),
    })
    expect(turnRes.status).toBe(202)
    const { turnId } = (await turnRes.json()) as { turnId: string }
    expect(turnId).toBeTruthy()

    const frames = await framesPromise
    expect(frames[0]).toMatchObject({ kind: 'transition', phase: 'running' })
    expect(frames.at(-1)).toMatchObject({
      kind: 'transition',
      phase: 'completed',
      reason: 'done',
    })
    expect(frames).toContainEqual({
      kind: 'event',
      seq: expect.any(Number),
      type: 'assistant_message',
      payload: { text: '你好，世界' },
    })

    const historyRes = await fetch(`${BASE}:${server.port()}/sessions/${sessionId}/history`)
    const history = (await historyRes.json()) as { events: { type: string }[] }
    const types = history.events.map((e) => e.type)
    expect(types).toContain('user_message')
    expect(types).toContain('assistant_message')
  })

  it('会话已有活跃 turn 时 POST /turns 返回 409', async () => {
    const sessionId = await createSession()
    const claim = turns.claim(sessionId)
    const res = await fetch(`${BASE}:${server.port()}/turns`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, input: '并发请求' }),
    })
    expect(res.status).toBe(409)
    turns.settle(claim.turnId, 'done')
  })

  it('GET /sessions/:id/subagents 返回子代理状态，未知会话 404', async () => {
    model.enqueue({ text: '子任务结果' })
    const sessionId = await createSession()
    const childId = await subagent.spawn(sessionId, { systemPrompt: 's', task: 't' })
    await subagent.wait(childId)

    const res = await fetch(`${BASE}:${server.port()}/sessions/${sessionId}/subagents`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { sessionId: string; subagents: unknown[] }
    expect(body.sessionId).toBe(sessionId)
    expect(body.subagents).toEqual([
      {
        childSessionId: childId,
        status: 'completed',
        result: {
          childSessionId: childId,
          reason: 'done',
          content: '子任务结果',
          truncated: false,
        },
      },
    ])

    const missing = await fetch(`${BASE}:${server.port()}/sessions/does-not-exist/subagents`)
    expect(missing.status).toBe(404)
  })
})
