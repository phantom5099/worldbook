import { describe, expect, it } from 'vitest'
import { MemoryStorage, MockStore } from '@/mocks/store'
import { MockContentStore } from '@/mocks/contentRepository'
import { MockSessionRepository, snapshotOf } from '@/mocks/sessionRepository'
import { MockSessionTransport } from '@/mocks/transport'

const NOW = '2026-11-07T09:00:00.000Z'

function setup(owner = 'user-a') {
  const store = new MockStore(new MemoryStorage())
  const content = new MockContentStore(store, () => NOW, () => owner)
  const transport = new MockSessionTransport(store, { delayMs: 1 })
  const repo = new MockSessionRepository(content, transport, { ownerId: () => owner, now: () => NOW }, store)
  return { store, content, transport, repo }
}

function snapshot(ctx: ReturnType<typeof setup>) {
  const world = ctx.content.getWorld('fog')!
  const protagonist = ctx.content.getCard(world.defaultCardId!)!
  const cast = ctx.content.listCards({ worldId: 'fog' }).filter((card) => card.id !== protagonist.id).slice(0, 2)
  return snapshotOf(world, protagonist, cast)
}

describe('snapshotOf', () => {
  it('把世界书与角色卡复制成独立快照', () => {
    const ctx = setup()
    const snap = snapshot(ctx)
    expect(snap.world.id).toBe('fog')
    expect(snap.protagonist.id).toBeTruthy()
    expect(snap.cast.length).toBeGreaterThan(0)
    expect(snap.intents.length).toBeGreaterThan(0)
    expect(snap.opening.parts.length).toBeGreaterThan(0)
  })
})

describe('MockSessionRepository', () => {
  it('为每个账号预置两份草稿', async () => {
    const { repo } = setup()
    const list = await repo.list()
    expect(list).toHaveLength(2)
    expect(list.every((session) => session.status === 'draft')).toBe(true)
    expect(list.every((session) => session.serverId === undefined)).toBe(true)
  })

  it('草稿不发请求，激活时才创建服务端会话', async () => {
    const ctx = setup()
    const [draft] = await ctx.repo.list()
    const activated = await ctx.repo.activate(draft!.id)
    expect(activated.status).toBe('active')
    expect(activated.serverId).toBeTruthy()
    expect(await ctx.repo.getByServerId(activated.serverId!)).toMatchObject({ id: draft!.id })

    const events = await ctx.transport.history(activated.serverId!)
    expect(events).toEqual([])
  })

  it('直接创建进行中会话会连接服务端', async () => {
    const ctx = setup()
    const created = await ctx.repo.create({ title: '直接开始', status: 'active', snapshot: snapshot(ctx) })
    expect(created.serverId).toBeTruthy()
    expect(await ctx.repo.getByServerId(created.serverId!)).toMatchObject({ title: '直接开始' })
  })

  it('拒绝空会话名', async () => {
    const ctx = setup()
    await expect(ctx.repo.create({ title: '  ', status: 'draft', snapshot: snapshot(ctx) })).rejects.toMatchObject({ status: 400 })
  })

  it('记录轮次、关系变化与完成状态', async () => {
    const ctx = setup()
    const [draft] = await ctx.repo.list()
    const updated = await ctx.repo.markProgress(draft!.id, {
      turnCount: 12,
      completed: true,
      changes: [{ who: '沈砚', label: '信任', value: '+0.05', direction: 'up', reason: '第 12 轮' }],
    })
    expect(updated.turnCount).toBe(12)
    expect(updated.completed).toBe(true)
    expect(updated.changes).toHaveLength(1)
  })

  it('开启下一单元会重置进度并换一个新的服务端会话', async () => {
    const ctx = setup()
    const [draft] = await ctx.repo.list()
    const activated = await ctx.repo.activate(draft!.id)
    await ctx.repo.markProgress(activated.id, { turnCount: 12, completed: true })
    const next = await ctx.repo.startUnit(activated.id)
    expect(next.unitIndex).toBe(2)
    expect(next.turnCount).toBe(0)
    expect(next.completed).toBe(false)
    expect(next.changes).toEqual([])
    expect(next.serverId).toBeTruthy()
    expect(next.serverId).not.toBe(activated.serverId)
  })

  it('删除与查询不存在的会话返回 404', async () => {
    const { repo } = setup()
    await expect(repo.remove('missing')).rejects.toMatchObject({ status: 404 })
    await expect(repo.activate('missing')).rejects.toMatchObject({ status: 404 })
    await expect(repo.markProgress('missing', { turnCount: 1 })).rejects.toMatchObject({ status: 404 })
    expect(await repo.get('missing')).toBeUndefined()
  })

  it('会话索引按账号隔离', async () => {
    const a = setup('user-a')
    await a.repo.create({ title: 'A 的会话', status: 'draft', snapshot: snapshot(a) })

    const b = setup('user-b')
    const bList = await b.repo.list()
    expect(bList.some((session) => session.title === 'A 的会话')).toBe(false)
  })
})

describe('MockSessionTransport', () => {
  it('生成流式叙事、状态变化与历史', async () => {
    const store = new MockStore(new MemoryStorage())
    const transport = new MockSessionTransport(store, { delayMs: 1 })
    const { sessionId } = await transport.create({
      worldId: 'fog',
      cast: [{ name: '沈砚' }],
      intents: [],
    })

    const controller = new AbortController()
    const frames: unknown[] = []
    const task = (async () => {
      for await (const frame of transport.stream(sessionId, controller.signal)) frames.push(frame)
    })()
    await Promise.resolve()

    await transport.startTurn(sessionId, '我留在原地观察。')
    await expect(transport.startTurn(sessionId, '再来一次')).rejects.toMatchObject({ status: 409 })
    await transport.whenIdle(sessionId)
    await new Promise((resolve) => setTimeout(resolve, 20))
    controller.abort()
    await task

    expect(frames).toContainEqual({ kind: 'transition', phase: 'running' })
    expect(frames).toContainEqual({ kind: 'transition', phase: 'done' })
    expect(frames.some((frame) => (frame as { kind: string }).kind === 'delta')).toBe(true)
    expect(frames).toContainEqual(
      expect.objectContaining({ kind: 'event', type: 'assistant_message' }),
    )
    expect(frames).toContainEqual(expect.objectContaining({ kind: 'event', type: 'turn_ended' }))

    const history = await transport.history(sessionId)
    expect(history.map((event) => event.type)).toEqual([
      'turn_started',
      'user_message',
      'assistant_message',
      'turn_ended',
    ])
    expect(history[2]?.payload).toMatchObject({ notes: expect.any(Array) })
  })

  it('未知会话返回 404', async () => {
    const transport = new MockSessionTransport(new MockStore(new MemoryStorage()))
    await expect(transport.startTurn('missing', '行动')).rejects.toMatchObject({ status: 404 })
    expect(await transport.history('missing')).toEqual([])
  })
})
