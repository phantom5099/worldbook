import type { AssistRepository, AuthRepository, CardRepository, ProviderRepository, SessionRepository, SessionTransport, WorldRepository } from '@/repositories/types'
import { HttpSessionTransport } from './httpTransport'
import { MockAssistRepository } from '@/mocks/assistRepository'
import { MockAuthRepository } from '@/mocks/authRepository'
import { MockCardRepository, MockContentStore, MockWorldRepository } from '@/mocks/contentRepository'
import { MockProviderRepository } from '@/mocks/providerRepository'
import { MockSessionRepository } from '@/mocks/sessionRepository'
import { MockSessionTransport } from '@/mocks/transport'
import { MockStore } from '@/mocks/store'

export interface AppServices {
  auth: AuthRepository
  worlds: WorldRepository
  cards: CardRepository
  sessions: SessionRepository
  providers: ProviderRepository
  assist: AssistRepository
  transport: SessionTransport
}

export interface ServiceOverrides {
  store?: MockStore
  auth?: AuthRepository
  transport?: SessionTransport
  ownerId?: () => string | null
  assistDelayMs?: number
}

function defaultTransport(store: MockStore): SessionTransport {
  const mode = import.meta.env.VITE_SESSION_MODE ?? 'http'
  if (mode === 'mock') return new MockSessionTransport(store)
  return new HttpSessionTransport()
}

/**
 * 组合根：页面与状态层只依赖仓储接口。
 * 世界书、角色卡、账号、提供商与起草器当前没有后端接口，固定使用本地实现；
 * 会话、回合、历史与 SSE 默认连接真实后端，`VITE_SESSION_MODE=mock` 时切换到本地模拟。
 */
export function createServices(overrides: ServiceOverrides = {}): AppServices {
  const store = overrides.store ?? new MockStore()
  const auth = overrides.auth ?? new MockAuthRepository(store)
  const ownerId = overrides.ownerId ?? (() => auth.current()?.id ?? null)
  const scope = () => ownerId() ?? 'anonymous'
  const content = new MockContentStore(store, undefined, scope)
  const transport = overrides.transport ?? defaultTransport(store)
  const sessions = new MockSessionRepository(content, transport, { ownerId }, store)
  const worlds = new MockWorldRepository(content, (worldId) => sessions.countByWorld(worldId))
  const cards = new MockCardRepository(content)
  const providers = new MockProviderRepository(store, scope)
  const assist = new MockAssistRepository({ delayMs: overrides.assistDelayMs })

  return { auth, worlds, cards, sessions, providers, assist, transport }
}

export const services = createServices()
