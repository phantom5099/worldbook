export type RelationKey = 'trust' | 'affection' | 'fear' | 'respect'

export type RelationLabel = '信任' | '好感' | '恐惧' | '尊重'

export type RelationDelta = [RelationLabel, string, 'up' | 'down']

export interface StateNote {
  who: string
  impression: string
  deltas: RelationDelta[]
}

export type NarrativePart =
  | { type: 'p'; text: string }
  | { type: 'speech'; speaker: string; text: string }

export interface IntentSuggestion {
  key: string
  tone: string
  title: string
  hint: string
  action: string
}

export interface ThreadSeed {
  title: string
  note: string
  state: string
}

export interface TraitGroup {
  key: 'core' | 'slow' | 'mood'
  label: string
  hint: string
  items: Array<[string, number]>
}

export interface Moment {
  quote: string
  meta: string
  event: string
  denied?: boolean
}

export interface Knowledge {
  text: string
  source: string
  secret?: boolean
}

export interface CardProfile {
  name: string
  role: string
  goal: string
  secret: string
  relation: string
  traitsText: string
  avatar: string
  avatarClass: string
  model: string
  fallback: string
  desc?: string
  badge?: string
}

export interface CardInitialState {
  relations?: Partial<Record<RelationKey, number>>
  traits?: TraitGroup[]
  moments?: Moment[]
  knowledge?: Knowledge[]
  state?: string
}

export interface Card extends CardProfile {
  id: string
  worldId: string | null
  initial?: CardInitialState
  createdAt: string
  updatedAt: string
}

export interface WorldUnit {
  index: string
  title: string
  meta: string
}

export interface WorldOpening {
  place: string
  time: string
  parts: NarrativePart[]
  note?: StateNote
}

export interface WorldDetail {
  id: string
  name: string
  preset?: boolean
  badge?: string
  genre: string
  coverClass: string
  scene?: string
  hook: string
  rules: string
  factions: string
  conflict: string
  bans: string
  tags: string[]
  facts?: string[]
  defaultCardId: string | null
  unit: WorldUnit
  opening: WorldOpening
  intents: IntentSuggestion[]
  threads: ThreadSeed[]
  createdAt: string
  updatedAt: string
}

export interface WorldSummary {
  id: string
  name: string
  genre: string
  coverClass: string
  badge?: string
  tags: string[]
  defaultCardId: string | null
  cardCount: number
  sessionCount: number
  updatedAt: string
}

export interface SessionProtagonist extends CardProfile {
  id: string
  relations: Record<RelationKey, number>
  traits: TraitGroup[]
  state: string
}

export interface SessionCast extends SessionProtagonist {
  moments: Moment[]
  knowledge: Knowledge[]
}

export interface SessionSnapshot {
  world: {
    id: string
    name: string
    coverClass: string
    scene?: string
  }
  protagonist: SessionProtagonist
  cast: SessionCast[]
  threads: ThreadSeed[]
  opening: WorldOpening
  intents: IntentSuggestion[]
  unit: WorldUnit
}

export type SessionStatus = 'draft' | 'active'

export interface ChangeRecord {
  who: string
  label: RelationLabel
  value: string
  direction: 'up' | 'down'
  reason: string
}

export interface SessionSummary {
  id: string
  serverId?: string
  title: string
  status: SessionStatus
  snapshot: SessionSnapshot
  createdAt: string
  updatedAt: string
  unitIndex: number
  turnCount: number
  completed: boolean
  changes: ChangeRecord[]
}

export type SessionEventType =
  | 'turn_started'
  | 'turn_ended'
  | 'user_message'
  | 'assistant_message'
  | 'tool_call'
  | 'tool_result'
  | 'subagent_spawned'
  | 'subagent_result'
  | 'subagent_message'

export interface SessionEvent {
  seq: number
  type: SessionEventType
  payload: unknown
  createdAt: string
}

export interface UserMessagePayload {
  text: string
}

export interface AssistantMessagePayload {
  text: string
  parts?: NarrativePart[]
  notes?: StateNote[]
  toolCalls?: unknown[]
  usage?: unknown
}

export interface TurnStartedPayload {
  turnId: string
}

export interface TurnEndedPayload {
  reason: string
  error?: string
  steps: number
}

export type TurnStatus = 'running' | 'done' | 'interrupted' | 'error'

export interface TurnStep {
  text: string
  parts?: NarrativePart[]
  notes?: StateNote[]
  toolCalls?: unknown[]
  live?: boolean
}

export interface TurnView {
  turnId?: string
  round: number
  action: string
  steps: TurnStep[]
  status: TurnStatus
  reason?: string
}

export type SinkFrame =
  | { kind: 'transition'; phase: string; reason?: string }
  | { kind: 'event'; seq: number; type: SessionEventType; payload: unknown }
  | { kind: 'delta'; text: string }

export interface Provider {
  id: string
  name: string
  base: string
  icon: string
  custom?: boolean
}

export interface Account {
  id: string
  name: string
  handle: string
  salt: string
  hash: string
  createdAt: string
}

export interface CreateWorldInput {
  name: string
  genre?: string
  hook: string
  rules?: string
  factions?: string
  conflict?: string
  bans?: string
  tags?: string[]
}

export interface CreateCardInput {
  worldId: string | null
  name: string
  role?: string
  goal?: string
  secret?: string
  traitsText?: string
  relation?: string
  model?: string
  fallback?: string
  desc?: string
  badge?: string
}

export interface CreateSessionInput {
  title: string
  status: SessionStatus
  snapshot: SessionSnapshot
}

export interface SessionPatch {
  title?: string
  status?: SessionStatus
  snapshot?: SessionSnapshot
}
