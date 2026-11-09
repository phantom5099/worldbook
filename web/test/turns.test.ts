import { describe, expect, it } from 'vitest'
import type { SessionCast, SessionEvent } from '@/api/types'
import { applyNotes, foldTurns, mergeEvents, notesOfTurn, partsOfStep } from '@/api/turns'

function event(
  seq: number,
  type: SessionEvent['type'],
  payload: unknown,
): SessionEvent {
  return { seq, type, payload, createdAt: '2026-11-07T00:00:00.000Z' }
}

function castCard(overrides: Partial<SessionCast> = {}): SessionCast {
  return {
    id: 'card-shen',
    name: '沈砚',
    role: '守夜人',
    goal: '查清失踪的货船',
    secret: '',
    relation: '对陌生人保持警惕',
    traitsText: '谨慎',
    avatar: '砚',
    avatarClass: 'av-shen',
    model: 'A · narrative-x-32k',
    fallback: 'B · novel-z',
    relations: { trust: 0.9, affection: 0.2, fear: 0, respect: 0.5 },
    traits: [],
    state: '',
    moments: [],
    knowledge: [],
    ...overrides,
  }
}

describe('foldTurns', () => {
  const done: SessionEvent[] = [
    event(1, 'turn_started', { turnId: 't1' }),
    event(2, 'user_message', { text: '把信收进内袋。' }),
    event(3, 'assistant_message', {
      text: '雾更浓了。',
      parts: [{ type: 'p', text: '雾更浓了。' }],
      notes: [{ who: '沈砚', impression: '谨慎', deltas: [['信任', '+0.03', 'up']] }],
    }),
    event(4, 'turn_ended', { reason: 'done', steps: 1 }),
  ]

  it('把事件日志折叠为完成回合', () => {
    const turns = foldTurns(done)
    expect(turns).toHaveLength(1)
    expect(turns[0]?.round).toBe(1)
    expect(turns[0]?.action).toBe('把信收进内袋。')
    expect(turns[0]?.status).toBe('done')
    expect(turns[0]?.steps[0]?.text).toBe('雾更浓了。')
  })

  it('新回合开始时把旧回合标记为中断', () => {
    const turns = foldTurns([...done, event(5, 'turn_started', { turnId: 't2' })])
    expect(turns).toHaveLength(2)
    expect(turns[0]?.status).toBe('done')
    expect(turns[1]?.status).toBe('running')
  })

  it('没有 turn_started 时按 assistant_message 补一个回合', () => {
    const turns = foldTurns([event(1, 'assistant_message', { text: '开场' })])
    expect(turns).toHaveLength(1)
    expect(turns[0]?.round).toBe(1)
    expect(turns[0]?.status).toBe('running')
  })

  it('assistant_message 的 toolCalls 进入当前步骤', () => {
    const turns = foldTurns([
      event(1, 'turn_started', { turnId: 't1' }),
      event(2, 'assistant_message', { text: '我在查。', toolCalls: [{ name: 'search' }] }),
      event(3, 'turn_ended', { reason: 'done', steps: 1 }),
    ])
    expect(turns[0]?.steps[0]?.toolCalls).toEqual([{ name: 'search' }])
  })

  it('notesOfTurn 汇总所有步骤的状态变更', () => {
    const turns = foldTurns([
      ...done,
      event(5, 'turn_started', { turnId: 't2' }),
      event(6, 'assistant_message', {
        text: '第二轮',
        notes: [{ who: '沈砚', impression: '重新估量你', deltas: [['尊重', '+0.02', 'up']] }],
      }),
    ])
    expect(notesOfTurn(turns[1]!)).toHaveLength(1)
  })
})

describe('mergeEvents', () => {
  it('按 seq 去重并排序', () => {
    const merged = mergeEvents(
      [event(1, 'turn_started', { turnId: 't1' }), event(3, 'turn_ended', { reason: 'done', steps: 1 })],
      [event(3, 'turn_ended', { reason: 'interrupted', steps: 1 }), event(2, 'user_message', { text: '行动' })],
    )
    expect(merged.map((item) => item.seq)).toEqual([1, 2, 3])
    expect((merged[2]?.payload as { reason: string }).reason).toBe('interrupted')
  })
})

describe('applyNotes', () => {
  it('应用关系增量并夹在 0..1 之间', () => {
    const { cast, changes } = applyNotes(
      [castCard()],
      [
        {
          who: '沈砚',
          impression: '终于放下戒心',
          deltas: [
            ['信任', '+0.2', 'up'],
            ['好感', '-0.5', 'down'],
          ],
        },
      ],
      3,
    )
    expect(cast[0]?.relations.trust).toBe(1)
    expect(cast[0]?.relations.affection).toBe(0)
    expect(changes).toHaveLength(2)
    expect(changes[0]).toMatchObject({ who: '沈砚', label: '信任', value: '+0.2', direction: 'up' })
    expect(changes[0]?.reason).toContain('第 3 轮')
  })

  it('不修改原始快照', () => {
    const original = castCard()
    applyNotes([original], [{ who: '沈砚', impression: '变化', deltas: [['信任', '+0.1', 'up']] }], 1)
    expect(original.relations.trust).toBe(0.9)
  })

  it('忽略不认识的角色与标签', () => {
    const { cast, changes } = applyNotes(
      [castCard()],
      [
        {
          who: '路人',
          impression: '无记录',
          deltas: [
            ['信任', '+0.1', 'up'],
            ['未知' as never, '+0.1', 'up'],
          ],
        },
      ],
      1,
    )
    expect(cast[0]?.relations.trust).toBe(0.9)
    expect(changes).toHaveLength(1)
  })
})

describe('partsOfStep', () => {
  it('没有 parts 时退回纯文本', () => {
    expect(partsOfStep({ text: '一段叙述' })).toEqual([{ type: 'p', text: '一段叙述' }])
  })
})
