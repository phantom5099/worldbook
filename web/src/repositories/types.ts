import type {
  Account,
  Card,
  ChangeRecord,
  CreateCardInput,
  CreateSessionInput,
  CreateWorldInput,
  Provider,
  SessionEvent,
  SessionSummary,
  SinkFrame,
  WorldDetail,
  WorldSummary,
} from '@/api/types'

export type CardPatch = Partial<
  Pick<
    Card,
    | 'name'
    | 'role'
    | 'goal'
    | 'secret'
    | 'relation'
    | 'traitsText'
    | 'avatar'
    | 'avatarClass'
    | 'model'
    | 'fallback'
    | 'desc'
    | 'badge'
    | 'initial'
  >
>

export interface WorldRepository {
  list(): Promise<WorldSummary[]>
  get(id: string): Promise<WorldDetail | undefined>
  create(input: CreateWorldInput): Promise<WorldDetail>
  update(id: string, patch: Partial<CreateWorldInput>): Promise<WorldDetail>
  remove(id: string): Promise<void>
}

export interface CardRepository {
  list(filter?: { worldId?: string | null }): Promise<Card[]>
  get(id: string): Promise<Card | undefined>
  create(input: CreateCardInput): Promise<Card>
  update(id: string, patch: CardPatch): Promise<Card>
  remove(id: string): Promise<void>
}

export interface SessionTransport {
  create(meta: Record<string, unknown>): Promise<{ sessionId: string }>
  startTurn(sessionId: string, input: string): Promise<{ turnId: string }>
  history(sessionId: string, afterSeq?: number): Promise<SessionEvent[]>
  stream(sessionId: string, signal: AbortSignal): AsyncIterable<SinkFrame>
}

export interface SessionProgress {
  unitIndex?: number
  turnCount?: number
  completed?: boolean
  changes?: ChangeRecord[]
}

export interface SessionRepository {
  list(): Promise<SessionSummary[]>
  get(id: string): Promise<SessionSummary | undefined>
  getByServerId(serverId: string): Promise<SessionSummary | undefined>
  create(input: CreateSessionInput): Promise<SessionSummary>
  update(id: string, patch: Partial<Pick<SessionSummary, 'title' | 'snapshot'>>): Promise<SessionSummary>
  activate(id: string): Promise<SessionSummary>
  startUnit(id: string): Promise<SessionSummary>
  markProgress(id: string, progress: SessionProgress): Promise<SessionSummary>
  remove(id: string): Promise<void>
}

export interface AuthRepository {
  ensureSeed(): Promise<void>
  current(): Account | null
  register(input: { name: string; handle: string; password: string }): Promise<Account>
  login(handle: string, password: string): Promise<Account>
  logout(): void
}

export interface ProviderRepository {
  list(): Promise<Provider[]>
  create(input: { id: string; name: string; base: string }): Promise<Provider>
}

export interface AssistMessage {
  role: 'user' | 'assistant'
  text: string
}

export interface AssistRepository {
  worldDraft(messages: AssistMessage[], previous?: Partial<CreateWorldInput>): Promise<Partial<CreateWorldInput>>
  cardDraft(messages: AssistMessage[], previous?: Partial<CreateCardInput>): Promise<Partial<CreateCardInput>>
}
