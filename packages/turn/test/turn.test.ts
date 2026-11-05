import { describe, expect, it } from 'vitest'
import { TurnAlreadyActiveError, TurnRegistry } from '../src/index.js'

describe('TurnRegistry', () => {
  it('claim 进入 running 并返回唯一 turnId', () => {
    const registry = new TurnRegistry()
    const a = registry.claim('s1')
    const b = registry.claim('s2')
    expect(a.turnId).not.toBe(b.turnId)
    expect(registry.getState('s1')).toEqual({ turnId: a.turnId, phase: 'running' })
    expect(registry.getState('s3')).toBeUndefined()
  })

  it('同一会话并发 claim 被拒绝，不同会话不受影响', () => {
    const registry = new TurnRegistry()
    registry.claim('s1')
    expect(() => registry.claim('s1')).toThrow(TurnAlreadyActiveError)
    expect(() => registry.claim('s2')).not.toThrow()
  })

  it('settle 将 reason 映射为终态并唤醒 wait', async () => {
    const registry = new TurnRegistry()
    const cases = [
      { reason: 'done', phase: 'completed' },
      { reason: 'max_steps', phase: 'completed' },
      { reason: 'interrupted', phase: 'cancelled' },
      { reason: 'error', phase: 'failed' },
    ] as const
    for (const { reason, phase } of cases) {
      const { turnId } = registry.claim('s1')
      const waitPromise = registry.wait(turnId)
      registry.settle(turnId, reason)
      await expect(waitPromise).resolves.toBe(reason)
      expect(registry.getState('s1')).toEqual({ turnId, phase, reason })
    }
  })

  it('settle 幂等：重复 settle 无副作用，终态以第一次为准', () => {
    const registry = new TurnRegistry()
    const { turnId } = registry.claim('s1')
    const waitPromise = registry.wait(turnId)
    registry.settle(turnId, 'done')
    expect(() => registry.settle(turnId, 'error')).not.toThrow()
    expect(registry.getState('s1')?.phase).toBe('completed')
    return expect(waitPromise).resolves.toBe('done')
  })

  it('settle 未知 turnId 无副作用', () => {
    const registry = new TurnRegistry()
    expect(() => registry.settle('no-such-turn', 'done')).not.toThrow()
  })

  it('settle 后同会话可再次 claim', () => {
    const registry = new TurnRegistry()
    const first = registry.claim('s1')
    registry.settle(first.turnId, 'done')
    const second = registry.claim('s1')
    expect(second.turnId).not.toBe(first.turnId)
  })

  it('wait 未知的 turnId 抛错', () => {
    const registry = new TurnRegistry()
    expect(() => registry.wait('no-such-turn')).toThrow(/unknown turn/)
  })
})
