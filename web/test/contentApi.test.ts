import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryStorage, MockStore } from '@/mocks/store'
import { MockCardApi, MockContentStore, MockWorldApi } from '@/mocks/contentApi'

const NOW = '2026-11-07T08:00:00.000Z'

function setup() {
  const store = new MockStore(new MemoryStorage())
  let scope = 'user-a'
  const content = new MockContentStore(store, () => NOW, () => scope)
  const worlds = new MockWorldApi(content, () => 2)
  const cards = new MockCardApi(content)
  return {
    store,
    content,
    worlds,
    cards,
    useScope: (next: string) => {
      scope = next
    },
  }
}

describe('world endpoints', () => {
  it('按种子生成世界书与角色卡', async () => {
    const { worlds } = setup()
    const list = await worlds.list()
    expect(list.map((world) => world.id)).toEqual(expect.arrayContaining(['fog', 'snow', 'radio']))
    const fog = list.find((world) => world.id === 'fog')!
    expect(fog.cardCount).toBeGreaterThan(0)
    expect(fog.sessionCount).toBe(2)
    expect(fog.defaultCardId).toBeTruthy()
  })

  it('新建世界书会同时生成默认主角', async () => {
    const { worlds, cards } = setup()
    const created = await worlds.create({ name: '无人车站', hook: '末班车从不报站。' })
    expect(created.id).toMatch(/^world-/)
    expect(created.defaultCardId).toBeTruthy()
    const list = await cards.list({ worldId: created.id })
    expect(list).toHaveLength(1)
    expect(list[0]?.id).toBe(created.defaultCardId)
  })

  it('拒绝空世界名', async () => {
    const { worlds } = setup()
    await expect(worlds.create({ name: '  ', hook: '内核' })).rejects.toMatchObject({ status: 400 })
    await expect(worlds.create({ name: '名字', hook: '' })).rejects.toMatchObject({ status: 400 })
  })

  it('更新世界书', async () => {
    const { worlds } = setup()
    const updated = await worlds.update('fog', { name: '雾港新纪', hook: '换了内核。' })
    expect(updated.name).toBe('雾港新纪')
    expect(updated.unit.title).toBe('雾港新纪')
    await expect(worlds.update('missing', { name: 'x' })).rejects.toMatchObject({ status: 404 })
  })

  it('删除世界书会连带删除角色卡', async () => {
    const { worlds, cards } = setup()
    const created = await worlds.create({ name: '临时世界', hook: '只存在一次。' })
    await worlds.remove(created.id)
    expect(await cards.list({ worldId: created.id })).toHaveLength(0)
    await expect(worlds.remove(created.id)).rejects.toMatchObject({ status: 404 })
  })
})

describe('card endpoints', () => {
  let ctx: ReturnType<typeof setup>

  beforeEach(() => {
    ctx = setup()
  })

  it('按世界筛选与查看通用卡', async () => {
    const worldCards = await ctx.cards.list({ worldId: 'fog' })
    const genericCards = await ctx.cards.list({ worldId: null })
    expect(worldCards.length).toBeGreaterThan(0)
    expect(genericCards.length).toBeGreaterThan(0)
    expect(worldCards.every((card) => card.worldId === 'fog')).toBe(true)
    expect(genericCards.every((card) => card.worldId === null)).toBe(true)
  })

  it('新建、更新、删除角色卡', async () => {
    const created = await ctx.cards.create({
      worldId: null,
      name: '闻舟',
      role: '摆渡人',
      traitsText: '沉默、记路',
    })
    expect(created.avatar).toBe('闻')
    expect(created.badge).toBe('通用')

    const updated = await ctx.cards.update(created.id, { name: '闻舟舟', goal: '找到渡口' })
    expect(updated.name).toBe('闻舟舟')
    expect(updated.goal).toBe('找到渡口')

    await ctx.cards.remove(created.id)
    expect(await ctx.cards.get(created.id)).toBeUndefined()
  })

  it('拒绝空姓名与不存在的世界', async () => {
    await expect(ctx.cards.create({ worldId: null, name: ' ' })).rejects.toMatchObject({ status: 400 })
    await expect(ctx.cards.create({ worldId: 'missing', name: '某人' })).rejects.toMatchObject({ status: 404 })
  })

  it('禁止删除世界书的默认主角', async () => {
    const world = await ctx.worlds.get('fog')
    await expect(ctx.cards.remove(world!.defaultCardId!)).rejects.toMatchObject({ status: 409 })
  })

  it('更新与删除不存在的卡返回 404', async () => {
    await expect(ctx.cards.update('missing', { name: 'x' })).rejects.toMatchObject({ status: 404 })
    await expect(ctx.cards.remove('missing')).rejects.toMatchObject({ status: 404 })
  })
})

describe('按账号隔离', () => {
  it('不同账号看到各自的内容', async () => {
    const ctx = setup()
    const created = await ctx.worlds.create({ name: '只属于 A', hook: 'A 的世界。' })
    expect((await ctx.worlds.list()).some((world) => world.id === created.id)).toBe(true)

    ctx.useScope('user-b')
    expect((await ctx.worlds.list()).some((world) => world.id === created.id)).toBe(false)
    const other = await ctx.worlds.create({ name: '只属于 B', hook: 'B 的世界。' })
    expect((await ctx.worlds.list()).some((world) => world.id === other.id)).toBe(true)

    ctx.useScope('user-a')
    const list = await ctx.worlds.list()
    expect(list.some((world) => world.id === created.id)).toBe(true)
    expect(list.some((world) => world.id === other.id)).toBe(false)
  })
})
