import { describe, expect, it, vi } from 'vitest'
import { SessionService } from '../src/index.js'
import type { SessionEvent, SessionEventType, SessionId, SessionMeta } from '../src/types.js'
import type { SessionRow, SessionStatus, SessionStore, StoredEvent } from '../src/store.js'

class FakeStore implements SessionStore {
  events = new Map<SessionId, StoredEvent[]>()
  status = new Map<SessionId, SessionStatus>()
  nextId = 1
  failNextInsert: Error | null = null
  insertCalls = 0

  async createSession(meta: SessionMeta): Promise<SessionId> {
    const id = `s-${this.nextId++}`
    this.status.set(id, 'active')
    this.events.set(id, [])
    void meta
    return id
  }

  async insertEvents(sessionId: SessionId, events: ReadonlyArray<StoredEvent>): Promise<void> {
    this.insertCalls++
    if (this.failNextInsert) {
      const error = this.failNextInsert
      this.failNextInsert = null
      throw error
    }
    this.events.get(sessionId)!.push(...events)
  }

  async selectEvents(sessionId: SessionId, afterSeq: number, limit?: number): Promise<SessionEvent[]> {
    let rows = (this.events.get(sessionId) ?? []).filter((event) => event.seq > afterSeq)
    if (limit !== undefined) rows = rows.slice(0, limit)
    return rows.map((event) => ({ ...event }))
  }

  async maxSeq(sessionId: SessionId): Promise<number> {
    const rows = this.events.get(sessionId) ?? []
    return rows.length === 0 ? 0 : rows[rows.length - 1]!.seq
  }

  async getSession(sessionId: SessionId): Promise<SessionRow | undefined> {
    if (!this.status.has(sessionId)) return undefined
    return { id: sessionId, parentId: null, depth: 0, status: this.status.get(sessionId)!, meta: {} }
  }

  async setStatus(sessionId: SessionId, status: SessionStatus): Promise<void> {
    this.status.set(sessionId, status)
  }
}

describe('SessionService.append', () => {
  it('从 1 开始连续分配 seq，一次批量落库', async () => {
    const store = new FakeStore()
    const id = await store.createSession({})
    const service = new SessionService(store)
    const events = await service.append(id, [
      { type: 'turn_started', payload: {} },
      { type: 'user_message', payload: { text: 'hi' } },
      { type: 'turn_ended', payload: { reason: 'done' } },
    ])
    expect(events.map((event) => event.seq)).toEqual([1, 2, 3])
    expect(store.insertCalls).toBe(1)
    expect((await service.getHistory(id)).length).toBe(3)
  })

  it('计数器从既有 maxSeq 初始化，跨实例续接 seq', async () => {
    const store = new FakeStore()
    const id = await store.createSession({})
    const first = new SessionService(store)
    await first.append(id, [{ type: 'user_message', payload: 'a' }])
    await first.append(id, [{ type: 'assistant_message', payload: 'b' }])

    const second = new SessionService(store)
    const events = await second.append(id, [{ type: 'user_message', payload: 'c' }])
    expect(events[0]!.seq).toBe(3)
  })

  it('落库失败时丢弃计数器，下次 append 从 DB 重新初始化', async () => {
    const store = new FakeStore()
    const id = await store.createSession({})
    const service = new SessionService(store)
    await service.append(id, [{ type: 'user_message', payload: 'a' }])

    store.failNextInsert = new Error('db down')
    await expect(
      service.append(id, [{ type: 'user_message', payload: 'lost' }]),
    ).rejects.toThrow('db down')

    const events = await service.append(id, [{ type: 'user_message', payload: 'retried' }])
    expect(events[0]!.seq).toBe(2)
    expect((await service.getHistory(id)).length).toBe(2)
  })

  it('空批量不触发落库', async () => {
    const store = new FakeStore()
    const id = await store.createSession({})
    const service = new SessionService(store)
    await expect(service.append(id, [])).resolves.toEqual([])
    expect(store.insertCalls).toBe(0)
    expect(await store.maxSeq(id)).toBe(0)
  })

  it('append 后历史按 seq 升序返回，afterSeq 与 limit 生效', async () => {
    const store = new FakeStore()
    const id = await store.createSession({})
    const service = new SessionService(store)
    const types: SessionEventType[] = ['user_message', 'assistant_message', 'user_message', 'assistant_message']
    await service.append(id, types.map((type) => ({ type, payload: null })))

    const all = await service.getHistory(id)
    expect(all.map((event) => event.seq)).toEqual([1, 2, 3, 4])

    const after = await service.getHistory(id, { afterSeq: 2 })
    expect(after.map((event) => event.seq)).toEqual([3, 4])

    const limited = await service.getHistory(id, { afterSeq: 0, limit: 2 })
    expect(limited.map((event) => event.seq)).toEqual([1, 2])
  })
})

describe('SessionService 会话生命周期', () => {
  it('createSession / getSession / setStatus 透传 store', async () => {
    const store = new FakeStore()
    const service = new SessionService(store)
    const id = await service.createSession({ parentId: undefined, depth: 0 })
    expect(await service.getSession(id)).toMatchObject({ id, status: 'active' })
    await service.setStatus(id, 'closed')
    expect((await service.getSession(id))!.status).toBe('closed')
    expect(await service.getSession('missing')).toBeUndefined()
  })

  it('createdAt 由 service 统一赋值，store 收到 Date', async () => {
    const store = new FakeStore()
    const insertSpy = vi.spyOn(store, 'insertEvents')
    const id = await store.createSession({})
    const service = new SessionService(store)
    await service.append(id, [{ type: 'user_message', payload: 'x' }])
    const stored = insertSpy.mock.calls[0]![1]
    expect(stored[0]!.createdAt).toBeInstanceOf(Date)
  })
})
