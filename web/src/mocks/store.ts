export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  keys(): string[]
}

export class MemoryStorage implements KeyValueStorage {
  private data = new Map<string, string>()

  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }

  removeItem(key: string): void {
    this.data.delete(key)
  }

  keys(): string[] {
    return [...this.data.keys()]
  }
}

export function browserStorage(): KeyValueStorage {
  if (typeof localStorage === 'undefined') return new MemoryStorage()
  return {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key),
    keys: () => {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i)
        if (key) keys.push(key)
      }
      return keys
    },
  }
}

export class MockStore {
  constructor(
    private readonly storage: KeyValueStorage = browserStorage(),
    private readonly prefix = 'wb-mock:v1',
  ) {}

  private full(key: string): string {
    return `${this.prefix}:${key}`
  }

  has(key: string): boolean {
    return this.storage.getItem(this.full(key)) !== null
  }

  read<T>(key: string, fallback: T): T {
    const raw = this.storage.getItem(this.full(key))
    if (raw === null) return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  }

  write<T>(key: string, value: T): void {
    this.storage.setItem(this.full(key), JSON.stringify(value))
  }

  remove(key: string): void {
    this.storage.removeItem(this.full(key))
  }

  storageKeys(): string[] {
    const prefix = `${this.prefix}:`
    return this.storage
      .keys()
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length))
  }

  removeKey(key: string): void {
    this.remove(key)
  }

  reset(): void {
    for (const key of this.storageKeys()) this.remove(key)
  }
}

export function clone<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(value)) as T
}
