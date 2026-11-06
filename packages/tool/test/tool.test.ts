import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { ToolCallResult } from '../src/index.js'
import { createTestToolService } from '../testing/tool-service.js'

const echo = {
  name: 'echo',
  description: '回显输入',
  parameters: z.object({ text: z.string() }),
  execute: async (args: { text: string }) => ({ result: args.text }),
}

function makeCtx(signal = new AbortController().signal) {
  return { sessionId: 's1', turnId: 1, signal }
}

describe('ToolService 注册', () => {
  it('重名注册报错', () => {
    const tools = createTestToolService()
    tools.register(echo)
    expect(() => tools.register(echo)).toThrow(/already registered/)
  })

  it('注册实时可见，disposer 只移除自己那次注册', async () => {
    const tools = createTestToolService()
    tools.register(echo)
    const disposeLate = tools.register({
      name: 'late',
      description: '',
      parameters: z.object({}),
      execute: async () => ({ result: 1 }),
    })
    expect(tools.list().map((spec) => spec.name)).toEqual(['echo', 'late'])

    disposeLate()
    expect(tools.list().map((spec) => spec.name)).toEqual(['echo'])
    const results = await tools.executeBatch([{ callId: 'c1', name: 'late', args: {} }], makeCtx())
    expect(results[0]).toMatchObject({ status: 'error', result: /unknown tool/ })
  })
})

describe('ToolService.list', () => {
  it('返回 name/description/JSON Schema', () => {
    const tools = createTestToolService()
    tools.register(echo)
    const specs = tools.list()
    expect(specs).toHaveLength(1)
    expect(specs[0]).toMatchObject({ name: 'echo', description: '回显输入' })
    const parameters = specs[0]!.parameters as Record<string, unknown>
    expect(parameters.type).toBe('object')
    expect(parameters.properties).toMatchObject({ text: { type: 'string' } })
  })
})

describe('ToolService.executeBatch', () => {
  it('正常路径：参数解析后执行，结果默认 JSON 序列化', async () => {
    const tools = createTestToolService()
    tools.register(echo)
    const results = await tools.executeBatch(
      [{ callId: 'c1', name: 'echo', args: { text: '你好' } }],
      makeCtx(),
    )
    expect(results).toEqual([
      { callId: 'c1', name: 'echo', status: 'ok', result: '"你好"' },
    ])
  })

  it('display 优先于 JSON 序列化', async () => {
    const tools = createTestToolService()
    tools.register({
      ...echo,
      name: 'echo_display',
      parameters: z.object({ text: z.string() }),
      execute: async (args: { text: string }) => ({ result: args.text, display: `回显：${args.text}` }),
    })
    const results = await tools.executeBatch(
      [{ callId: 'c1', name: 'echo_display', args: { text: 'x' } }],
      makeCtx(),
    )
    expect(results[0]).toMatchObject({ status: 'ok', result: '回显：x' })
  })

  it('未知工具返回 error，不抛出', async () => {
    const tools = createTestToolService()
    const results = await tools.executeBatch(
      [{ callId: 'c1', name: 'nope', args: {} }],
      makeCtx(),
    )
    expect(results[0]).toMatchObject({ status: 'error', result: /unknown tool/ })
  })

  it('参数不合法返回 error，不抛出', async () => {
    const tools = createTestToolService()
    tools.register(echo)
    const results = await tools.executeBatch(
      [{ callId: 'c1', name: 'echo', args: { wrong: 1 } }],
      makeCtx(),
    )
    expect(results[0]).toMatchObject({ status: 'error', result: /invalid arguments/ })
  })

  it('工具抛错转为 error 结果，模型拿到形状一致的结果', async () => {
    const tools = createTestToolService()
    tools.register({
      ...echo,
      name: 'boom',
      parameters: z.object({}),
      execute: async () => {
        throw new Error('炸了')
      },
    })
    const results = await tools.executeBatch(
      [{ callId: 'c1', name: 'boom', args: {} }],
      makeCtx(),
    )
    expect(results[0]).toMatchObject({ status: 'error', result: '炸了' })
  })

  it('output schema 校验失败按错误处理', async () => {
    const tools = createTestToolService()
    tools.register({
      ...echo,
      name: 'bad_output',
      parameters: z.object({}),
      output: z.object({ count: z.number() }),
      execute: async () => ({ result: { count: 'not-a-number' } }),
    })
    const results = await tools.executeBatch(
      [{ callId: 'c1', name: 'bad_output', args: {} }],
      makeCtx(),
    )
    expect(results[0]).toMatchObject({ status: 'error' })
  })

  it('signal 已中止时直接返回 error，不执行', async () => {
    const controller = new AbortController()
    controller.abort()
    let called = false
    const tools = createTestToolService()
    tools.register({
      ...echo,
      name: 'probe',
      parameters: z.object({}),
      execute: async () => {
        called = true
        return { result: null }
      },
    })
    const results = await tools.executeBatch(
      [{ callId: 'c1', name: 'probe', args: {} }],
      makeCtx(controller.signal),
    )
    expect(called).toBe(false)
    expect(results[0]).toMatchObject({ status: 'error', result: 'aborted' })
  })

  it('批次内并发执行，结果按调用顺序返回', async () => {
    const tools = createTestToolService()
    tools.register({
      ...echo,
      name: 'slow',
      parameters: z.object({ ms: z.number() }),
      execute: async (args: { ms: number }) => {
        await new Promise((resolve) => setTimeout(resolve, args.ms))
        return { result: args.ms }
      },
    })
    const results: ToolCallResult[] = await tools.executeBatch(
      [
        { callId: 'a', name: 'slow', args: { ms: 30 } },
        { callId: 'b', name: 'slow', args: { ms: 1 } },
      ],
      makeCtx(),
    )
    expect(results.map((r) => r.callId)).toEqual(['a', 'b'])
    expect(results.every((r) => r.status === 'ok')).toBe(true)
  })
})
