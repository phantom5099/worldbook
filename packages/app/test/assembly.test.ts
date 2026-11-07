import { describe, expect, it } from 'vitest'
import { MockModelClient } from '@worldbook/model/testing'
import { MemoryStore } from '@worldbook/session/testing'
import { createApp } from '../src/index.js'

function makeConfig(model: MockModelClient) {
  return {
    database: { store: new MemoryStore() },
    model: { baseUrl: 'unused', apiKey: 'unused', model: 'unused' },
    modelClient: model,
  }
}

describe('cordis 装配', () => {
  it('装配后 ctx 提供全部服务，且内置工具已注册', async () => {
    const model = new MockModelClient()
    model.enqueue({ text: '你好' })
    const ctx = createApp(makeConfig(model))
    await ctx.start()

    expect(ctx.session).toBeTruthy()
    expect(ctx.context).toBeTruthy()
    expect(ctx.agent).toBeTruthy()
    expect(ctx.subagent).toBeTruthy()
    expect(ctx.tools.list().map((t) => t.name)).toEqual(['spawn', 'send_message', 'wait_subagent'])

    const sessionId = await ctx.session.createSession()
    const handle = await ctx.agent.start(sessionId, '打招呼')
    expect(await handle.done).toBe('done')

    await ctx.stop()
  })

  it('经 spawn 工具发起子代理，结果回注父会话', async () => {
    const model = new MockModelClient()
    model.enqueue({
      toolCalls: [
        { callId: 'c1', name: 'spawn', args: { task: '查资料', systemPrompt: '你是研究员' } },
      ],
    })
    model.enqueue({ text: '子代理完成' })
    model.enqueue({ text: '汇总完毕' })
    const ctx = createApp(makeConfig(model))
    await ctx.start()

    const sessionId = await ctx.session.createSession()
    const handle = await ctx.agent.start(sessionId, '安排研究任务')
    expect(await handle.done).toBe('done')

    const spawned = (await ctx.session.getHistory(sessionId)).find((e) => e.type === 'subagent_spawned')!
    const childId = (spawned.payload as { childSessionId: string }).childSessionId
    // 子 loop 在后台执行：等结果回注后再断言父会话历史
    await ctx.subagent.wait(childId)

    const history = await ctx.session.getHistory(sessionId)
    const types = history.map((e) => e.type)
    expect(types).toContain('subagent_spawned')
    expect(types).toContain('subagent_result')

    const childRow = await ctx.session.getSession(childId)
    expect(childRow).toMatchObject({ parentId: sessionId, depth: 1 })

    const injected = history.find((e) => e.type === 'subagent_result')!
    expect(injected.payload).toMatchObject({ childSessionId: childId, content: '子代理完成' })

    await ctx.stop()
  })
})
