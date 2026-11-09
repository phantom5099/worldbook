import { describe, expect, it } from 'vitest'
import { foldTurnState, TurnAlreadyActiveError, TurnRegistry } from '../src/index.js'

function registryWith(
  lastTurnId: (sessionId: string) => number = () => 0,
  maxEntries?: number,
): TurnRegistry {
  return new TurnRegistry(
    { lastTurnId: async (sessionId) => lastTurnId(sessionId) },
    maxEntries === undefined ? {} : { maxEntries },
  )
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

  it('终态快照超过上限时淘汰最久未用的会话', async () => {
    const registry = registryWith(undefined, 2)
    for (const sessionId of ['s1', 's2', 's3']) {
      await registry.claim(sessionId)
      registry.settle(sessionId, 'done')
    }
    expect(registry.getState('s1')).toBeUndefined()
    expect(registry.getState('s2')).toBeDefined()
    expect(registry.getState('s3')).toBeDefined()
  })

  it('再次 claim 刷新最近使用序，淘汰最久未用的终态快照', async () => {
    const registry = registryWith(undefined, 2)
    await registry.claim('s1')
    registry.settle('s1', 'done')
    await registry.claim('s2')
    registry.settle('s2', 'done')
    await registry.claim('s1')
    registry.settle('s1', 'done')
    await registry.claim('s3')
    registry.settle('s3', 'done')

    expect(registry.getState('s2')).toBeUndefined()
    expect(registry.getState('s1')).toBeDefined()
    expect(registry.getState('s3')).toBeDefined()
  })

  it('settle 刷新最近使用序，从中间移到链尾后不被优先淘汰', async () => {
    const registry = registryWith(undefined, 3)
    await registry.claim('s1')
    await registry.claim('s2')
    registry.settle('s2', 'done')
    await registry.claim('s3')
    registry.settle('s3', 'done')
    await registry.claim('s4')
    registry.settle('s1', 'done')

    expect(registry.getState('s1')).toBeDefined()
    expect(registry.getState('s2')).toBeUndefined()
    expect(registry.getState('s3')).toBeDefined()
    expect(registry.getState('s4')).toBeDefined()
  })

  it('running 快照不参与淘汰，即使终态已超上限', async () => {
    const registry = registryWith(undefined, 1)
    await registry.claim('r1')
    await registry.claim('r2')
    await registry.claim('t')
    registry.settle('t', 'done')

    expect(registry.getState('r1')).toBeDefined()
    expect(registry.getState('r2')).toBeDefined()
    expect(registry.getState('t')).toBeUndefined()
  })

  it('被淘汰的会话再次 claim 时由编号来源恢复回合号', async () => {
    let persisted = 0
    const registry = registryWith(() => persisted, 1)
    await registry.claim('s1')
    registry.settle('s1', 'done')
    persisted = 5
    await registry.claim('s2')
    registry.settle('s2', 'done')

    expect(registry.getState('s1')).toBeUndefined()
    await expect(registry.claim('s1')).resolves.toEqual({ turnId: 6 })
  })
})

describe('foldTurnState', () => {
  const started = { type: 'turn_started', payload: {} }
  const ended = (reason: unknown) => ({ type: 'turn_ended', payload: { reason, steps: 1 } })

  it('无回合记录为 unknown', () => {
    expect(foldTurnState([], false)).toEqual({ phase: 'unknown' })
    expect(foldTurnState([{ type: 'user_message', payload: { text: 'x' } }], false)).toEqual({
      phase: 'unknown',
    })
  })

  it('有活跃执行者即为 running，覆盖日志中的旧终态', () => {
    expect(foldTurnState([started], true)).toEqual({ phase: 'running' })
    expect(foldTurnState([started, ended('done')], true)).toEqual({ phase: 'running' })
  })

  it('未闭合且无执行者折叠为 cancelled', () => {
    expect(
      foldTurnState([started, { type: 'assistant_message', payload: { text: '半截' } }], false),
    ).toEqual({ phase: 'cancelled' })
  })

  it('已结束回合按 reason 折叠并保留 reason', () => {
    expect(foldTurnState([started, ended('done')], false)).toEqual({
      phase: 'completed',
      reason: 'done',
    })
    expect(foldTurnState([started, ended('max_steps')], false)).toEqual({
      phase: 'completed',
      reason: 'max_steps',
    })
    expect(foldTurnState([started, ended('interrupted')], false)).toEqual({
      phase: 'cancelled',
      reason: 'interrupted',
    })
    expect(foldTurnState([started, ended('error')], false)).toEqual({
      phase: 'failed',
      reason: 'error',
    })
    expect(foldTurnState([started, ended('bogus')], false)).toEqual({
      phase: 'failed',
      reason: 'error',
    })
  })
})
