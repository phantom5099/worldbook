import { describe, expect, it } from 'vitest'
import type { SessionEvent, SessionEventType } from '@worldbook/session'
import { foldSubagentStatus } from '../src/index.js'

function events(...items: [SessionEventType, unknown][]): SessionEvent[] {
  return items.map(([type, payload], index) => ({
    seq: index + 1,
    type,
    payload,
    createdAt: new Date(),
  }))
}

const ended = (reason: string): [SessionEventType, unknown] => [
  'turn_ended',
  { reason, steps: 1 },
]

describe('foldSubagentStatus', () => {
  it('无回合记录为 unknown', () => {
    expect(foldSubagentStatus([], false)).toBe('unknown')
    expect(foldSubagentStatus(events(['user_message', { text: 'x' }]), false)).toBe('unknown')
  })

  it('未结束回合：有活跃执行者为 running，否则为 interrupted', () => {
    const open = events(['turn_started', {}], ['assistant_message', { text: '半截' }])
    expect(foldSubagentStatus(open, true)).toBe('running')
    expect(foldSubagentStatus(open, false)).toBe('interrupted')
  })

  it('已结束回合按 reason 折叠，新一轮开始后覆盖上一轮终态', () => {
    expect(foldSubagentStatus(events(['turn_started', {}], ended('done')), false)).toBe('completed')
    expect(foldSubagentStatus(events(['turn_started', {}], ended('max_steps')), false)).toBe('completed')
    expect(foldSubagentStatus(events(['turn_started', {}], ended('error')), false)).toBe('failed')
    expect(foldSubagentStatus(events(['turn_started', {}], ended('interrupted')), false)).toBe('cancelled')
    expect(
      foldSubagentStatus(
        events(['turn_started', {}], ended('done'), ['turn_started', {}], ['assistant_message', { text: '再跑' }]),
        true,
      ),
    ).toBe('running')
  })
})
