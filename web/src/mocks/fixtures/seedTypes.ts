import type {
  Knowledge,
  Moment,
  NarrativePart,
  RelationKey,
  StateNote,
  ThreadSeed,
  TraitGroup,
  WorldOpening,
  WorldUnit,
} from '@/api/types'

export interface SeedCard {
  id?: string
  name: string
  role: string
  goal: string
  secret?: string
  relation: string
  traitsText?: string
  traits?: TraitGroup[]
  model: string
  fallback: string
  avatar: string
  avatarClass: string
  badge?: string
  desc?: string
  state?: string
  relations?: Partial<Record<RelationKey, number>>
  moments?: Moment[]
  knowledge?: Knowledge[]
}

export interface SeedIntent {
  key: string
  tone: string
  title: string
  hint: string
  action: string
  ai: NarrativePart[]
  notes: StateNote[]
}

export interface SeedWorld {
  id: string
  name: string
  preset: boolean
  badge: string
  genre: string
  coverClass: string
  scene?: string
  hook: string
  rules: string
  factions: string
  conflict: string
  bans: string
  tags: string[]
  defaultCard: SeedCard
  facts?: string[]
  unit: WorldUnit
  opening: WorldOpening
  intents: SeedIntent[]
  threads: ThreadSeed[]
  cards: SeedCard[]
}

export type SeedWorldMap = Record<string, SeedWorld>
