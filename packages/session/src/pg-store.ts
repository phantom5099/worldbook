import type { Sql } from 'postgres'
import type { SessionEvent, SessionEventType, SessionId, SessionMeta } from './types.js'
import type { SessionRow, SessionStatus, SessionStore, StoredEvent } from './store.js'

export class PostgresSessionStore implements SessionStore {
  constructor(private readonly sql: Sql) {}

  async createSession(meta: SessionMeta): Promise<SessionId> {
    const parentId = meta.parentId ?? null
    const depth = meta.depth ?? 0
    const rows = await this.sql<Array<{ id: string }>>`
      insert into sessions (parent_id, depth, status, meta)
      values (${parentId}, ${depth}, 'active', ${this.sql.json(meta)})
      returning id
    `
    return rows[0]!.id
  }

  async insertEvents(sessionId: SessionId, events: ReadonlyArray<StoredEvent>): Promise<void> {
    const rows = events.map((event) => ({
      session_id: sessionId,
      seq: event.seq,
      type: event.type,
      payload: this.sql.json(event.payload as never),
    }))
    await this.sql`insert into session_events ${this.sql(rows)}`
  }

  async selectEvents(sessionId: SessionId, afterSeq: number, limit?: number): Promise<SessionEvent[]> {
    const rows = limit === undefined
      ? await this.sql<Array<{ seq: number; type: string; payload: unknown; created_at: Date }>>`
          select seq, type, payload, created_at
          from session_events
          where session_id = ${sessionId} and seq > ${afterSeq}
          order by seq asc
        `
      : await this.sql<Array<{ seq: number; type: string; payload: unknown; created_at: Date }>>`
          select seq, type, payload, created_at
          from session_events
          where session_id = ${sessionId} and seq > ${afterSeq}
          order by seq asc
          limit ${limit}
        `
    return rows.map((row) => ({
      seq: Number(row.seq),
      type: row.type as SessionEventType,
      payload: row.payload,
      createdAt: new Date(row.created_at),
    }))
  }

  async maxSeq(sessionId: SessionId): Promise<number> {
    const rows = await this.sql<Array<{ max: number }>>`
      select coalesce(max(seq), 0) as max from session_events where session_id = ${sessionId}
    `
    return Number(rows[0]!.max)
  }

  async getSession(sessionId: SessionId): Promise<SessionRow | undefined> {
    const rows = await this.sql<Array<{
      id: string
      parent_id: string | null
      depth: number
      status: string
      meta: SessionMeta
    }>>`
      select id, parent_id, depth, status, meta from sessions where id = ${sessionId}
    `
    const row = rows[0]
    if (!row) return undefined
    return {
      id: row.id,
      parentId: row.parent_id,
      depth: row.depth,
      status: row.status as SessionStatus,
      meta: row.meta,
    }
  }

  async setStatus(sessionId: SessionId, status: SessionStatus): Promise<void> {
    await this.sql`update sessions set status = ${status} where id = ${sessionId}`
  }
}
