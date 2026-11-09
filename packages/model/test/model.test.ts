import { describe, expect, it } from 'vitest'
import { MockModelClient } from '../testing/mock-model.js'
import { OpenAICompatClient, toOpenAiMessages, toOpenAiTools } from '../src/openai.js'
import type { ModelMessage } from '../src/index.js'

const controller = () => new AbortController()

describe('toOpenAiMessages', () => {
  it('映射 system 与 user', () => {
    const messages: ModelMessage[] = [
      { role: 'system', content: '你是叙事者' },
      { role: 'user', content: '进入酒馆' },
    ]
    expect(toOpenAiMessages(messages)).toEqual([
      { role: 'system', content: '你是叙事者' },
      { role: 'user', content: '进入酒馆' },
    ])
  })

  it('assistant 的 toolCalls 映射为 tool_calls 且参数 JSON 序列化', () => {
    const messages: ModelMessage[] = [
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ callId: 'call_1', name: 'echo', args: { x: 1 } }],
      },
    ]
    expect(toOpenAiMessages(messages)).toEqual([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'echo', arguments: '{"x":1}' } },
        ],
      },
    ])
  })

  it('无 toolCalls 的 assistant 不携带 tool_calls 字段', () => {
    expect(toOpenAiMessages([{ role: 'assistant', content: '好' }])).toEqual([
      { role: 'assistant', content: '好' },
    ])
  })

  it('tool 消息映射 tool_call_id', () => {
    expect(toOpenAiMessages([{ role: 'tool', toolCallId: 'call_1', content: 'ok' }])).toEqual([
      { role: 'tool', tool_call_id: 'call_1', content: 'ok' },
    ])
  })
})

describe('toOpenAiTools', () => {
  it('透传参数 schema，缺省 parameters 兜底为空对象 schema', () => {
    expect(
      toOpenAiTools([
        { name: 'echo', description: '回声', parameters: { type: 'object', properties: { x: { type: 'number' } } } },
        { name: 'noop', description: '空', parameters: undefined },
      ]),
    ).toEqual([
      {
        type: 'function',
        function: {
          name: 'echo',
          description: '回声',
          parameters: { type: 'object', properties: { x: { type: 'number' } } },
        },
      },
      {
        type: 'function',
        function: { name: 'noop', description: '空', parameters: { type: 'object', properties: {} } },
      },
    ])
  })
})

describe('MockModelClient', () => {
  it('按脚本产出 delta 与 message 事件，并记录请求', async () => {
    const model = new MockModelClient()
    model.enqueue({ deltas: ['你', '好'], usage: { inputTokens: 3, outputTokens: 2 } })
    const events = []
    for await (const ev of model.completeStream({
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      signal: controller().signal,
    })) {
      events.push(ev)
    }
    expect(events).toEqual([
      { type: 'delta', text: '你' },
      { type: 'delta', text: '好' },
      { type: 'message', text: '你好', toolCalls: [], usage: { inputTokens: 3, outputTokens: 2 } },
    ])
    expect(model.requests).toHaveLength(1)
    expect(model.requests[0]!.messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('脚本耗尽与显式 error 都抛错', async () => {
    const model = new MockModelClient()
    await expect(async () => {
      for await (const _ of model.completeStream({
        messages: [],
        tools: [],
        signal: controller().signal,
      })) {
        // no events
      }
    }).rejects.toThrow('no scripted response')

    model.enqueue({ error: 'boom' })
    await expect(async () => {
      for await (const _ of model.completeStream({
        messages: [],
        tools: [],
        signal: controller().signal,
      })) {
        // no events
      }
    }).rejects.toThrow('boom')
  })
})

describe('OpenAICompatClient', () => {
  const sse = (chunks: string[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        const encoder = new TextEncoder()
        for (const chunk of chunks) c.enqueue(encoder.encode(chunk))
        c.close()
      },
    })

  const fetchSse = (chunks: string[]) =>
    (async () =>
      new Response(sse(chunks), { status: 200, headers: { 'content-type': 'text/event-stream' } })) as unknown as typeof fetch

  it('解析文本 delta、工具调用分片与 usage', async () => {
    const client = new OpenAICompatClient({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'test-model',
      fetchImpl: fetchSse([
        'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"echo","arguments":"{\\"x\\""}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":1}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n',
        'data: [DONE]\n\n',
      ]),
    })

    const events = []
    for await (const ev of client.completeStream({
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      signal: controller().signal,
    })) {
      events.push(ev)
    }

    expect(events).toEqual([
      { type: 'delta', text: '你' },
      { type: 'delta', text: '好' },
      {
        type: 'message',
        text: '你好',
        toolCalls: [{ callId: 'call_1', name: 'echo', args: { x: 1 } }],
        usage: { inputTokens: 10, outputTokens: 5 },
      },
    ])
  })

  it('工具调用分片缺少 id 时生成 UUID', async () => {
    const client = new OpenAICompatClient({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'test-model',
      fetchImpl: fetchSse([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"echo","arguments":"{}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"","function":{"name":"look","arguments":"{}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":2,"function":{"name":"search","arguments":"{}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":2,"id":"call_9"}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    })

    const events = []
    for await (const ev of client.completeStream({
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      signal: controller().signal,
    })) {
      events.push(ev)
    }

    const message = events.at(-1)
    expect(message?.type).toBe('message')
    if (message?.type !== 'message') throw new Error('unreachable')
    const ids = message.toolCalls.map((call) => call.callId)
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    expect(ids).toHaveLength(3)
    expect(ids[0]).toMatch(uuid)
    expect(ids[1]).toMatch(uuid)
    expect(ids[0]).not.toBe(ids[1])
    expect(ids[2]).toBe('call_9')
  })

  it('非 2xx 抛出含状态码的错误', async () => {
    const client = new OpenAICompatClient({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'test-model',
      fetchImpl: (async () =>
        new Response('{"error":"rate limited"}', { status: 429 })) as unknown as typeof fetch,
    })
    await expect(async () => {
      for await (const _ of client.completeStream({
        messages: [],
        tools: [],
        signal: controller().signal,
      })) {
        // no events
      }
    }).rejects.toThrow('429')
  })

  it('请求体包含模型名、消息与 tools', async () => {
    let capturedBody: string | undefined
    const fetchCapture = (async (_url: unknown, init?: { body?: string }) => {
      capturedBody = init?.body
      return new Response(sse(['data: [DONE]\n\n']), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }) as unknown as typeof fetch

    const client = new OpenAICompatClient({
      baseUrl: 'https://api.example.com/v1/',
      apiKey: 'sk-test',
      model: 'test-model',
      fetchImpl: fetchCapture,
    })
    for await (const _ of client.completeStream({
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 'echo', description: '回声', parameters: { type: 'object', properties: {} } }],
      signal: controller().signal,
    })) {
      // drain
    }

    const body = JSON.parse(capturedBody!) as {
      model: string
      messages: unknown[]
      tools: unknown[]
      stream: boolean
    }
    expect(body.model).toBe('test-model')
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
    expect(body.tools).toHaveLength(1)
    expect(body.stream).toBe(true)
  })
})
