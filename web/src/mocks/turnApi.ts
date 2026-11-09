import { ApiError } from '@/api/errors'
import { newId } from '@/api/ids'
import type {
  AssistantMessagePayload,
  NarrativePart,
  SessionEvent,
  SessionEventType,
  SinkFrame,
  StateNote,
} from '@/api/types'
import type { TurnApi } from '@/api/endpoints/types'
import { WORLD_SEEDS } from './fixtures/worlds'
import { MockStore, clone } from './store'

class FrameQueue {
  private buffer: SinkFrame[] = []
  private waiters: Array<() => void> = []
  private closed = false

  push(frame: SinkFrame): void {
    this.buffer.push(frame)
    this.waiters.shift()?.()
  }

  close(): void {
    this.closed = true
    while (this.waiters.length > 0) this.waiters.shift()?.()
  }

  async next(): Promise<IteratorResult<SinkFrame>> {
    if (this.buffer.length > 0) return { value: this.buffer.shift()!, done: false }
    if (this.closed) return { value: undefined, done: true }
    await new Promise<void>((resolve) => this.waiters.push(resolve))
    if (this.buffer.length > 0) return { value: this.buffer.shift()!, done: false }
    return { value: undefined, done: true }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface MockScript {
  parts: NarrativePart[]
  notes: StateNote[]
}

function genericScript(input: string, meta: Record<string, unknown>): MockScript {
  const cast = Array.isArray(meta.cast) ? meta.cast : []
  const first = isRecord(cast[0]) && typeof cast[0].name === 'string' ? cast[0].name : '对方'
  return {
    parts: [
      { type: 'p', text: `你说出这句话时，周围的声音停了一瞬。${input ? '没有人立刻回应。' : ''}` },
      { type: 'speech', speaker: first, text: '你确定要这么做？' },
      { type: 'p', text: '你没有得到答案，只能自己继续往前走。' },
    ],
    notes: [{ who: first, impression: '重新估量你', deltas: [['信任', '+0.01', 'up']] }],
  }
}

export interface MockTurnApiOptions {
  delayMs?: number
}

export class MockTurnApi implements TurnApi {
  private readonly delayMs: number
  private readonly listeners = new Map<string, Set<FrameQueue>>()
  private readonly active = new Set<string>()
  private readonly generation = new Map<string, Promise<void>>()

  constructor(private readonly store = new MockStore(), options: MockTurnApiOptions = {}) {
    this.delayMs = options.delayMs ?? 18
  }

  private metaKey(sessionId: string): string {
    return `transport:meta:${sessionId}`
  }

  private eventsKey(sessionId: string): string {
    return `transport:events:${sessionId}`
  }

  private metaOf(sessionId: string): Record<string, unknown> {
    return this.store.read<Record<string, unknown>>(this.metaKey(sessionId), {})
  }

  private eventsOf(sessionId: string): SessionEvent[] {
    return this.store.read<SessionEvent[]>(this.eventsKey(sessionId), [])
  }

  private emit(sessionId: string, frame: SinkFrame): void {
    const set = this.listeners.get(sessionId)
    if (!set) return
    for (const queue of set) queue.push(frame)
  }

  private append(sessionId: string, type: SessionEventType, payload: unknown): SessionEvent {
    const events = this.eventsOf(sessionId)
    const event: SessionEvent = {
      seq: (events[events.length - 1]?.seq ?? 0) + 1,
      type,
      payload,
      createdAt: new Date().toISOString(),
    }
    events.push(event)
    this.store.write(this.eventsKey(sessionId), events)
    this.emit(sessionId, { kind: 'event', seq: event.seq, type: event.type, payload: event.payload })
    return event
  }

  async create(meta: Record<string, unknown>): Promise<{ sessionId: string }> {
    const sessionId = newId('mock-session')
    this.store.write(this.metaKey(sessionId), clone(meta))
    this.store.write(this.eventsKey(sessionId), [])
    return { sessionId }
  }

  async startTurn(sessionId: string, input: string): Promise<{ turnId: string }> {
    if (this.active.has(sessionId)) throw new ApiError(409, '当前会话已有进行中的回合')
    const meta = this.metaOf(sessionId)
    if (!this.store.has(this.eventsKey(sessionId))) throw new ApiError(404, `session ${sessionId} not found`)
    const turnId = newId('turn')
    this.active.add(sessionId)
    this.emit(sessionId, { kind: 'transition', phase: 'running' })
    this.append(sessionId, 'turn_started', { turnId })
    this.append(sessionId, 'user_message', { text: input })

    const run = this.generate(sessionId, input, meta)
      .catch(() => undefined)
      .finally(() => this.active.delete(sessionId))
    this.generation.set(sessionId, run)
    return { turnId }
  }

  private async generate(
    sessionId: string,
    input: string,
    meta: Record<string, unknown>,
  ): Promise<void> {
    const script = this.scriptFor(input, meta)
    await sleep(Math.max(30, this.delayMs * 4))
    for (const part of script.parts) {
      const text = part.text
      for (let index = 0; index < text.length; index += 6) {
        this.emit(sessionId, { kind: 'delta', text: text.slice(index, index + 6) })
        await sleep(this.delayMs)
      }
      this.emit(sessionId, { kind: 'delta', text: '\n' })
    }
    const text = script.parts.map((part) => part.text).join('\n\n')
    const payload: AssistantMessagePayload = { text, parts: script.parts, notes: script.notes }
    this.append(sessionId, 'assistant_message', payload)
    this.emit(sessionId, { kind: 'transition', phase: 'done' })
    this.append(sessionId, 'turn_ended', { reason: 'done', steps: 1 })
  }

  private scriptFor(input: string, meta: Record<string, unknown>): MockScript {
    const worldId = typeof meta.worldId === 'string' ? meta.worldId : ''
    const seed = WORLD_SEEDS[worldId]
    const intent = seed?.intents.find((item) => item.action === input)
    if (intent) return { parts: clone(intent.ai), notes: clone(intent.notes) }
    return genericScript(input, meta)
  }

  async history(sessionId: string, afterSeq?: number): Promise<SessionEvent[]> {
    const events = this.eventsOf(sessionId)
    return afterSeq === undefined ? events : events.filter((event) => event.seq > afterSeq)
  }

  async *stream(sessionId: string, signal: AbortSignal): AsyncIterable<SinkFrame> {
    const queue = new FrameQueue()
    let set = this.listeners.get(sessionId)
    if (!set) {
      set = new Set()
      this.listeners.set(sessionId, set)
    }
    set.add(queue)
    const close = () => queue.close()
    signal.addEventListener('abort', close, { once: true })
    try {
      while (!signal.aborted) {
        const item = await queue.next()
        if (item.done) break
        yield item.value
      }
    } finally {
      set.delete(queue)
      if (set.size === 0) this.listeners.delete(sessionId)
      signal.removeEventListener('abort', close)
    }
  }

  async whenIdle(sessionId: string): Promise<void> {
    await this.generation.get(sessionId)
  }

  reset(): void {
    for (const key of this.store.storageKeys()) {
      if (key.includes('transport:')) this.store.removeKey(key)
    }
    this.listeners.clear()
    this.active.clear()
    this.generation.clear()
  }
}
