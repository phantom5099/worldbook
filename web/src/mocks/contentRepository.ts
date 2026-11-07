import type {
  Card,
  CreateCardInput,
  CreateWorldInput,
  IntentSuggestion,
  SessionCast,
  SessionProtagonist,
  WorldDetail,
  WorldSummary,
} from '@/api/types'
import { ApiError } from '@/api/errors'
import { avatarClassOf, buildTraitGroups, toCast, toProtagonist } from '@/api/normalize'
import { newId } from '@/api/ids'
import { GENERIC_CARD_SEEDS } from './fixtures/genericCards'
import { WORLD_SEEDS } from './fixtures/worlds'
import type { SeedCard, SeedWorld } from './fixtures/seedTypes'
import type { CardPatch, CardRepository, WorldRepository } from '@/repositories/types'
import { MockStore, clone } from './store'

interface ContentState {
  worlds: WorldDetail[]
  cards: Card[]
}

const CONTENT_KEY = 'content'

function requireText(value: string | undefined, label: string): string {
  const text = (value ?? '').trim()
  if (!text) throw new ApiError(400, `${label}不能为空`)
  return text
}
function seedTraitsText(seed: SeedCard): string {
  if (seed.traitsText) return seed.traitsText
  const names: string[] = []
  for (const group of seed.traits ?? []) {
    for (const item of group.items) {
      const name = item[0]
      if (name && !['待观察', '平静'].includes(name) && !names.includes(name)) names.push(name)
    }
  }
  return names.slice(0, 5).join('、')
}

function cardFromSeed(seed: SeedCard, id: string, worldId: string | null, now: string): Card {
  const hasInitial =
    seed.traits !== undefined ||
    seed.relations !== undefined ||
    seed.moments !== undefined ||
    seed.knowledge !== undefined ||
    seed.state !== undefined
  return {
    id,
    worldId,
    name: seed.name,
    role: seed.role,
    goal: seed.goal,
    secret: seed.secret ?? '',
    relation: seed.relation,
    traitsText: seedTraitsText(seed),
    avatar: seed.avatar || seed.name.slice(0, 1),
    avatarClass: seed.avatarClass || avatarClassOf(seed.name),
    model: seed.model,
    fallback: seed.fallback,
    ...(seed.desc ? { desc: seed.desc } : {}),
    ...(seed.badge ? { badge: seed.badge } : {}),
    ...(hasInitial
      ? {
          initial: {
            ...(seed.relations ? { relations: seed.relations } : {}),
            ...(seed.traits ? { traits: seed.traits } : {}),
            ...(seed.moments ? { moments: seed.moments } : {}),
            ...(seed.knowledge ? { knowledge: seed.knowledge } : {}),
            ...(seed.state ? { state: seed.state } : {}),
          },
        }
      : {}),
    createdAt: now,
    updatedAt: now,
  }
}

function intentsOf(seed: SeedWorld): IntentSuggestion[] {
  return seed.intents.map((intent) => ({
    key: intent.key,
    tone: intent.tone,
    title: intent.title,
    hint: intent.hint,
    action: intent.action,
  }))
}

function worldFromSeed(seed: SeedWorld, cards: Card[], now: string): WorldDetail {
  return {
    id: seed.id,
    name: seed.name,
    preset: seed.preset,
    badge: seed.badge,
    genre: seed.genre,
    coverClass: seed.coverClass,
    ...(seed.scene ? { scene: seed.scene } : {}),
    hook: seed.hook,
    rules: seed.rules,
    factions: seed.factions,
    conflict: seed.conflict,
    bans: seed.bans,
    tags: [...seed.tags],
    facts: [...(seed.facts ?? [])],
    defaultCardId: cards[0]?.id ?? null,
    unit: { ...seed.unit },
    opening: clone(seed.opening),
    intents: intentsOf(seed),
    threads: seed.threads.map((thread) => ({ ...thread })),
    createdAt: now,
    updatedAt: now,
  }
}

export function genericIntents(worldName: string, lead = '当地人'): IntentSuggestion[] {
  return [
    {
      key: 'cautious',
      tone: '谨慎',
      title: '先留在原地，观察周围的变化',
      hint: `不惊动${lead}；可能错过短暂的机会。`,
      action: '留在原地，先观察周围的变化。',
    },
    {
      key: 'direct',
      tone: '直率',
      title: '直接问这里发生了什么',
      hint: `会暴露你一无所知；${lead}可能被迫表态。`,
      action: '直接问这里发生了什么。',
    },
    {
      key: 'risk',
      tone: '冒险',
      title: '越过界线，去看没人愿意提的地方',
      hint: '会离开当前场景；可能触发这条世界线的核心矛盾。',
      action: '越过界线，去看没人愿意提的地方。',
    },
  ].map((intent) => ({ ...intent, hint: intent.hint.replace('这里', worldName) }))
}

