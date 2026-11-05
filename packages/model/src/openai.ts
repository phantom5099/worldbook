import OpenAI from 'openai'
import type {
  ChatCompletionFunctionTool,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions'
import type {
  ModelClient,
  ModelEvent,
  ModelMessage,
  ModelRequest,
  ModelToolCall,
  ModelToolSpec,
  ModelUsage,
} from './model.js'

export function toOpenAiMessages(messages: readonly ModelMessage[]): ChatCompletionMessageParam[] {
  return messages.map((message) => {
    if (message.role === 'assistant') {
      const toolCalls = message.toolCalls ?? []
      const param: ChatCompletionMessageParam = {
        role: 'assistant',
        content: message.content,
        ...(toolCalls.length > 0
          ? {
              tool_calls: toolCalls.map((call) => ({
                id: call.callId,
                type: 'function' as const,
                function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
              })),
            }
          : {}),
      }
      return param
    }
    if (message.role === 'tool') {
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content }
    }
    return { role: message.role, content: message.content }
  })
}

export function toOpenAiTools(tools: readonly ModelToolSpec[]): ChatCompletionFunctionTool[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: (tool.parameters ?? {
        type: 'object',
        properties: {},
      }) as ChatCompletionFunctionTool['function']['parameters'],
    },
  }))
}

interface AccumulatedToolCall {
  id: string
  name: string
  arguments: string
}

export interface OpenAiClientOptions {
  baseUrl: string
  apiKey: string
  model: string
  headers?: Record<string, string>
  fetchImpl?: typeof fetch
}

export class OpenAICompatClient implements ModelClient {
  private readonly client: OpenAI
  private readonly model: string

  constructor(opts: OpenAiClientOptions) {
    this.client = new OpenAI({
      baseURL: opts.baseUrl,
      apiKey: opts.apiKey,
      ...(opts.headers ? { defaultHeaders: opts.headers } : {}),
      ...(opts.fetchImpl ? { fetch: opts.fetchImpl } : {}),
    })
    this.model = opts.model
  }

  async *completeStream(request: ModelRequest): AsyncIterable<ModelEvent> {
    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: toOpenAiMessages(request.messages),
        tools: request.tools.length > 0 ? toOpenAiTools(request.tools) : undefined,
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal: request.signal },
    )

    let text = ''
    const calls = new Map<number, AccumulatedToolCall>()
    let usage: ModelUsage | undefined

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta
      if (delta?.content) {
        text += delta.content
        yield { type: 'delta', text: delta.content }
      }
      for (const fragment of delta?.tool_calls ?? []) {
        const acc = calls.get(fragment.index) ?? { id: '', name: '', arguments: '' }
        if (fragment.id) acc.id = fragment.id
        if (fragment.function?.name) acc.name = fragment.function.name
        if (fragment.function?.arguments) acc.arguments += fragment.function.arguments
        calls.set(fragment.index, acc)
      }
      if (chunk.usage) {
        usage = {
          ...(chunk.usage.prompt_tokens !== undefined
            ? { inputTokens: chunk.usage.prompt_tokens }
            : {}),
          ...(chunk.usage.completion_tokens !== undefined
            ? { outputTokens: chunk.usage.completion_tokens }
            : {}),
        }
      }
    }

    const toolCalls: ModelToolCall[] = [...calls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, acc]) => {
        let args: unknown
        try {
          args = acc.arguments ? JSON.parse(acc.arguments) : {}
        } catch {
          throw new Error(`model returned malformed tool arguments for ${acc.name}: ${acc.arguments}`)
        }
        return { callId: acc.id, name: acc.name, args }
      })

    yield { type: 'message', text, toolCalls, ...(usage ? { usage } : {}) }
  }
}
