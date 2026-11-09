import type {
  Card,
  RelationKey,
  SessionCast,
  SessionProtagonist,
  TraitGroup,
} from './types'

const AV_CLASSES = ['av-shen', 'av-su', 'av-lu', 'av-ruo', 'av-pei', 'av-han', 'av-ale', 'av-gu', 'av-lin', 'av-man', 'av-zhou']

const REL_LABELS: Record<string, RelationKey> = {
  信任: 'trust',
  好感: 'affection',
  恐惧: 'fear',
  尊重: 'respect',
}

export const RELATION_LABELS: Array<[RelationKey, string]> = [
  ['trust', '信任'],
  ['affection', '好感'],
  ['fear', '恐惧'],
  ['respect', '尊重'],
]

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  return hash
}

export function splitList(value: string): string[] {
  return value
    .split(/[、,，;；]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function buildTraitGroups(text: string): TraitGroup[] {
  const names = splitList(text).slice(0, 4)
  const core = names.length
    ? names.map((name, index) => [name, Number((0.88 - index * 0.08).toFixed(2))] as [string, number])
    : ([['待观察', 0.5]] as Array<[string, number]>)
  return [
    { key: 'core', label: 'core · 内核', hint: '锁定', items: core },
    { key: 'slow', label: 'slow · 慢变', hint: '按事件更新', items: [['待观察', 0.4]] },
    { key: 'mood', label: 'mood · 情绪', hint: '本轮', items: [['平静', 0.5]] },
  ]
}

export function avatarClassOf(name: string): string {
  return AV_CLASSES[hashString(name) % AV_CLASSES.length]!
}

export function defaultRelations(): Record<RelationKey, number> {
  return { trust: 0.2, affection: 0.2, fear: 0.1, respect: 0.25 }
}

export function toProtagonist(card: Card): SessionProtagonist {
  const relations = { ...defaultRelations(), ...card.initial?.relations }
  return {
    id: card.id,
    name: card.name,
    role: card.role,
    goal: card.goal,
    secret: card.secret,
    relation: card.relation,
    traitsText: card.traitsText,
    avatar: card.avatar,
    avatarClass: card.avatarClass,
    model: card.model,
    fallback: card.fallback,
    desc: card.desc,
    badge: card.badge,
    relations,
    traits: card.initial?.traits ?? buildTraitGroups(card.traitsText),
    state: card.initial?.state ?? `目标：${card.goal || '尚未明确'} · 心情：平静 · 位置：${card.role}`,
  }
}

export function toCast(card: Card): SessionCast {
  return {
    ...toProtagonist(card),
    moments: card.initial?.moments ?? [],
    knowledge: card.initial?.knowledge ?? [],
  }
}

export function relationKeyOf(label: string): RelationKey | undefined {
  return REL_LABELS[label]
}
