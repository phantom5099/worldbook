import type { OutgoingEvent, SessionEvent, SessionId, SessionMeta } from './types.js'
import type { SessionRow, SessionStatus, SessionStore } from './store.js'

export interface SessionServiceOptions {
  /** 会话 seq 计数器缓存上限；缺省不淘汰。落库中的会话不淘汰。 */
  maxEntries?: number
}

interface CounterNode {
  sessionId: SessionId
  value: number
  prev: CounterNode | null
  next: CounterNode | null
}

export class SessionService {
  private readonly counters = new Map<SessionId, CounterNode>()
  /** 冷会话的计数器初始化：单飞，避免并发 append 各自读到同一个 maxSeq 而分配重复 seq。 */
  private readonly initializing = new Map<SessionId, Promise<void>>()
  /** 会话的落库中 append 数：计数器在最后一个落库结束前不能被淘汰或丢弃。 */
  private readonly inflight = new Map<SessionId, number>()
  /** 落库失败后待丢弃：等同会话所有落库结束再从 DB 重新初始化。 */
  private readonly resetPending = new Set<SessionId>()
  private head: CounterNode | null = null
  private tail: CounterNode | null = null

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
      const node = this.counters.get(sessionId)!
      let last = node.value
      const createdAt = new Date()
      const assigned = events.map((event) => {
        last += 1
        return { seq: last, type: event.type, payload: event.payload, createdAt }
      })
      node.value = last
      this.moveToTail(node)
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
          this.createCounter(sessionId, max)
        })
        .finally(() => {
          this.initializing.delete(sessionId)
        })
      this.initializing.set(sessionId, pending)
    }
    await pending
  }

  private createCounter(sessionId: SessionId, value: number): void {
    const node: CounterNode = {
      sessionId,
      value,
      prev: this.tail,
      next: null,
    }
    if (this.tail !== null) this.tail.next = node
    else this.head = node
    this.tail = node
    this.counters.set(sessionId, node)
  }

  private endAppend(sessionId: SessionId, failed: boolean): void {
    if (failed) this.resetPending.add(sessionId)
    const remaining = (this.inflight.get(sessionId) ?? 1) - 1
    if (remaining > 0) {
      this.inflight.set(sessionId, remaining)
      return
    }
    this.inflight.delete(sessionId)
    if (this.resetPending.delete(sessionId)) {
      const node = this.counters.get(sessionId)
      if (node !== undefined) this.removeCounter(node)
    }
  }

  /** 链表按最近使用排序；仍有落库或初始化的会话跳过，避免读到落后的 maxSeq。 */
  private evict(): void {
    const maxEntries = this.options.maxEntries
    if (maxEntries === undefined) return
    let node = this.head
    while (node !== null && this.counters.size > maxEntries) {
      const next = node.next
      if (this.inflight.has(node.sessionId) || this.initializing.has(node.sessionId)) {
        node = next
        continue
      }
      this.removeCounter(node)
      node = next
    }
  }

  private removeCounter(node: CounterNode): void {
    this.unlink(node)
    this.counters.delete(node.sessionId)
  }

  private moveToTail(node: CounterNode): void {
    if (this.tail === node) return
    this.unlink(node)
    node.prev = this.tail
    this.tail!.next = node
    this.tail = node
  }

  private unlink(node: CounterNode): void {
    if (node.prev !== null) node.prev.next = node.next
    else this.head = node.next
    if (node.next !== null) node.next.prev = node.prev
    else this.tail = node.prev
    node.prev = null
    node.next = null
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
