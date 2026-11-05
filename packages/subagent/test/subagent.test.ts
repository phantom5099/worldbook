import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { SessionService } from '@worldbook/session'
import { MemoryStore } from '@worldbook/session/testing'
import { ContextService } from '@worldbook/context'
import { EventSink } from '@worldbook/sink'
import { TurnRegistry } from '@worldbook/turn'
import { ToolRegistry } from '@worldbook/tool'
import { MockModelClient } from '@worldbook/model'
import { AgentService, sessionTurnIds } from '@worldbook/agent'
import { SubagentService } from '../src/index.js'
import {
  SubagentDepthLimitError,
  SubagentReuseError,
  SubagentSendScopeError,
} from '../src/index.js'

function setup(opts?: {
  maxDepth?: number
  wake?: (sessionId: string, seq: number) => void
}) {
  const store = new MemoryStore()
  const session = new SessionService(store)
  const context = new ContextService(session)
  const model = new MockModelClient()
  const registry = new ToolRegistry()
  const turns = new TurnRegistry(sessionTurnIds(session))
  const sink = new EventSink()
  const tools = () => registry.toService()
  const subagent = () =>
    new SubagentService({
      session,
      sink,
      turns,
      context,
      model,
      tools: tools(),
      maxDepth: opts?.maxDepth,
      wake: opts?.wake,
    })
  return { store, session, context, model, registry, turns, sink, tools, subagent }
}

describe('subagent spawn', () => {
  it('创建子会话并回注结果：parent_id/depth 正确，subagent_result 带最终文本', async () => {
    const { session, model, turns, subagent } = setup()
    const sessionId = await session.createSession()
    model.enqueue({ text: '子任务完成' })
    const svc = subagent()

    const childId = await svc.spawn(sessionId, {
      systemPrompt: '你是助手',
      task: '做点事',
    })
    const childRow = await session.getSession(childId)
    expect(childRow).toMatchObject({ parentId: sessionId, depth: 1 })

    const result = await svc.wait(childId)
    expect(result).toMatchObject({
      phase: 'completed',
      result: {
        childSessionId: childId,
        reason: 'done',
        content: '子任务完成',
      },
    })
    expect(turns.getState(childId)).toMatchObject({ phase: 'completed' })

    const parentHistory = await session.getHistory(sessionId)
    const spawned = parentHistory.find((e) => e.type === 'subagent_spawned')!
    expect(spawned.payload).toMatchObject({
      childSessionId: childId,
      task: '做点事',
      reused: false,
      systemPrompt: '你是助手',
    })
    const injected = parentHistory.find((e) => e.type === 'subagent_result')!
    expect(injected.payload).toMatchObject({
      childSessionId: childId,
      reason: 'done',
      content: '子任务完成',
    })

    const childHistory = await session.getHistory(childId)
    expect(childHistory[0]!.type).toBe('turn_started')
    const messages = model.requests[0]!.messages
    expect(messages[0]).toEqual({ role: 'system', content: '你是助手' })
    expect(messages[1]).toEqual({ role: 'user', content: '做点事' })
  })

  it('复用既有子会话：不新建会话，历史续跑', async () => {
    const { session, model, subagent } = setup()
    const sessionId = await session.createSession()
    const reusedId = await session.createSession({ parentId: sessionId, depth: 1 })
    model.enqueue({ text: '第一轮' })
    model.enqueue({ text: '第二轮续跑' })

    const svc = subagent()
    const first = await svc.spawn(sessionId, { systemPrompt: 's', task: '任务一' }, { sessionId: reusedId })
    expect(first).toBe(reusedId)
    await svc.wait(reusedId)
    const second = await svc.spawn(sessionId, { systemPrompt: 's', task: '任务二' }, { sessionId: reusedId })
    expect(second).toBe(reusedId)
    await svc.wait(reusedId)

    const childHistory = await session.getHistory(reusedId)
    expect(childHistory.filter((e) => e.type === 'turn_started')).toHaveLength(2)
    const parentHistory = await session.getHistory(sessionId)
    expect(parentHistory.find((e) => e.type === 'subagent_spawned' && (e.payload as { reused: boolean }).reused)).toBeTruthy()
    const results = parentHistory.filter((e) => e.type === 'subagent_result')
    expect(results).toHaveLength(2)
    expect(results[1]!.payload).toMatchObject({ content: '第二轮续跑' })

    // 第二轮上下文包含第一轮历史
    const secondRequest = model.requests[1]!
    expect(secondRequest.messages.some((m) => m.role === 'assistant' && m.content === '第一轮')).toBe(true)
  })

  it('复用非子会话被拒绝', async () => {
    const { session, subagent } = setup()
    const parentA = await session.createSession()
    const stranger = await session.createSession()
    await expect(
      subagent().spawn(parentA, { systemPrompt: 's', task: 't' }, { sessionId: stranger }),
    ).rejects.toThrow(SubagentReuseError)
  })

  it('超过深度上限被拒绝', async () => {
    const { session, subagent } = setup({ maxDepth: 2 })
    const root = await session.createSession()
    const child = await session.createSession({ parentId: root, depth: 1 })
    const grandchild = await session.createSession({ parentId: child, depth: 2 })
    await expect(
      subagent().spawn(grandchild, { systemPrompt: 's', task: 't' }),
    ).rejects.toThrow(SubagentDepthLimitError)
  })

  it('子代理忙碌时 spawn 拒绝（同会话单活跃 turn）', async () => {
    const { session, model, registry, subagent } = setup()
    registry.set({
      name: 'slow',
      description: '慢工具',
      parameters: z.object({}),
      execute: async () => {
        await new Promise((r) => setTimeout(r, 50))
        return { result: 'ok' }
      },
    })
    model.enqueue({ toolCalls: [{ callId: 'c1', name: 'slow', args: {} }] })
    model.enqueue({ text: '完成' })
    const sessionId = await session.createSession()
    const svc = subagent()
    const childId = await svc.spawn(sessionId, { systemPrompt: 's', task: 't' })
    await expect(
      svc.spawn(sessionId, { systemPrompt: 's', task: 't2' }, { sessionId: childId }),
    ).rejects.toThrow()
    expect(await svc.wait(childId)).toMatchObject({
      phase: 'completed',
      result: { reason: 'done' },
    })
  })
})

