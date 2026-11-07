import { describe, expect, it } from 'vitest'
import { MemoryStorage, MockStore } from '@/mocks/store'
import { MockAuthRepository, hashPassword } from '@/mocks/authRepository'
import { MockProviderRepository } from '@/mocks/providerRepository'

describe('MockAuthRepository', () => {
  it('首次使用时预置 admin / 123456', async () => {
    const auth = new MockAuthRepository(new MockStore(new MemoryStorage()))
    await auth.ensureSeed()
    const account = await auth.login('admin', '123456')
    expect(account.handle).toBe('admin')
    expect(auth.current()?.id).toBe(account.id)
  })

  it('密码错误时不登录', async () => {
    const auth = new MockAuthRepository(new MockStore(new MemoryStorage()))
    await expect(auth.login('admin', 'wrong')).rejects.toMatchObject({ status: 401 })
    expect(auth.current()).toBeNull()
  })

  it('注册后自动登录，重复账号被拒绝', async () => {
    const auth = new MockAuthRepository(new MockStore(new MemoryStorage()))
    const account = await auth.register({ name: '闻舟', handle: 'WenZhou', password: 'secret1' })
    expect(account.handle).toBe('wenzhou')
    expect(auth.current()?.id).toBe(account.id)
    await expect(auth.register({ name: '另一个', handle: 'wenzhou', password: 'secret1' })).rejects.toMatchObject({ status: 409 })
    await expect(auth.register({ name: '管理员', handle: 'admin', password: 'secret1' })).rejects.toMatchObject({ status: 409 })
  })

  it('校验账号与密码长度', async () => {
    const auth = new MockAuthRepository(new MockStore(new MemoryStorage()))
    await expect(auth.register({ name: '', handle: 'a b', password: 'secret1' })).rejects.toMatchObject({ status: 400 })
    await expect(auth.register({ name: '', handle: 'a', password: 'secret1' })).rejects.toMatchObject({ status: 400 })
    await expect(auth.register({ name: '', handle: 'ab', password: '123' })).rejects.toMatchObject({ status: 400 })
  })

  it('退出后清除当前账号', async () => {
    const auth = new MockAuthRepository(new MockStore(new MemoryStorage()))
    await auth.login('admin', '123456')
    auth.logout()
    expect(auth.current()).toBeNull()
  })

  it('同一密码与盐生成相同摘要', async () => {
    expect(await hashPassword('secret', 'salt')).toBe(await hashPassword('secret', 'salt'))
    expect(await hashPassword('secret', 'salt')).not.toBe(await hashPassword('secret', 'other'))
  })
})

describe('MockProviderRepository', () => {
  it('返回内置提供商', async () => {
    const repo = new MockProviderRepository(new MockStore(new MemoryStorage()))
    const list = await repo.list()
    expect(list.map((provider) => provider.id)).toEqual(
      expect.arrayContaining(['deepseek', 'minimax', 'qiniu', 'modelscope']),
    )
  })

  it('新增自定义提供商并拒绝重复 ID', async () => {
    const repo = new MockProviderRepository(new MockStore(new MemoryStorage()))
    const provider = await repo.create({ id: 'local-ai', name: '本地模型', base: 'http://localhost:8080/v1' })
    expect(provider).toMatchObject({ id: 'local-ai', custom: true, icon: 'custom' })
    expect((await repo.list()).some((item) => item.id === 'local-ai')).toBe(true)
    await expect(repo.create({ id: 'local-ai', name: '重复', base: 'https://x.dev/v1' })).rejects.toMatchObject({ status: 409 })
    await expect(repo.create({ id: 'deepseek', name: '重复内置', base: 'https://x.dev/v1' })).rejects.toMatchObject({ status: 409 })
  })

  it('校验 ID 与基础 URL', async () => {
    const repo = new MockProviderRepository(new MockStore(new MemoryStorage()))
    await expect(repo.create({ id: 'Bad Id', name: 'x', base: 'https://x.dev/v1' })).rejects.toMatchObject({ status: 400 })
    await expect(repo.create({ id: 'good', name: ' ', base: 'https://x.dev/v1' })).rejects.toMatchObject({ status: 400 })
    await expect(repo.create({ id: 'good', name: 'x', base: 'x.dev' })).rejects.toMatchObject({ status: 400 })
  })

  it('自定义提供商按账号隔离', async () => {
    const store = new MockStore(new MemoryStorage())
    let scope = 'user-a'
    const repo = new MockProviderRepository(store, () => scope)
    await repo.create({ id: 'mine', name: '我的', base: 'https://mine.dev/v1' })
    scope = 'user-b'
    expect((await repo.list()).some((item) => item.id === 'mine')).toBe(false)
  })
})
