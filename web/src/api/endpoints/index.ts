import { HttpTurnApi } from './turns'
import type {
  AssistApi,
  AuthApi,
  CardApi,
  ProviderApi,
  SessionApi,
  TurnApi,
  WorldApi,
} from './types'
import { MockAssistApi } from '@/mocks/assistApi'
import { MockAuthApi } from '@/mocks/authApi'
import { MockCardApi, MockContentStore, MockWorldApi } from '@/mocks/contentApi'
import { MockProviderApi } from '@/mocks/providerApi'
import { MockSessionApi } from '@/mocks/sessionApi'
import { MockTurnApi } from '@/mocks/turnApi'
import { MockStore } from '@/mocks/store'

export interface Api {
  auth: AuthApi
  worlds: WorldApi
  cards: CardApi
  sessions: SessionApi
  turns: TurnApi
  providers: ProviderApi
  assist: AssistApi
}

export interface ApiOverrides {
  store?: MockStore
  auth?: AuthApi
  turns?: TurnApi
  ownerId?: () => string | null
  assistDelayMs?: number
}

function defaultTurns(store: MockStore): TurnApi {
  const mode = import.meta.env.VITE_SESSION_MODE ?? 'http'
  if (mode === 'mock') return new MockTurnApi(store)
  return new HttpTurnApi()
}

/**
 * 组合根：页面与状态层只调用后端端点。
 * 回合运行时已有后端契约，默认走 `HttpTurnApi`，`VITE_SESSION_MODE=mock` 时换成 mock；
 * 账号、世界书、角色卡、会话列表、提供商与起草器尚无后端端点，先由 mock 提供相同的方法。
 * 后端就绪后为对应端点补 HTTP 实现，并在这里切换。
 */
export function createApi(overrides: ApiOverrides = {}): Api {
  const store = overrides.store ?? new MockStore()
  const auth = overrides.auth ?? new MockAuthApi(store)
  const ownerId = overrides.ownerId ?? (() => auth.current()?.id ?? null)
  const scope = () => ownerId() ?? 'anonymous'
  const content = new MockContentStore(store, undefined, scope)
  const turns = overrides.turns ?? defaultTurns(store)
  const sessions = new MockSessionApi(content, turns, { ownerId }, store)
  const worlds = new MockWorldApi(content, (worldId) => sessions.countByWorld(worldId))
  const cards = new MockCardApi(content)
  const providers = new MockProviderApi(store, scope)
  const assist = new MockAssistApi({ delayMs: overrides.assistDelayMs })

  return { auth, worlds, cards, sessions, turns, providers, assist }
}

export const api = createApi()