describe('subagent send', () => {
  it('同一根会话下投递成功，跨根被拒绝', async () => {
    const { session, subagent } = setup()
    const root1 = await session.createSession()
    const root2 = await session.createSession()
    const a = await session.createSession({ parentId: root1, depth: 1 })
    const b = await session.createSession({ parentId: root1, depth: 1 })
    const outsider = await session.createSession({ parentId: root2, depth: 1 })

    const svc = subagent()
    await svc.send(a, b, '你好，兄弟')
    const bHistory = await session.getHistory(b)
    expect(bHistory).toHaveLength(1)
    expect(bHistory[0]!.payload).toMatchObject({ fromSessionId: a, content: '你好，兄弟' })

    await expect(svc.send(a, outsider, '越界')).rejects.toThrow(SubagentSendScopeError)
  })

  it('运行中的目标会话在 step 边界吸收消息', async () => {
    const { session, model, registry, subagent, tools } = setup()
    const root = await session.createSession()
    const from = await session.createSession({ parentId: root, depth: 1 })
    const target = await session.createSession({ parentId: root, depth: 1 })

    registry.set({
      name: 'relay',
      description: '转发消息',
      parameters: z.object({ text: z.string() }),
      execute: async (args: { text: string }, ctx) => {
        await subagent().send(from, ctx.sessionId, args.text)
        return { result: 'sent' }
      },
    })

    model.enqueue({ toolCalls: [{ callId: 'c1', name: 'relay', args: { text: '插话' } }] })
    model.enqueue({ text: '收到插话' })

    const agent = new AgentService({
      session,
      context: new ContextService(session),
      model,
      tools: tools(),
      turns: new TurnRegistry(sessionTurnIds(session)),
      sink: new EventSink(),
    })
    const handle = await agent.start(target, '开始工作')
    expect(await handle.done).toBe('done')

    const secondRequest = model.requests[1]!
    const message = secondRequest.messages.find(
      (m) => m.role === 'user' && m.content.includes('来自于智能体'),
    )
    expect(message).toBeTruthy()
    expect((message as { content: string }).content).toContain('插话')
  })

  it('wait 未知子代理返回 unknown', async () => {
    const { subagent } = setup()
    await expect(subagent().wait('no-such-id')).resolves.toEqual({ phase: 'unknown' })
  })
})

