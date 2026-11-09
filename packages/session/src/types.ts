export type SessionId = string

export type SessionEventType =
  | 'turn_started'
  | 'turn_ended'
  | 'user_message'
  | 'assistant_message'
  | 'tool_result'
  | 'subagent_spawned'
  | 'subagent_result'
  | 'subagent_message'

export interface SessionEvent {
  seq: number
  type: SessionEventType
  payload: unknown
  createdAt: Date
}

export interface OutgoingEvent {
  type: SessionEventType
  payload: unknown
}

export interface SessionMeta {
  parentId?: SessionId
  depth?: number
  [key: string]: unknown
}
