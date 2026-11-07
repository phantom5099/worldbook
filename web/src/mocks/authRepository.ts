import type { Account } from '@/api/types'
import { ApiError } from '@/api/errors'
import { newId } from '@/api/ids'
import type { AuthRepository } from '@/repositories/types'
import { MockStore } from './store'

const ACCOUNTS_KEY = 'auth:accounts'
const CURRENT_KEY = 'auth:current'

function randomHex(bytes: number): string {
  const data = new Uint8Array(bytes)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(data)
  } else {
    for (let i = 0; i < data.length; i += 1) data[i] = Math.floor(Math.random() * 256)
  }
  return [...data].map((item) => item.toString(16).padStart(2, '0')).join('')
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const text = `${salt}:${password}`
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const bytes = new TextEncoder().encode(text)
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('')
  }
  let hash = 0
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  return hash.toString(16).padStart(8, '0')
}

export class MockAuthRepository implements AuthRepository {
  constructor(private readonly store: MockStore) {}

  private accounts(): Account[] {
    return this.store.read<Account[]>(ACCOUNTS_KEY, [])
  }

  async ensureSeed(): Promise<void> {
    if (this.accounts().length > 0) return
    const salt = randomHex(16)
    const account: Account = {
      id: newId('user'),
      name: '管理员',
      handle: 'admin',
      salt,
      hash: await hashPassword('123456', salt),
      createdAt: new Date().toISOString(),
    }
    this.store.write(ACCOUNTS_KEY, [account])
  }

  current(): Account | null {
    const id = this.store.read<string | null>(CURRENT_KEY, null)
    if (!id) return null
    return this.accounts().find((account) => account.id === id) ?? null
  }

  async register(input: { name: string; handle: string; password: string }): Promise<Account> {
    await this.ensureSeed()
    const handle = input.handle.trim().toLowerCase()
    if (!handle || /\s/.test(handle)) throw new ApiError(400, '请输入不包含空格的账号')
    if (handle.length < 2) throw new ApiError(400, '账号至少 2 个字符')
    if (input.password.length < 6) throw new ApiError(400, '密码至少 6 位')
    const accounts = this.accounts()
    if (accounts.some((account) => account.handle === handle)) throw new ApiError(409, '这个账号已存在')

    const salt = randomHex(16)
    const account: Account = {
      id: newId('user'),
      name: input.name.trim() || handle,
      handle,
      salt,
      hash: await hashPassword(input.password, salt),
      createdAt: new Date().toISOString(),
    }
    accounts.push(account)
    this.store.write(ACCOUNTS_KEY, accounts)
    this.store.write(CURRENT_KEY, account.id)
    return account
  }

  async login(handle: string, password: string): Promise<Account> {
    await this.ensureSeed()
    const account = this.accounts().find((item) => item.handle === handle.trim().toLowerCase())
    if (!account) throw new ApiError(401, '账号不存在，先创建一个')
    const hash = await hashPassword(password, account.salt)
    if (hash !== account.hash) throw new ApiError(401, '密码不正确')
    this.store.write(CURRENT_KEY, account.id)
    return account
  }

  logout(): void {
    this.store.remove(CURRENT_KEY)
  }
}
