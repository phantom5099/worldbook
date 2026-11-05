import { randomUUID } from 'node:crypto'
import type { SessionRow, SessionStatus, SessionStore, StoredEvent } from './store.js'

export class MemoryStore implements SessionStore {
  sessions = new Map<string, SessionRow>()
  events = new Map<string, StoredEvent[]>()

  async createSession(meta: { parentId?: string; depth?: number }): Promise<string> {
    const id = randomUUID()
    this.sessions.set(id, {
      id,
      parentId: meta.parentId ?? null,
      depth: meta.depth ?? 0,
      status: 'active',
      meta,
    })
    return id
  }

  async insertEvents(sessionId: string, events: ReadonlyArray<StoredEvent>): Promise<void> {
    const list = this.events.get(sessionId) ?? []
    list.push(...events)
    this.events.set(sessionId, list)
  }

  async selectEvents(sessionId: string, afterSeq: number, limit?: number) {
    const list = (this.events.get(sessionId) ?? []).filter((e) => e.seq > afterSeq)
    return (limit !== undefined ? list.slice(0, limit) : list).map((e) => ({ ...e }))
  }

  async maxSeq(sessionId: string): Promise<number> {
    return (this.events.get(sessionId) ?? []).reduce((max, e) => Math.max(max, e.seq), 0)
  }

  async getSession(sessionId: string) {
    return this.sessions.get(sessionId)
  }

  async setStatus(sessionId: string, status: SessionStatus): Promise<void> {
    const row = this.sessions.get(sessionId)
    if (row) row.status = status
  }
}