function seedContent(now: string): ContentState {
  const worlds: WorldDetail[] = []
  const cards: Card[] = []

  for (const seed of Object.values(WORLD_SEEDS)) {
    const defaultId = `card-${seed.id}-default`
    const worldCards: Card[] = [
      cardFromSeed(seed.defaultCard, defaultId, seed.id, now),
      ...seed.cards.map((card, index) => cardFromSeed(card, card.id ?? `${seed.id}-card-${index + 1}`, seed.id, now)),
    ]
    cards.push(...worldCards)
    worlds.push(worldFromSeed(seed, worldCards, now))
  }

  for (const seed of GENERIC_CARD_SEEDS) {
    cards.push(cardFromSeed(seed, seed.id ?? newId('card'), null, now))
  }

  return { worlds, cards }
}

export class MockContentStore {
  constructor(
    private readonly store: MockStore,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly scope: () => string = () => 'anonymous',
  ) {}

  private key(): string {
    return `${CONTENT_KEY}:${this.scope()}`
  }

  ensureSeeded(): void {
    if (!this.store.has(this.key())) this.store.write(this.key(), seedContent(this.now()))
  }

  private read(): ContentState {
    this.ensureSeeded()
    return this.store.read<ContentState>(this.key(), { worlds: [], cards: [] })
  }

  private write(state: ContentState): void {
    this.store.write(this.key(), state)
  }

  listWorlds(): WorldDetail[] {
    return clone(this.read().worlds)
  }

  getWorld(id: string): WorldDetail | undefined {
    return clone(this.read().worlds.find((world) => world.id === id))
  }

  listCards(filter?: { worldId?: string | null }): Card[] {
    const cards = this.read().cards
    if (!filter || filter.worldId === undefined) return clone(cards)
    return clone(cards.filter((card) => card.worldId === filter.worldId))
  }

  getCard(id: string): Card | undefined {
    return clone(this.read().cards.find((card) => card.id === id))
  }

  createWorld(input: CreateWorldInput): WorldDetail {
    const state = this.read()
    const name = requireText(input.name, '世界名')
    const hook = requireText(input.hook, '一句话内核')
    const now = this.now()
    const world: WorldDetail = {
      id: newId('world'),
      name,
      badge: '自建',
      genre: input.genre?.trim() || '未分类',
      coverClass: 'cover-generic',
      hook,
      rules: input.rules ?? '',
      factions: input.factions ?? '',
      conflict: input.conflict ?? '',
      bans: input.bans ?? '',
      tags: input.tags ?? [],
      facts: [],
      defaultCardId: null,
      unit: { index: '第一单元', title: name, meta: '未命名场景' },
      opening: {
        place: '未命名场景',
        time: '第一幕',
        parts: [{ type: 'p', text: '故事从一片尚未命名的空白开始。' }],
      },
      intents: genericIntents(name),
      threads: [],
      createdAt: now,
      updatedAt: now,
    }
    state.worlds.unshift(world)
    this.write(state)
    return clone(world)
  }

  updateWorld(id: string, patch: Partial<CreateWorldInput>): WorldDetail {
    const state = this.read()
    const world = state.worlds.find((item) => item.id === id)
    if (!world) throw new ApiError(404, `世界书 ${id} 不存在`)
    if (patch.name !== undefined) world.name = requireText(patch.name, '世界名')
    if (patch.genre !== undefined) world.genre = patch.genre.trim() || '未分类'
    if (patch.hook !== undefined) world.hook = requireText(patch.hook, '一句话内核')
    if (patch.rules !== undefined) world.rules = patch.rules
    if (patch.factions !== undefined) world.factions = patch.factions
    if (patch.conflict !== undefined) world.conflict = patch.conflict
    if (patch.bans !== undefined) world.bans = patch.bans
    if (patch.tags !== undefined) world.tags = [...patch.tags]
    if (patch.hook !== undefined) world.unit.title = world.name
    world.updatedAt = this.now()
    this.write(state)
    return clone(world)
  }

  removeWorld(id: string): void {
    const state = this.read()
    const index = state.worlds.findIndex((world) => world.id === id)
    if (index < 0) throw new ApiError(404, `世界书 ${id} 不存在`)
    state.worlds.splice(index, 1)
    state.cards = state.cards.filter((card) => card.worldId !== id)
    this.write(state)
  }

  setDefaultCard(worldId: string, cardId: string | null): void {
    const state = this.read()
    const world = state.worlds.find((item) => item.id === worldId)
    if (!world) throw new ApiError(404, `世界书 ${worldId} 不存在`)
    if (cardId !== null) {
      const card = state.cards.find((item) => item.id === cardId)
      if (!card || card.worldId !== worldId) throw new ApiError(400, '默认主角必须属于该世界书')
    }
    world.defaultCardId = cardId
    world.updatedAt = this.now()
    this.write(state)
  }

