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

