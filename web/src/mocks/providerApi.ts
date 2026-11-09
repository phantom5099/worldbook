import type { Provider } from '@/api/types'
import { ApiError } from '@/api/errors'
import type { ProviderApi } from '@/api/endpoints/types'
import { BUILTIN_PROVIDERS } from './fixtures/providers'
import { MockStore } from './store'

const CUSTOM_KEY = 'providers:custom'

export class MockProviderApi implements ProviderApi {
  constructor(
    private readonly store: MockStore,
    private readonly scope: () => string = () => 'anonymous',
  ) {}

  private key(): string {
    return `${CUSTOM_KEY}:${this.scope()}`
  }

  async list(): Promise<Provider[]> {
    return [...BUILTIN_PROVIDERS, ...this.store.read<Provider[]>(this.key(), [])]
  }

  async create(input: { id: string; name: string; base: string }): Promise<Provider> {
    const id = input.id.trim()
    const name = input.name.trim()
    const base = input.base.trim()
    if (!id) throw new ApiError(400, '请填写提供商 ID')
    if (!/^[a-z0-9_-]+$/.test(id)) throw new ApiError(400, 'ID 只能使用小写字母、数字、连字符或下划线')
    if (!name) throw new ApiError(400, '请填写显示名称')
    if (!/^https?:\/\/[^\s]+$/i.test(base)) throw new ApiError(400, '基础 URL 需要以 http:// 或 https:// 开头')

    const custom = this.store.read<Provider[]>(this.key(), [])
    const known = new Set([...BUILTIN_PROVIDERS, ...custom].map((provider) => provider.id))
    if (known.has(id)) throw new ApiError(409, '这个提供商 ID 已被使用')

    const provider: Provider = { id, name, base, icon: 'custom', custom: true }
    custom.push(provider)
    this.store.write(this.key(), custom)
    return provider
  }
}
