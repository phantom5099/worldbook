import type { OutgoingEvent, SessionEvent, SessionId, SessionMeta } from './types.js'
import type { SessionRow, SessionStatus, SessionStore } from './store.js'

export class SessionService {
  private readonly counters = new Map<SessionId, number>()
  /** 冷会话的计数器初始化：单飞，避免并发 append 各自读到同一个 maxSeq 而分配重复 seq。 */
  private readonly initializing = new Map<SessionId, Promise<void>>()

  constructor(private readonly store: SessionStore) {}

  createSession(meta: SessionMeta = {}): Promise<SessionId> {
    return this.store.createSession(meta)
  }

  async append(sessionId: SessionId, events: readonly OutgoingEvent[]): Promise<SessionEvent[]> {
    if (events.length === 0) return []
    await this.ensureCounter(sessionId)
    let last = this.counters.get(sessionId)!
    const createdAt = new Date()
    const assigned = events.map((event) => {
      last += 1
      return { seq: last, type: event.type, payload: event.payload, createdAt }
    })
    this.counters.set(sessionId, last)
    try {
      await this.store.insertEvents(sessionId, assigned)
    } catch (error) {
      this.counters.delete(sessionId)
      throw error
    }
    return assigned
  }

  private async ensureCounter(sessionId: SessionId): Promise<void> {
    if (this.counters.has(sessionId)) return
    let pending = this.initializing.get(sessionId)
    if (pending === undefined) {
      pending = this.store
        .maxSeq(sessionId)
        .then((max) => {
          this.counters.set(sessionId, max)
        })
        .finally(() => {
          this.initializing.delete(sessionId)
        })
      this.initializing.set(sessionId, pending)
    }
    await pending
  }

  getHistory(
    sessionId: SessionId,
    opts: { afterSeq?: number; limit?: number } = {},
  ): Promise<SessionEvent[]> {
    return this.store.selectEvents(sessionId, opts.afterSeq ?? 0, opts.limit)
  }

  getSession(sessionId: SessionId): Promise<SessionRow | undefined> {
    return this.store.getSession(sessionId)
  }

  setStatus(sessionId: SessionId, status: SessionStatus): Promise<void> {
    return this.store.setStatus(sessionId, status)
  }
}
