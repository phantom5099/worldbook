import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { DbService, ensureSchema } from '@worldbook/db'
import { PostgresSessionStore } from '../src/pg-store.js'
import { SessionService } from '../src/index.js'

const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('PostgresSessionStore 集成', () => {
  let db: DbService
  let store: PostgresSessionStore
  let service: SessionService
  let sessionId = ''

  beforeAll(async () => {
    db = new DbService(process.env.DATABASE_URL!)
    store = new PostgresSessionStore(db.sql)
    service = new SessionService(store)
    await ensureSchema(db.sql)
    sessionId = await service.createSession({ depth: 0 })
  })

  afterAll(async () => {
    await db.close()
  })

  it('append → getHistory 往返一致（含 JSONB payload）', async () => {
    const payload = { text: '你好', nested: { deep: [1, 2, 3] } }
    const events = await service.append(sessionId, [
      { type: 'user_message', payload },
      { type: 'assistant_message', payload: { text: '回' } },
    ])
    const history = await service.getHistory(sessionId)
    expect(history.length).toBe(2)
    expect(history[0]!.seq).toBe(events[0]!.seq)
    expect(history[0]!.payload).toEqual(payload)
    expect(history[1]!.type).toBe('assistant_message')
  })

  it('重复 seq 触发主键冲突', async () => {
    await expect(
      store.insertEvents(sessionId, [{ seq: 1, type: 'user_message', payload: null, createdAt: new Date() }]),
    ).rejects.toThrow()
  })

  it('maxSeq 与 setStatus 生效', async () => {
    expect(await store.maxSeq(sessionId)).toBeGreaterThanOrEqual(2)
    await service.setStatus(sessionId, 'closed')
    expect((await service.getSession(sessionId))!.status).toBe('closed')
    await service.setStatus(sessionId, 'active')
  })

  it('createSession 返回的 id 可直接查询', async () => {
    const row = await store.getSession(sessionId)
    expect(row).toMatchObject({ id: sessionId, depth: 0, status: expect.any(String) })
  })
})

describe.skipIf(!hasDb)('postgres 连接冒烟', () => {
  it('sql 可建立连接', async () => {
    const raw = postgres(process.env.DATABASE_URL!)
    const result = await raw`select 1 as one`
    expect(Number(result[0]!.one)).toBe(1)
    await raw.end({ timeout: 5 })
  })
})
