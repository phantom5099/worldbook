import { describe, expect, it } from 'vitest'
import { TurnAlreadyActiveError, TurnRegistry } from '../src/index.js'

function registryWith(lastTurnId: (sessionId: string) => number = () => 0): TurnRegistry {
  return new TurnRegistry({ lastTurnId: async (sessionId) => lastTurnId(sessionId) })
}

describe('TurnRegistry', () => {
  it('claim 进入 running，回合号接续持久化编号', async () => {
    const registry = registryWith((sessionId) => (sessionId === 's1' ? 41 : 0))
    const a = await registry.claim('s1')
    const b = await registry.claim('s2')
    expect(a.turnId).toBe(42)
    expect(b.turnId).toBe(1)
    expect(registry.getState('s1')).toEqual({ turnId: a.turnId, phase: 'running' })
    expect(registry.getState('s3')).toBeUndefined()
  })

  it('同一会话并发 claim 被拒绝，不同会话不受影响', async () => {
    const registry = registryWith()
    await registry.claim('s1')
    await expect(registry.claim('s1')).rejects.toThrow(TurnAlreadyActiveError)
    await expect(registry.claim('s2')).resolves.toMatchObject({ turnId: 1 })
  })

  it('settle 将 reason 映射为终态', async () => {
    const registry = registryWith()
    const cases = [
      { reason: 'done', phase: 'completed' },
      { reason: 'max_steps', phase: 'completed' },
      { reason: 'interrupted', phase: 'cancelled' },
      { reason: 'error', phase: 'failed' },
    ] as const
    for (const { reason, phase } of cases) {
      const { turnId } = await registry.claim('s1')
      registry.settle('s1', reason)
      expect(registry.getState('s1')).toEqual({ turnId, phase, reason })
    }
  })

  it('settle 幂等：重复 settle 无副作用，终态以第一次为准', async () => {
    const registry = registryWith()
    const { turnId } = await registry.claim('s1')
    registry.settle('s1', 'done')
    expect(() => registry.settle('s1', 'error')).not.toThrow()
    expect(registry.getState('s1')).toEqual({ turnId, phase: 'completed', reason: 'done' })
  })

  it('settle 无活跃会话无副作用', () => {
    const registry = registryWith()
    expect(() => registry.settle('no-such-session', 'done')).not.toThrow()
  })

  it('settle 后同会话可再次 claim，回合号递增', async () => {
    const registry = registryWith()
    const first = await registry.claim('s1')
    registry.settle('s1', 'done')
    const second = await registry.claim('s1')
    expect(second.turnId).toBe(first.turnId + 1)
  })
})
