import { describe, expect, it } from 'vitest'
import type { ModelClient, ModelEvent, ModelRequest } from '@worldbook/model'
import { MockModelClient } from '@worldbook/model/testing'
import { MemoryStore } from '@worldbook/session/testing'
import { createApp, readConfig } from '../src/index.js'

function makeConfig(model: ModelClient) {
  return {
    ...readConfig({}),
    database: { store: new MemoryStore() },
    model: { baseUrl: 'unused', apiKey: 'unused', model: 'unused' },
    modelClient: model,
  }
}

/**
 * 父会话与子会话并发消费同一客户端：按请求特征路由，而不是共享脚本队列，
 * 否则「子代理结果」与「父会话收尾」谁先取到响应取决于微任务顺序。
 */
function routingModel(): ModelClient {
  return {
    async *completeStream(request: ModelRequest): AsyncIterable<ModelEvent> {
      if (request.messages[0]?.role === 'system') {
        yield { type: 'message', text: '子代理完成', toolCalls: [] }
        return
      }
      if (request.messages.some((message) => message.role === 'tool')) {
        yield { type: 'message', text: '汇总完毕', toolCalls: [] }
        return
      }
      yield {
        type: 'message',
        text: '',
        toolCalls: [
          { callId: 'c1', name: 'spawn', args: { task: '查资料', systemPrompt: '你是研究员' } },
        ],
      }
    },
  }
}

describe('cordis 装配', () => {
  it('装配后可用：内置工具已注册，agent 能跑完一轮', async () => {
    const model = new MockModelClient()
    model.enqueue({ text: '你好' })
    const ctx = createApp(makeConfig(model))
    await ctx.start()

    expect(ctx.tools.list().map((t) => t.name)).toEqual(['spawn', 'send_message', 'wait_subagent'])

    const sessionId = await ctx.session.createSession()
    const handle = await ctx.agent.start(sessionId, '打招呼')
    expect(await handle.done).toBe('done')

    await ctx.stop()
  })

  it('经 spawn 工具发起子代理，结果回注父会话', async () => {
    const ctx = createApp(makeConfig(routingModel()))
    await ctx.start()

    const sessionId = await ctx.session.createSession()
    const handle = await ctx.agent.start(sessionId, '安排研究任务')
    expect(await handle.done).toBe('done')

    const spawned = (await ctx.session.getHistory(sessionId)).find((e) => e.type === 'subagent_spawned')!
    const childId = (spawned.payload as { childSessionId: string }).childSessionId
    // 子 loop 在后台执行：等结果回注后再断言父会话历史
    const result = await ctx.subagent.wait(childId)
    expect(result).toMatchObject({ phase: 'completed', result: { content: '子代理完成' } })

    const history = await ctx.session.getHistory(sessionId)
    const injected = history.find((e) => e.type === 'subagent_result')!
    expect(injected.payload).toMatchObject({ childSessionId: childId, content: '子代理完成' })

    const childRow = await ctx.session.getSession(childId)
    expect(childRow).toMatchObject({ parentId: sessionId, depth: 1 })

    await ctx.stop()
  })

  it('先构造 url 版装配再构造 store 版，后者仍可启动', async () => {
    // 只构造不 start：url 版不建立连接，仅用于复现「装配插件被改写」的副作用
    createApp({
      ...readConfig({}),
      database: { url: 'postgres://localhost/unused' },
      model: { baseUrl: 'unused', apiKey: 'unused', model: 'unused' },
      modelClient: new MockModelClient(),
    })

    const model = new MockModelClient()
    model.enqueue({ text: '你好' })
    const ctx = createApp(makeConfig(model))
    await ctx.start()

    const sessionId = await ctx.session.createSession()
    const handle = await ctx.agent.start(sessionId, '打招呼')
    expect(await handle.done).toBe('done')

    await ctx.stop()
  })
})
