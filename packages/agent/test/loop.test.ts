import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { SessionService } from '@worldbook/session'
import type { SessionRow, SessionStatus, SessionStore, StoredEvent } from '@worldbook/session'
import { ContextService } from '@worldbook/context'
import { EventSink } from '@worldbook/sink'
import { TurnRegistry, TurnAlreadyActiveError } from '@worldbook/turn'
import { ToolRegistry } from '@worldbook/tool'
import { MockModelClient } from '@worldbook/model'
import { AgentService } from '../src/index.js'
import type { SinkFrame } from '@worldbook/sink'
import type { ModelEvent, ModelRequest } from '@worldbook/model'

class MemoryStore implements SessionStore {
  sessions = new Map<string, SessionRow>()
  events = new Map<string, StoredEvent[]>()

  async createSession(meta: { parentId?: string; depth?: number }): Promise<string> {
    const id = randomUUID()
    this.sessions.set(id, {
      id,
      parentId: meta.parentId ?? null,
      depth: meta.depth ?? 0,
      status: 'active',
      meta,
    })
    return id
  }

  async insertEvents(sessionId: string, events: ReadonlyArray<StoredEvent>): Promise<void> {
    const list = this.events.get(sessionId) ?? []
    list.push(...events)
    this.events.set(sessionId, list)
  }

  async selectEvents(sessionId: string, afterSeq: number, limit?: number) {
    const list = (this.events.get(sessionId) ?? []).filter((e) => e.seq > afterSeq)
    return (limit !== undefined ? list.slice(0, limit) : list).map((e) => ({ ...e }))
  }

  async maxSeq(sessionId: string): Promise<number> {
    return (this.events.get(sessionId) ?? []).reduce((max, e) => Math.max(max, e.seq), 0)
  }

  async getSession(sessionId: string) {
    return this.sessions.get(sessionId)
  }

  async setStatus(sessionId: string, status: SessionStatus): Promise<void> {
    const row = this.sessions.get(sessionId)
    if (row) row.status = status
  }
}

function setup(opts?: { maxSteps?: number }) {
  const store = new MemoryStore()
  const session = new SessionService(store)
  const context = new ContextService(session)
  const model = new MockModelClient()
  const registry = new ToolRegistry()
  const turns = new TurnRegistry()
  const sink = new EventSink()
  // AgentService 持有 ToolService 快照，必须在工具注册完成后再构造
  const makeAgent = () =>
    new AgentService({
      session,
      context,
      model,
      tools: registry.toService(),
      turns,
      sink,
      maxSteps: opts?.maxSteps,
    })
  return { store, session, context, model, registry, turns, sink, makeAgent }
}

async function collect(sink: EventSink, sessionId: string): Promise<SinkFrame[]> {
  const frames: SinkFrame[] = []
  const iterator = sink.attach(sessionId)[Symbol.asyncIterator]()
  void (async () => {
    while (true) {
      const { value, done } = await iterator.next()
      if (done) break
      frames.push(value)
    }
  })()
  return frames
}

