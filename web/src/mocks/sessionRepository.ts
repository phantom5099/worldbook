import type {
  Card,
  CreateSessionInput,
  SessionSnapshot,
  SessionSummary,
  WorldDetail,
} from '@/api/types'
import { ApiError } from '@/api/errors'
import { newId } from '@/api/ids'
import { toCast, toProtagonist } from '@/api/normalize'
import type { SessionProgress, SessionRepository, SessionTransport } from '@/repositories/types'
import type { MockContentStore } from './contentRepository'
import { MockStore, clone } from './store'

interface SessionMeta {
  [key: string]: unknown
  title?: string
  worldId?: string
  worldName?: string
  unitIndex?: number
  protagonist?: unknown
  cast?: unknown[]
  opening?: unknown
  intents?: unknown[]
  threads?: unknown[]
}

/** 由世界书与角色卡生成会话快照。快照一旦建立就不随原卡变化。 */
export function snapshotOf(
  world: WorldDetail,
  protagonist: Card,
  castCards: readonly Card[],
): SessionSnapshot {
  return {
    world: {
      id: world.id,
      name: world.name,
      coverClass: world.coverClass,
      ...(world.scene ? { scene: world.scene } : {}),
    },
    protagonist: toProtagonist(protagonist),
    cast: castCards.map((card) => toCast(card)),
    threads: world.threads.map((thread) => ({ ...thread })),
    opening: clone(world.opening),
    intents: world.intents.map((intent) => ({ ...intent })),
    unit: { ...world.unit },
  }
}

function metaOf(session: SessionSummary): SessionMeta {
  return {
    title: session.title,
    worldId: session.snapshot.world.id,
    worldName: session.snapshot.world.name,
    unitIndex: session.unitIndex,
    protagonist: session.snapshot.protagonist,
    cast: session.snapshot.cast,
    opening: session.snapshot.opening,
    intents: session.snapshot.intents,
    threads: session.snapshot.threads,
  }
}

export interface MockSessionRepositoryOptions {
  ownerId: () => string | null
  now?: () => string
}

/**
 * 会话索引只存在于浏览器；真正的回合、历史与流仍走 `SessionTransport`。
 * 草稿不发请求，激活时才创建服务端会话。
 */
export class MockSessionRepository implements SessionRepository {
  private readonly now: () => string

  constructor(
    private readonly content: MockContentStore,
    private readonly transport: SessionTransport,
    private readonly options: MockSessionRepositoryOptions,
    private readonly store = new MockStore(),
  ) {
    this.now = options.now ?? (() => new Date().toISOString())
  }

  private key(): string {
    return `sessions:${this.options.ownerId() ?? 'anonymous'}`
  }

  private ensureSeeded(): SessionSummary[] {
    const key = this.key()
    if (this.store.has(key)) return this.store.read<SessionSummary[]>(key, [])
    const now = this.now()
    const seeds: Array<{ worldId: string; title: string }> = [
      { worldId: 'fog', title: '第七码头之夜' },
      { worldId: 'snow', title: '封山前的最后一夜' },
    ]
    const sessions: SessionSummary[] = []
    for (const seed of seeds) {
      const world = this.content.getWorld(seed.worldId)
      if (!world) continue
      const protagonist = world.defaultCardId ? this.content.getCard(world.defaultCardId) : undefined
      if (!protagonist) continue
      const castCards = this.content
        .listCards({ worldId: world.id })
        .filter((card) => card.id !== protagonist.id)
        .slice(0, 6)
      sessions.push({
        id: newId('sess'),
        title: seed.title,
        status: 'draft',
        snapshot: snapshotOf(world, protagonist, castCards),
        createdAt: now,
        updatedAt: now,
        unitIndex: 1,
        turnCount: 0,
        completed: false,
        changes: [],
      })
    }
    this.store.write(key, sessions)
    return sessions
  }

  private read(): SessionSummary[] {
    return clone(this.ensureSeeded())
  }

