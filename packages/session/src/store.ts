import type { SessionEvent, SessionEventType, SessionId, SessionMeta } from './types.js'

export type SessionStatus = 'active' | 'closed' | 'failed'

export interface SessionRow {
  id: SessionId
  parentId: SessionId | null
  depth: number
  status: SessionStatus
  meta: SessionMeta
}

export interface StoredEvent {
  seq: number
  type: SessionEventType
  payload: unknown
  createdAt: Date
}

export interface SessionStore {
  createSession(meta: SessionMeta): Promise<SessionId>
  insertEvents(sessionId: SessionId, events: ReadonlyArray<StoredEvent>): Promise<void>
  selectEvents(sessionId: SessionId, afterSeq: number, limit?: number): Promise<SessionEvent[]>
  maxSeq(sessionId: SessionId): Promise<number>
  getSession(sessionId: SessionId): Promise<SessionRow | undefined>
  setStatus(sessionId: SessionId, status: SessionStatus): Promise<void>
}
