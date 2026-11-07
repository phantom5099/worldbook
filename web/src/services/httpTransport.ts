import { ApiError } from '@/api/errors'
import { readSseStream } from '@/api/sse'
import type { SessionEvent, SinkFrame } from '@/api/types'
import type { SessionTransport } from '@/repositories/types'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

async function bodyMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body.error === 'string') return body.error
  } catch {
    // 非 JSON 错误体按状态码处理。
  }
  return `请求失败（${response.status}）`
}

export class HttpSessionTransport implements SessionTransport {
  private readonly baseUrl: string

  constructor(
    baseUrl = import.meta.env.VITE_API_BASE ?? '',
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`
  }

  private async json<T>(response: Response): Promise<T> {
    return (await response.json()) as T
  }

  async create(meta: Record<string, unknown>): Promise<{ sessionId: string }> {
    const response = await this.fetchImpl(this.url('/sessions'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ meta }),
    })
    if (!response.ok) throw new ApiError(response.status, await bodyMessage(response))
    return this.json<{ sessionId: string }>(response)
  }

  async startTurn(sessionId: string, input: string): Promise<{ turnId: string }> {
    const response = await this.fetchImpl(this.url('/turns'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, input }),
    })
    if (!response.ok) throw new ApiError(response.status, await bodyMessage(response))
    return this.json<{ turnId: string }>(response)
  }

  async history(sessionId: string, afterSeq?: number): Promise<SessionEvent[]> {
    const suffix = afterSeq === undefined ? '' : `?afterSeq=${afterSeq}`
    const response = await this.fetchImpl(this.url(`/sessions/${encodeURIComponent(sessionId)}/history${suffix}`))
    if (!response.ok) throw new ApiError(response.status, await bodyMessage(response))
    const body = await this.json<{ events: SessionEvent[] }>(response)
    const events = Array.isArray(body.events) ? body.events : []
    return afterSeq === undefined ? events : events.filter((event) => event.seq > afterSeq)
  }

  async *stream(sessionId: string, signal: AbortSignal): AsyncIterable<SinkFrame> {
    const response = await this.fetchImpl(this.url(`/sessions/${encodeURIComponent(sessionId)}/stream`), {
      headers: { accept: 'text/event-stream' },
      signal,
    })
    if (!response.ok) throw new ApiError(response.status, await bodyMessage(response))
    yield* readSseStream(response, signal)
  }
}