  private write(sessions: SessionSummary[]): void {
    this.store.write(this.key(), sessions)
  }

  private find(id: string): SessionSummary {
    const session = this.read().find((item) => item.id === id)
    if (!session) throw new ApiError(404, `会话 ${id} 不存在`)
    return session
  }

  async list(): Promise<SessionSummary[]> {
    return this.read().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async get(id: string): Promise<SessionSummary | undefined> {
    return this.read().find((item) => item.id === id)
  }

  async getByServerId(serverId: string): Promise<SessionSummary | undefined> {
    return this.read().find((item) => item.serverId === serverId)
  }

  countByWorld(worldId: string): number {
    return this.read().filter((item) => item.snapshot.world.id === worldId).length
  }

  async create(input: CreateSessionInput): Promise<SessionSummary> {
    const title = input.title.trim()
    if (!title) throw new ApiError(400, '会话名不能为空')
    const now = this.now()
    const session: SessionSummary = {
      id: newId('sess'),
      title: title.slice(0, 40),
      status: input.status,
      snapshot: clone(input.snapshot),
      createdAt: now,
      updatedAt: now,
      unitIndex: 1,
      turnCount: 0,
      completed: false,
      changes: [],
    }

    if (input.status === 'active') {
      const { sessionId } = await this.transport.create(metaOf(session))
      session.serverId = sessionId
    }

    const sessions = this.read()
    sessions.unshift(session)
    this.write(sessions)
    return clone(session)
  }

  async update(
    id: string,
    patch: Partial<Pick<SessionSummary, 'title' | 'snapshot'>>,
  ): Promise<SessionSummary> {
    const sessions = this.read()
    const session = sessions.find((item) => item.id === id)
    if (!session) throw new ApiError(404, `会话 ${id} 不存在`)
    if (patch.title !== undefined) {
      const title = patch.title.trim()
      if (!title) throw new ApiError(400, '会话名不能为空')
      session.title = title.slice(0, 40)
    }
    if (patch.snapshot !== undefined) session.snapshot = clone(patch.snapshot)
    session.updatedAt = this.now()
    this.write(sessions)
    return clone(session)
  }

  async activate(id: string): Promise<SessionSummary> {
    const sessions = this.read()
    const session = sessions.find((item) => item.id === id)
    if (!session) throw new ApiError(404, `会话 ${id} 不存在`)
    if (!session.serverId) {
      const { sessionId } = await this.transport.create(metaOf(session))
      session.serverId = sessionId
    }
    session.status = 'active'
    session.updatedAt = this.now()
    this.write(sessions)
    return clone(session)
  }

  async startUnit(id: string): Promise<SessionSummary> {
    const sessions = this.read()
    const session = sessions.find((item) => item.id === id)
    if (!session) throw new ApiError(404, `会话 ${id} 不存在`)
    session.unitIndex += 1
    session.turnCount = 0
    session.completed = false
    session.changes = []
    const { sessionId } = await this.transport.create(metaOf(session))
    session.serverId = sessionId
    session.updatedAt = this.now()
    this.write(sessions)
    return clone(session)
  }

  async markProgress(id: string, progress: SessionProgress): Promise<SessionSummary> {
    const sessions = this.read()
    const session = sessions.find((item) => item.id === id)
    if (!session) throw new ApiError(404, `会话 ${id} 不存在`)
    if (progress.unitIndex !== undefined) session.unitIndex = progress.unitIndex
    if (progress.turnCount !== undefined) session.turnCount = progress.turnCount
    if (progress.completed !== undefined) session.completed = progress.completed
    if (progress.changes !== undefined) session.changes = clone(progress.changes)
    session.updatedAt = this.now()
    this.write(sessions)
    return clone(session)
  }

  async remove(id: string): Promise<void> {
    const sessions = this.read()
    const next = sessions.filter((item) => item.id !== id)
    if (next.length === sessions.length) throw new ApiError(404, `会话 ${id} 不存在`)
    this.write(next)
  }
}