describe('agent loop', () => {
  it('纯文本完成：历史事件、sink 帧与状态机终态一致', async () => {
    const { session, model, turns, sink, makeAgent } = setup()
    model.enqueue({ deltas: ['你', '好'], usage: { inputTokens: 5, outputTokens: 2 } })
    const sessionId = await session.createSession()

    const frames = collect(sink, sessionId)
    const handle = makeAgent().start(sessionId, '进入酒馆')
    const reason = await handle.done
    sink.close(sessionId)
    const collected = await frames

    expect(reason).toBe('done')
    expect(turns.getState(sessionId)).toMatchObject({ phase: 'completed', reason: 'done' })

    const history = await session.getHistory(sessionId)
    expect(history.map((e) => e.type)).toEqual([
      'turn_started',
      'user_message',
      'step_started',
      'assistant_message',
      'step_ended',
      'turn_ended',
    ])
    expect(history[3]!.payload).toMatchObject({ text: '你好', usage: { inputTokens: 5, outputTokens: 2 } })
    expect(history[5]!.payload).toMatchObject({ reason: 'done', steps: 1 })

    const frameTypes = collected.filter((f) => f.kind === 'event').map((f) => f.type)
    expect(frameTypes).toEqual([
      'turn_started',
      'user_message',
      'step_started',
      'assistant_message',
      'step_ended',
      'turn_ended',
    ])
    expect(collected.filter((f) => f.kind === 'delta').map((f) => (f.kind === 'delta' ? f.text : ''))).toEqual([
      '你',
      '好',
    ])
    expect(collected[0]).toEqual({ kind: 'transition', phase: 'running' })
    expect(collected[collected.length - 1]).toEqual({ kind: 'transition', phase: 'completed', reason: 'done' })
  })

  it('工具往返：tool_call/tool_result 成对落库，结果进入下一轮上下文', async () => {
    const { session, model, registry, makeAgent } = setup()
    registry.set({
      name: 'echo',
      description: '回声',
      parameters: z.object({ text: z.string() }),
      execute: async (args: { text: string }) => ({ result: args.text }),
    })
    model.enqueue({ toolCalls: [{ callId: 'call_1', name: 'echo', args: { text: 'ping' } }] })
    model.enqueue({ text: '收到 ping' })
    const sessionId = await session.createSession()

    const handle = makeAgent().start(sessionId, '调用 echo')
    expect(await handle.done).toBe('done')

    const history = await session.getHistory(sessionId)
    expect(history.map((e) => e.type)).toEqual([
      'turn_started',
      'user_message',
      'step_started',
      'assistant_message',
      'tool_call',
      'tool_result',
      'step_ended',
      'step_started',
      'assistant_message',
      'step_ended',
      'turn_ended',
    ])
    expect(history[4]!.payload).toMatchObject({ calls: [{ callId: 'call_1', name: 'echo' }] })
    expect(history[5]!.payload).toMatchObject({
      callId: 'call_1',
      name: 'echo',
      status: 'ok',
      result: '"ping"',
    })
    expect(history[10]!.payload).toMatchObject({ reason: 'done', steps: 2 })

    const secondRequest = model.requests[1]!
    expect(secondRequest.messages).toEqual([
      { role: 'user', content: '调用 echo' },
      { role: 'assistant', content: '', toolCalls: [{ callId: 'call_1', name: 'echo', args: { text: 'ping' } }] },
      { role: 'tool', toolCallId: 'call_1', content: '"ping"' },
    ])
  })

  it('工具失败不中止回合：error 结果回灌，模型继续', async () => {
    const { session, model, registry, makeAgent } = setup()
    registry.set({
      name: 'boom',
      description: '总是失败',
      parameters: z.object({}),
      execute: async () => {
        throw new Error('炸了')
      },
    })
    model.enqueue({ toolCalls: [{ callId: 'call_1', name: 'boom', args: {} }] })
    model.enqueue({ text: '工具坏了，我直接回答' })
    const sessionId = await session.createSession()

    expect(await makeAgent().start(sessionId, 'x').done).toBe('done')
    const history = await session.getHistory(sessionId)
    expect(history[5]!.payload).toMatchObject({ callId: 'call_1', status: 'error', result: '炸了' })
    expect(history[history.length - 1]!.payload).toMatchObject({ reason: 'done' })
  })

  it('maxSteps：步数耗尽返回 max_steps', async () => {
    const { session, model, registry, makeAgent } = setup({ maxSteps: 2 })
    registry.set({
      name: 'noop',
      description: '空',
      parameters: z.object({}),
      execute: async () => ({ result: 'ok' }),
    })
    model.enqueue({ toolCalls: [{ callId: 'c1', name: 'noop', args: {} }] })
    model.enqueue({ toolCalls: [{ callId: 'c2', name: 'noop', args: {} }] })
    model.enqueue({ text: '不该被消费' })
    const sessionId = await session.createSession()

    expect(await makeAgent().start(sessionId, 'x').done).toBe('max_steps')
    const history = await session.getHistory(sessionId)
    expect(history[history.length - 1]!.payload).toMatchObject({ reason: 'max_steps', steps: 2 })
    expect(model.requests).toHaveLength(2)
  })

  it('interrupt：模型等待期间 AbortController 触发后回合以 interrupted 收尾', async () => {
    const { session, turns, sink } = setup()
    const hanging: ModelClientLike = {
      async *completeStream(request: ModelRequest): AsyncIterable<ModelEvent> {
        await new Promise<void>((_, reject) => {
          request.signal.addEventListener('abort', () => reject(new Error('aborted')))
        })
        yield { type: 'message', text: '', toolCalls: [] }
      },
    }
    const custom = new AgentService({
      session,
      context: new ContextService(session),
      model: hanging,
      tools: new ToolRegistry().toService(),
      turns,
      sink,
    })
    const sessionId = await session.createSession()

    const handle = custom.start(sessionId, '慢任务')
    await new Promise((r) => setTimeout(r, 20))
    handle.interrupt('用户取消')
    expect(await handle.done).toBe('interrupted')
    expect(turns.getState(sessionId)).toMatchObject({ phase: 'cancelled', reason: 'interrupted' })

    const history = await session.getHistory(sessionId)
    const ended = history[history.length - 1]!
    expect(ended.type).toBe('turn_ended')
    expect(ended.payload).toMatchObject({ reason: 'interrupted', error: 'aborted', steps: 1 })
  })

  it('interrupt：首个 step 开始前中止也以 interrupted 收尾', async () => {
    const { session, model, turns, makeAgent } = setup()
    model.enqueue({ text: '不该被消费' })
    const sessionId = await session.createSession()
    const svc = makeAgent()

    const handle = svc.start(sessionId, 'x')
    handle.interrupt()
    expect(await handle.done).toBe('interrupted')
    expect(turns.getState(sessionId)).toMatchObject({ phase: 'cancelled' })
    const history = await session.getHistory(sessionId)
    expect(history[history.length - 1]!.payload).toMatchObject({ reason: 'interrupted' })
  })

  it('同会话并发 start 拒绝', async () => {
    const { session, model, makeAgent } = setup()
    model.enqueue({ text: '第一轮' })
    const sessionId = await session.createSession()
    const agent = makeAgent()
    const handle = agent.start(sessionId, '第一')
    expect(() => agent.start(sessionId, '第二')).toThrow(TurnAlreadyActiveError)
    expect(await handle.done).toBe('done')
  })

  it('模型错误：回合以 error 收尾，错误信息写入 turn_ended', async () => {
    const { session, model, turns, makeAgent } = setup()
    model.enqueue({ error: 'boom' })
    const sessionId = await session.createSession()

    expect(await makeAgent().start(sessionId, 'x').done).toBe('error')
    expect(turns.getState(sessionId)).toMatchObject({ phase: 'failed', reason: 'error' })
    const history = await session.getHistory(sessionId)
    const ended = history[history.length - 1]!
    expect(ended.payload).toMatchObject({ reason: 'error', error: 'boom' })
  })
})

interface ModelClientLike {
  completeStream(request: ModelRequest): AsyncIterable<ModelEvent>
}
