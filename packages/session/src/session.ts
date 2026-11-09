import type { OutgoingEvent, SessionEvent, SessionId, SessionMeta } from './types.js'
import type { SessionRow, SessionStatus, SessionStore } from './store.js'

export interface SessionServiceOptions {
  /** 会话 seq 计数器缓存上限；缺省不淘汰。落库中的会话不淘汰。 */
  maxEntries?: number
}

export class SessionService {
  private readonly counters = new Map<SessionId, number>()
  /** 冷会话的计数器初始化：单飞，避免并发 append 各自读到同一个 maxSeq 而分配重复 seq。 */
  private readonly initializing = new Map<SessionId, Promise<void>>()
  /** 会话的落库中 append 数：计数器在最后一个落库结束前不能被淘汰或丢弃。 */
  private readonly inflight = new Map<SessionId, number>()
  /** 落库失败后待丢弃：等同会话所有落库结束再从 DB 重新初始化。 */
  private readonly resetPending = new Set<SessionId>()

  constructor(
    private readonly store: SessionStore,
    private readonly options: SessionServiceOptions = {},
  ) {}

  createSession(meta: SessionMeta = {}): Promise<SessionId> {
    return this.store.createSession(meta)
  }

  async append(sessionId: SessionId, events: readonly OutgoingEvent[]): Promise<SessionEvent[]> {
    if (events.length === 0) return []
    this.inflight.set(sessionId, (this.inflight.get(sessionId) ?? 0) + 1)
    let failed = true
    try {
      await this.ensureCounter(sessionId)
      let last = this.counters.get(sessionId)!
      const createdAt = new Date()
      const assigned = events.map((event) => {
        last += 1
        return { seq: last, type: event.type, payload: event.payload, createdAt }
      })
      this.counters.delete(sessionId)
      this.counters.set(sessionId, last)
      await this.store.insertEvents(sessionId, assigned)
      failed = false
      this.evict()
      return assigned
    } finally {
      this.endAppend(sessionId, failed)
    }
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

  private endAppend(sessionId: SessionId, failed: boolean): void {
    if (failed) this.resetPending.add(sessionId)
    const remaining = (this.inflight.get(sessionId) ?? 1) - 1
    if (remaining > 0) {
      this.inflight.set(sessionId, remaining)
      return
    }
    this.inflight.delete(sessionId)
    if (this.resetPending.delete(sessionId)) this.counters.delete(sessionId)
  }

  /** Map 插入序即最近使用序；仍有落库或初始化的会话跳过，避免读到落后的 maxSeq。 */
  private evict(): void {
    const maxEntries = this.options.maxEntries
    if (maxEntries === undefined) return
    if (this.counters.size <= maxEntries) return
    for (const sessionId of this.counters.keys()) {
      if (this.counters.size <= maxEntries) return
      if (this.inflight.has(sessionId) || this.initializing.has(sessionId)) continue
      this.counters.delete(sessionId)
    }
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
