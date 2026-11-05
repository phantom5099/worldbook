import type { OutgoingEvent, SessionEvent, SessionId, SessionMeta } from './types.js'
import type { SessionRow, SessionStatus, SessionStore } from './store.js'

export class SessionService {
  private counters = new Map<SessionId, number>()

  constructor(private readonly store: SessionStore) {}

  createSession(meta: SessionMeta = {}): Promise<SessionId> {
    return this.store.createSession(meta)
  }

  async append(sessionId: SessionId, events: readonly OutgoingEvent[]): Promise<SessionEvent[]> {
    if (events.length === 0) return []
    let last = this.counters.get(sessionId)
    if (last === undefined) {
      last = await this.store.maxSeq(sessionId)
    }
    const createdAt = new Date()
    const assigned = events.map((event) => {
      last = last! + 1
      return { seq: last, type: event.type, payload: event.payload, createdAt }
    })
    this.counters.set(sessionId, assigned[assigned.length - 1]!.seq)
    try {
      await this.store.insertEvents(sessionId, assigned)
    } catch (error) {
      this.counters.delete(sessionId)
      throw error
    }
    return assigned
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