  createCard(input: CreateCardInput): Card {
    const state = this.read()
    const name = requireText(input.name, '姓名')
    if (input.worldId !== null && !state.worlds.some((world) => world.id === input.worldId)) {
      throw new ApiError(404, `世界书 ${input.worldId} 不存在`)
    }
    const now = this.now()
    const card: Card = {
      id: newId('card'),
      worldId: input.worldId,
      name,
      role: input.role?.trim() || '身份未定',
      goal: input.goal?.trim() || '',
      secret: input.secret?.trim() || '',
      relation: input.relation?.trim() || '初次见面',
      traitsText: input.traitsText?.trim() || '',
      avatar: name.slice(0, 1),
      avatarClass: avatarClassOf(name),
      model: input.model?.trim() || 'A · narrative-x-32k',
      fallback: input.fallback?.trim() || 'B · novel-z',
      ...(input.desc ? { desc: input.desc } : {}),
      badge: input.badge ?? (input.worldId ? '模板' : '通用'),
      createdAt: now,
      updatedAt: now,
    }
    state.cards.push(card)
    if (input.worldId) {
      const world = state.worlds.find((item) => item.id === input.worldId)
      if (world && !world.defaultCardId) world.defaultCardId = card.id
    }
    this.write(state)
    return clone(card)
  }

  updateCard(id: string, patch: CardPatch): Card {
    const state = this.read()
    const card = state.cards.find((item) => item.id === id)
    if (!card) throw new ApiError(404, `角色卡 ${id} 不存在`)
    if (patch.name !== undefined) card.name = requireText(patch.name, '姓名')
    if (patch.role !== undefined) card.role = patch.role
    if (patch.goal !== undefined) card.goal = patch.goal
    if (patch.secret !== undefined) card.secret = patch.secret
    if (patch.relation !== undefined) card.relation = patch.relation
    if (patch.traitsText !== undefined) card.traitsText = patch.traitsText
    if (patch.avatar !== undefined) card.avatar = patch.avatar
    if (patch.avatarClass !== undefined) card.avatarClass = patch.avatarClass
    if (patch.model !== undefined) card.model = patch.model
    if (patch.fallback !== undefined) card.fallback = patch.fallback
    if (patch.desc !== undefined) card.desc = patch.desc
    if (patch.badge !== undefined) card.badge = patch.badge
    if (patch.initial !== undefined) card.initial = patch.initial
    card.updatedAt = this.now()
    this.write(state)
    return clone(card)
  }

  removeCard(id: string): void {
    const state = this.read()
    const index = state.cards.findIndex((card) => card.id === id)
    if (index < 0) throw new ApiError(404, `角色卡 ${id} 不存在`)
    const card = state.cards[index]!
    if (card.worldId) {
      const world = state.worlds.find((item) => item.id === card.worldId)
      if (world?.defaultCardId === id) throw new ApiError(409, '不能删除世界书的默认主角卡')
    }
    state.cards.splice(index, 1)
    this.write(state)
  }

  protagonist(cardId: string): SessionProtagonist | undefined {
    const card = this.getCard(cardId)
    return card ? toProtagonist(card) : undefined
  }

  cast(cardId: string): SessionCast | undefined {
    const card = this.getCard(cardId)
    return card ? toCast(card) : undefined
  }
}

export class MockWorldRepository implements WorldRepository {
  constructor(private readonly content: MockContentStore, private readonly sessionCount: (worldId: string) => number = () => 0) {}

  async list(): Promise<WorldSummary[]> {
    const worlds = this.content.listWorlds()
    return worlds.map((world) => ({
      id: world.id,
      name: world.name,
      genre: world.genre,
      coverClass: world.coverClass,
      ...(world.badge ? { badge: world.badge } : {}),
      tags: [...world.tags],
      defaultCardId: world.defaultCardId,
      cardCount: this.content.listCards({ worldId: world.id }).length,
      sessionCount: this.sessionCount(world.id),
      updatedAt: world.updatedAt,
    }))
  }

  async get(id: string): Promise<WorldDetail | undefined> {
    return this.content.getWorld(id)
  }

  async create(input: CreateWorldInput): Promise<WorldDetail> {
    const world = this.content.createWorld(input)
    const card = this.content.createCard({
      worldId: world.id,
      name: '未命名主角',
      role: '身份未定',
      goal: '尚未明确',
      relation: '初次见面',
      traitsText: '待观察',
    })
    this.content.setDefaultCard(world.id, card.id)
    return this.content.getWorld(world.id)!
  }

  async update(id: string, patch: Partial<CreateWorldInput>): Promise<WorldDetail> {
    return this.content.updateWorld(id, patch)
  }

  async remove(id: string): Promise<void> {
    this.content.removeWorld(id)
  }
}

export class MockCardRepository implements CardRepository {
  constructor(private readonly content: MockContentStore) {}

  async list(filter?: { worldId?: string | null }): Promise<Card[]> {
    return this.content.listCards(filter)
  }

  async get(id: string): Promise<Card | undefined> {
    return this.content.getCard(id)
  }

  async create(input: CreateCardInput): Promise<Card> {
    return this.content.createCard(input)
  }

  async update(id: string, patch: CardPatch): Promise<Card> {
    return this.content.updateCard(id, patch)
  }

  async remove(id: string): Promise<void> {
    this.content.removeCard(id)
  }
}

export function traitsFromText(text: string) {
  return buildTraitGroups(text)
}
