import type { SessionEvent, SessionId } from '@worldbook/session'
import type { SessionService } from '@worldbook/session'
export interface AssistantToolCall {
  callId: string
  name: string
  args: unknown
}

export type LlmMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: AssistantToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string }

export interface ContextOptions {
  system?: string
}

export interface ContextSnapshot {
  messages: LlmMessage[]
  /** 快照覆盖的最后一条事件 seq；空会话为 0。 */
  lastSeq: number
}

function projectUserText(payload: unknown): string | undefined {
  if (typeof payload === 'object' && payload !== null && 'text' in payload) {
    const text = (payload as { text: unknown }).text
    if (typeof text === 'string') return text
  }
  return undefined
}

export function projectMessages(
  events: readonly SessionEvent[],
  opts: ContextOptions = {},
): LlmMessage[] {
  const messages: LlmMessage[] = []
  if (opts.system !== undefined) {
    messages.push({ role: 'system', content: opts.system })
  }
  const knownCallIds = new Set<string>()
  for (const event of events) {
    if (event.type === 'assistant_message') {
      const payload = event.payload as { text?: string; toolCalls?: AssistantToolCall[] }
      const toolCalls = payload.toolCalls ?? []
      for (const call of toolCalls) knownCallIds.add(call.callId)
      messages.push({ role: 'assistant', content: payload.text ?? '', toolCalls: toolCalls.length > 0 ? toolCalls : undefined })
      continue
    }
    if (event.type === 'tool_result') {
      const payload = event.payload as { callId?: string; result?: string }
      if (payload.callId === undefined || !knownCallIds.has(payload.callId)) continue
      messages.push({ role: 'tool', toolCallId: payload.callId, content: payload.result ?? '' })
      continue
    }
    if (event.type === 'user_message') {
      const text = projectUserText(event.payload)
      if (text !== undefined) messages.push({ role: 'user', content: text })
      continue
    }
    if (event.type === 'subagent_result') {
      const payload = event.payload as { childSessionId?: string; content?: string }
      messages.push({
        role: 'user',
        content: `以下是子智能体（id：${payload.childSessionId ?? 'unknown'}）执行完成后的结果：\n${payload.content ?? ''}`,
      })
      continue
    }
    if (event.type === 'subagent_message') {
      const payload = event.payload as { fromSessionId?: string; content?: string }
      messages.push({
        role: 'user',
        content: `以下是来自于智能体（id：${payload.fromSessionId ?? 'unknown'}）的信息：\n${payload.content ?? ''}`,
      })
      continue
    }
  }
  return messages
}

export class ContextService {
  constructor(private readonly session: SessionService) {}

  async getContextSnapshot(
    sessionId: SessionId,
    opts: ContextOptions = {},
  ): Promise<ContextSnapshot> {
    const events = await this.session.getHistory(sessionId)
    return {
      messages: projectMessages(events, opts),
      lastSeq: events.at(-1)?.seq ?? 0,
    }
  }

  async getContext(sessionId: SessionId, opts: ContextOptions = {}): Promise<LlmMessage[]> {
    return (await this.getContextSnapshot(sessionId, opts)).messages
  }
}
