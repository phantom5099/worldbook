import type { CreateCardInput, CreateWorldInput } from '@/api/types'
import type { AssistMessage, AssistRepository } from '@/repositories/types'

const AI_BANS = '不出现真实宗教与真实人物；不写未成年人恋爱；不提供现实可执行的危险细节。'
const AI_TRAITS = [
  '冷静', '谨慎', '温柔', '暴躁', '怕冷', '记仇', '护短', '寡言', '健谈', '好奇',
  '守时', '失眠', '敏锐', '嘴硬', '耐心', '克制', '多疑', '孤僻', '果断', '善良',
]

function hasAny(text: string, ...words: string[]): boolean {
  return words.some((word) => text.includes(word))
}

function pickedName(text: string, fallbackName: string): string {
  const quoted = text.match(/[《「“"]([^》」”"]{2,12})[》」”"]/)
  if (quoted?.[1]) return quoted[1].trim()
  const named = text.match(/(?:叫做|叫|名为|名字是)\s*([\u4e00-\u9fa5A-Za-z0-9]{2,10})/)
  if (named?.[1]) return named[1]
  return fallbackName
}

type WorldDraft = Partial<CreateWorldInput> & { rules?: string }

export function worldDraft(messages: readonly AssistMessage[], previous?: WorldDraft): WorldDraft {
  const text = messages.map((message) => message.text).join(' ')
  let draft: WorldDraft
  if (hasAny(text, '海', '港', '潮', '船', '岛', '灯塔', '渡口')) {
    draft = {
      name: '落潮港',
      genre: '航海 · 悬疑 · 低魔',
      hook: '一座每天退潮后都会多出一条街的港口城市。',
      rules: '潮汐决定城市的形状：退潮时出现的街道会在下一次涨潮时消失；从消失街区带走的东西却会留下。',
    }
  } else if (hasAny(text, '雪', '山', '冬', '寒', '岭', '封山')) {
    draft = {
      name: '雪岭驿',
      genre: '山野 · 生存 · 民俗',
      hook: '封山前的最后一夜，雪线会带走一个被遗忘的名字。',
      rules: '严寒会放大饥饿与猜疑；火与盐是少数能驱散异常的东西；说出口的承诺不能收回。',
    }
  } else if (hasAny(text, '林', '森', '村', '庙', '灯', '祭祀')) {
    draft = {
      name: '林灯村',
      genre: '民俗 · 悬疑 · 低魔',
      hook: '村里的灯只在有人失踪时亮起。',
      rules: '灯灭之前必须有人说出一个真实的名字；森林不接受谎言；被灯照到的人会忘记一件重要的事。',
    }
  } else if (hasAny(text, '星', '太空', '舰', '机械', '赛博', '未来', '飞船', '殖民地')) {
    draft = {
      name: '寂静环',
      genre: '科幻 · 悬疑 · 密闭',
      hook: '一座环绕死星的殖民站，每天都在收到来自自己的求救信号。',
      rules: '技术必须付出能量或记忆作为代价；真空与舱门不会为剧情让步；AI 不能凭空知道舱外发生的事。',
    }
  } else if (hasAny(text, '沙', '漠', '商队', '驿', '公路')) {
    draft = {
      name: '白沙驿',
      genre: '荒漠 · 公路 · 悬疑',
      hook: '沙暴过后，驿站门口多了一队没有影子的商旅。',
      rules: '水比钱重要；沙暴会抹去道路与脚印；每个商队都带着一件不能打开的东西。',
    }
  } else if (hasAny(text, '城', '街', '巷', '雾', '夜', '记忆')) {
    draft = {
      name: '无央城',
      genre: '都市 · 悬疑 · 低魔',
      hook: '一座地图会在夜里改写的城市，没有人记得原来的路。',
      rules: '地名只在被说出口时存在；记忆可以交易，但价格由对方决定；城市不会强迫任何人留下。',
    }
  } else {
    draft = {
      ...(previous ?? {}),
      name: previous?.name ?? '无央城',
      genre: previous?.genre ?? '悬疑 · 低魔 · 开放世界',
      hook: previous?.hook ?? '一座地图会在夜里改写的城市，没有人记得原来的路。',
      rules: previous?.rules ?? '地名只在被说出口时存在；记忆可以交易，但价格由对方决定；城市不会强迫任何人留下。',
    }
  }

  if (hasAny(text, '黑暗', '残酷', '绝望', '压抑', '克苏鲁', '恐怖')) {
    const darkRule = '基调偏冷峻；每次选择都应有可见代价。'
    if (!draft.rules?.includes(darkRule)) draft.rules = `${draft.rules ?? ''} ${darkRule}`.trim()
  } else if (hasAny(text, '温暖', '治愈', '轻松', '日常', '幽默')) {
    const warmRule = '冲突留有和解出口，避免不可逆的伤害。'
    if (!draft.rules?.includes(warmRule)) draft.rules = `${draft.rules ?? ''} ${warmRule}`.trim()
  }

  draft.name = pickedName(text, draft.name ?? '无央城')
  draft.bans = AI_BANS
  return draft
}

type CardDraft = Partial<CreateCardInput>

export function cardDraft(messages: readonly AssistMessage[], previous?: CardDraft): CardDraft {
  const text = messages.map((message) => message.text).join(' ')
  let draft: CardDraft & { traits?: string }
  if (hasAny(text, '商', '账房', '货', '钱', '买卖')) {
    draft = hasAny(text, '海', '港', '船', '渡')
      ? {
          name: '韩渡',
          role: '商船账房 · 落潮渡口',
          goal: '查清货单上不存在的那批货',
          secret: '东家的遗书在你手里',
          traits: '谨慎、怕冷、算得清',
          relation: '对码头管事半信半疑',
        }
      : {
          name: '韩渡',
          role: '商队账房 · 南边来',
          goal: '把商队和货完整带过雪岭',
          secret: '货箱里藏着一封东家的遗书',
          traits: '谨慎、怕冷、算得清',
          relation: '对守夜人半信半疑',
        }
  } else if (hasAny(text, '调查', '侦探', '案', '线索', '失踪', '警')) {
    draft = {
      name: '陆见',
      role: '临时调查员 · 码头档案室',
      goal: '在下一桩失踪案发生前找到规律',
      secret: '你认识第一个失踪者，却没有上报',
      traits: '冷静、多疑、守时',
      relation: '对守夜人半信半疑',
    }
  } else if (hasAny(text, '海', '船', '港', '渡', '潮')) {
    draft = {
      name: '顾潮',
      role: '退役领航员 · 落潮渡口',
      goal: '查清十年前失踪的货船',
      secret: '那晚是你改了航标灯',
      traits: '克制、记路、失眠',
      relation: '对港口老人保持警惕',
    }
  } else if (hasAny(text, '医', '药', '伤', '病', '治疗')) {
    draft = {
      name: '闻栀',
      role: '游方医者 · 西市药棚',
      goal: '找到压制怪病的药方',
      secret: '你曾因误诊失去一个病人',
      traits: '温和、敏锐、嘴硬',
      relation: '对同行保持距离',
    }
  } else if (hasAny(text, '雪', '山', '猎', '灯', '守')) {
    draft = {
      name: '阿勒',
      role: '守灯人 · 雪线以北',
      goal: '让山口的灯烧到天亮',
      secret: '你见过灯灭之后的东西',
      traits: '寡言、耐寒、认死理',
      relation: '对过路人先观察再开口',
    }
  } else if (hasAny(text, '梦', '巫', '通灵', '神', '预兆')) {
    draft = {
      name: '苏晚',
      role: '药铺掌柜 · 城中',
      goal: '找到梦里反复出现的那口井',
      secret: '你能听见别人遗忘的名字',
      traits: '温柔、敏锐、守口',
      relation: '对陌生人的梦格外在意',
    }
  } else {
    draft = {
      ...(previous ?? {}),
      name: previous?.name ?? '宁川',
      role: previous?.role ?? '初到此地的旅人',
      goal: previous?.goal ?? '找到一封没有署名的信的主人',
      secret: previous?.secret ?? '你记得一段不属于自己的过去',
      traits: previous?.traitsText ?? '谨慎、善于观察、嘴硬',
      relation: previous?.relation ?? '对当地人保持距离',
    }
  }

  const picked = AI_TRAITS.filter((word) => text.includes(word)).slice(0, 4)
  if (picked.length) {
    const existing = (draft.traits ?? draft.traitsText ?? '').split('、').filter(Boolean)
    draft.traitsText = [...new Set([...picked, ...existing])].slice(0, 4).join('、')
  } else if (draft.traits) {
    draft.traitsText = draft.traits
  }
  delete draft.traits
  draft.name = pickedName(text, draft.name ?? '宁川')
  return draft
}

export interface MockAssistOptions {
  delayMs?: number
}

/** 本地起草器：只整理可编辑的草稿，不产生叙事内容。 */
export class MockAssistRepository implements AssistRepository {
  private readonly delayMs: number

  constructor(options: MockAssistOptions = {}) {
    this.delayMs = options.delayMs ?? 420
  }

  private async wait(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs))
  }

  async worldDraft(
    messages: AssistMessage[],
    previous?: Partial<CreateWorldInput>,
  ): Promise<Partial<CreateWorldInput>> {
    await this.wait()
    return worldDraft(messages, previous)
  }

  async cardDraft(
    messages: AssistMessage[],
    previous?: Partial<CreateCardInput>,
  ): Promise<Partial<CreateCardInput>> {
    await this.wait()
    return cardDraft(messages, previous)
  }
}