describe('subagent 状态与唤醒', () => {
  it('子代理完成后以结果事件序号唤醒父会话', async () => {
    const woke: Array<{ sessionId: string; seq: number }> = []
    const { session, model, subagent } = setup({ wake: (sessionId, seq) => woke.push({ sessionId, seq }) })
    const sessionId = await session.createSession()
    model.enqueue({ text: '完成' })
    const svc = subagent()

    const childId = await svc.spawn(sessionId, { systemPrompt: 's', task: 't' })
    await svc.wait(childId)
    const injected = (await session.getHistory(sessionId)).find((e) => e.type === 'subagent_result')!
    expect(woke).toEqual([{ sessionId, seq: injected.seq }])
  })

  it('send 默认唤醒目标，wake=false 仅入队', async () => {
    const woke: Array<{ sessionId: string; seq: number }> = []
    const { session, subagent } = setup({ wake: (sessionId, seq) => woke.push({ sessionId, seq }) })
    const root = await session.createSession()
    const from = await session.createSession({ parentId: root, depth: 1 })
    const target = await session.createSession({ parentId: root, depth: 1 })
    const svc = subagent()

    await svc.send(from, target, '一')
    const delivered = (await session.getHistory(target)).find((e) => e.type === 'subagent_message')!
    expect(woke).toEqual([{ sessionId: target, seq: delivered.seq }])
    await svc.send(from, target, '二', { wake: false })
    expect(woke).toEqual([{ sessionId: target, seq: delivered.seq }])
  })

  it('wait 超时返回当前状态与 timedOut', async () => {
    const { session, turns, subagent } = setup()
    const childId = await session.createSession()
    await turns.claim(childId)

    await expect(subagent().wait(childId, { timeoutMs: 20 })).resolves.toEqual({
      phase: 'running',
      timedOut: true,
    })
    turns.settle(childId, 'done')
  })

  it('重启后从日志折叠：半截回合为 cancelled，已结束回合返回结果', async () => {
    const { session, subagent } = setup()
    const dangling = await session.createSession()
    await session.append(dangling, [
      { type: 'turn_started', payload: {} },
      { type: 'assistant_message', payload: { text: '没跑完' } },
    ])
    const finished = await session.createSession()
    await session.append(finished, [
      { type: 'turn_started', payload: {} },
      { type: 'assistant_message', payload: { text: '跑完了' } },
      { type: 'turn_ended', payload: { reason: 'done', steps: 1 } },
    ])
    const svc = subagent()

    await expect(svc.status(dangling)).resolves.toEqual({ phase: 'cancelled' })
    await expect(svc.wait(dangling)).resolves.toEqual({ phase: 'cancelled' })
    await expect(svc.wait(finished)).resolves.toEqual({
      phase: 'completed',
      reason: 'done',
      result: { childSessionId: finished, reason: 'done', content: '跑完了' },
    })
  })

  it('复用子会话后立刻 wait 不会返回上一轮结果', async () => {
    const { session, model, registry, subagent } = setup()
    registry.set({
      name: 'slow',
      description: '慢工具',
      parameters: z.object({}),
      execute: async () => {
        await new Promise((r) => setTimeout(r, 50))
        return { result: 'ok' }
      },
    })
    const parent = await session.createSession()
    const child = await session.createSession({ parentId: parent, depth: 1 })
    const svc = subagent()

    model.enqueue({ text: '第一轮' })
    await svc.spawn(parent, { systemPrompt: 's', task: '一' }, { sessionId: child })
    await svc.wait(child)

    model.enqueue({ toolCalls: [{ callId: 'c1', name: 'slow', args: {} }] })
    model.enqueue({ text: '第二轮' })
    await svc.spawn(parent, { systemPrompt: 's', task: '二' }, { sessionId: child })
    await expect(svc.wait(child, { timeoutMs: 10 })).resolves.toEqual({
      phase: 'running',
      timedOut: true,
    })
    await expect(svc.wait(child)).resolves.toMatchObject({
      phase: 'completed',
      result: { content: '第二轮' },
    })
  })

  it('listChildren 汇总子代理状态与结果', async () => {
    const { session, model, subagent } = setup()
    const parent = await session.createSession()
    model.enqueue({ text: '甲' })
    model.enqueue({ text: '乙' })
    const svc = subagent()

    const first = await svc.spawn(parent, { systemPrompt: 's', task: '一' })
    await svc.wait(first)
    const second = await svc.spawn(parent, { systemPrompt: 's', task: '二' })
    await svc.wait(second)

    const infos = await svc.listChildren(parent)
    expect(infos.map((i) => i.childSessionId)).toEqual([first, second])
    expect(infos.map((i) => i.phase)).toEqual(['completed', 'completed'])
    expect(infos.map((i) => i.result?.content)).toEqual(['甲', '乙'])
    await expect(svc.listChildren((await session.createSession()))).resolves.toEqual([])
  })
})
