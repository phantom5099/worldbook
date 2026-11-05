export interface ModelToolCall {
  callId: string
  name: string
  args: unknown
}

export type ModelMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ModelToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string }

export interface ModelUsage {
  inputTokens?: number
  outputTokens?: number
}

export interface ModelToolSpec {
  name: string
  description: string
  parameters: unknown
}

export interface ModelRequest {
  messages: readonly ModelMessage[]
  tools: readonly ModelToolSpec[]
  signal: AbortSignal
}

export type ModelEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; call: ModelToolCall }
  | { type: 'message'; text: string; toolCalls: ModelToolCall[]; usage?: ModelUsage }

export interface ModelClient {
  completeStream(request: ModelRequest): AsyncIterable<ModelEvent>
}

interface MockResponse {
  text?: string
  toolCalls?: ModelToolCall[]
  usage?: ModelUsage
  error?: string
  deltas?: string[]
}

export class MockModelClient implements ModelClient {
  readonly requests: ModelRequest[] = []
  private queue: MockResponse[] = []

  enqueue(...responses: MockResponse[]): void {
    this.queue.push(...responses)
  }

  async *completeStream(request: ModelRequest): AsyncIterable<ModelEvent> {
    this.requests.push(request)
    if (request.signal.aborted) throw new Error('aborted before completion')
    const response = this.queue.shift()
    if (!response) throw new Error('MockModelClient: no scripted response')
    if (response.error) throw new Error(response.error)
    if (response.deltas) {
      for (const text of response.deltas) yield { type: 'delta', text }
    }
    const text = response.text ?? (response.deltas ? response.deltas.join('') : '')
    yield { type: 'message', text, toolCalls: response.toolCalls ?? [], usage: response.usage }
  }
}

