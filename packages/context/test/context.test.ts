import { describe, expect, it } from 'vitest'
import { projectMessages, type AssistantToolCall } from '../src/index.js'
import type { SessionEvent, SessionEventType } from '@worldbook/session'

let seq = 0

function event(type: SessionEventType, payload: unknown): SessionEvent {
  return { seq: ++seq, type, payload, createdAt: new Date() }
}

describe('projectMessages', () => {
  it('user / assistant 事件映射为对应消息', () => {
    const messages = projectMessages([
      event('user_message', { text: '你好' }),
      event('assistant_message', { text: '你也好' }),
    ])
    expect(messages).toEqual([
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你也好' },
    ])
  })

  it('assistant 的 toolCalls 与 tool_result 配对生成 tool 消息', () => {
    const toolCalls: AssistantToolCall[] = [{ callId: 'c1', name: 'roll', args: { sides: 6 } }]
    const messages = projectMessages([
      event('assistant_message', { text: '', toolCalls }),
      event('tool_call', { callId: 'c1', name: 'roll', args: { sides: 6 } }),
      event('tool_result', { callId: 'c1', name: 'roll', status: 'ok', result: '4' }),
    ])
    expect(messages).toEqual([
      { role: 'assistant', content: '', toolCalls },
      { role: 'tool', toolCallId: 'c1', content: '4' },
    ])
  })

  it('孤立 tool_result（无对应 callId）被跳过', () => {
    const messages = projectMessages([
      event('tool_result', { callId: 'ghost', result: 'x' }),
    ])
    expect(messages).toEqual([])
  })

  it('有 toolCalls 但无 tool_result 时逐个补 aborted', () => {
    const toolCalls: AssistantToolCall[] = [
      { callId: 'c1', name: 'roll', args: { sides: 6 } },
      { callId: 'c2', name: 'look', args: {} },
    ]
    const messages = projectMessages([event('assistant_message', { text: '', toolCalls })])
    expect(messages).toEqual([
      { role: 'assistant', content: '', toolCalls },
      { role: 'tool', toolCallId: 'c1', content: 'aborted' },
      { role: 'tool', toolCallId: 'c2', content: 'aborted' },
    ])
  })

  it('部分 tool_result 缺失时只补未配对的调用', () => {
    const toolCalls: AssistantToolCall[] = [
      { callId: 'c1', name: 'roll', args: { sides: 6 } },
      { callId: 'c2', name: 'look', args: {} },
    ]
    const messages = projectMessages([
      event('assistant_message', { text: '', toolCalls }),
      event('tool_result', { callId: 'c1', name: 'roll', status: 'ok', result: '4' }),
    ])
    expect(messages).toEqual([
      { role: 'assistant', content: '', toolCalls },
      { role: 'tool', toolCallId: 'c2', content: 'aborted' },
      { role: 'tool', toolCallId: 'c1', content: '4' },
    ])
  })

  it('每条 assistant 消息的缺失调用各自补齐', () => {
    const first: AssistantToolCall[] = [{ callId: 'a1', name: 'roll', args: {} }]
    const second: AssistantToolCall[] = [{ callId: 'b1', name: 'look', args: {} }]
    const messages = projectMessages([
      event('assistant_message', { text: '', toolCalls: first }),
      event('user_message', { text: '继续' }),
      event('assistant_message', { text: '', toolCalls: second }),
    ])
    expect(messages).toEqual([
      { role: 'assistant', content: '', toolCalls: first },
      { role: 'tool', toolCallId: 'a1', content: 'aborted' },
      { role: 'user', content: '继续' },
      { role: 'assistant', content: '', toolCalls: second },
      { role: 'tool', toolCallId: 'b1', content: 'aborted' },
    ])
  })

  it('错位的 tool_result 不算已配对，对应调用仍补 aborted', () => {
    const toolCalls: AssistantToolCall[] = [{ callId: 'c1', name: 'roll', args: {} }]
    const messages = projectMessages([
      event('tool_result', { callId: 'c1', result: '出现早于声明' }),
      event('assistant_message', { text: '', toolCalls }),
    ])
    expect(messages).toEqual([
      { role: 'assistant', content: '', toolCalls },
      { role: 'tool', toolCallId: 'c1', content: 'aborted' },
    ])
  })

  it('纯文本 assistant（无工具调用）不带 toolCalls 字段', () => {
    const messages = projectMessages([event('assistant_message', { text: 'hi' })])
    expect(messages).toEqual([{ role: 'assistant', content: 'hi' }])
  })

  it('subagent_result / subagent_message 投影为带归属的 user 消息', () => {
    const messages = projectMessages([
      event('subagent_result', { childSessionId: 'child-1', content: '提案内容' }),
      event('subagent_message', { fromSessionId: 'peer-1', content: '消息内容' }),
    ])
    expect(messages).toEqual([
      { role: 'user', content: expect.stringContaining('子智能体（id：child-1）') },
      { role: 'user', content: expect.stringContaining('智能体（id：peer-1）') },
    ])
  })

  it('turn/tool_call/spawned 等审计事件不进入上下文', () => {
    const messages = projectMessages([
      event('turn_started', {}),
      event('tool_call', { callId: 'c9', name: 'x', args: {} }),
      event('subagent_spawned', {}),
      event('turn_ended', { reason: 'done' }),
    ])
    expect(messages).toEqual([])
  })

  it('user_message 缺 text 字段时跳过', () => {
    const messages = projectMessages([event('user_message', { nope: 1 })])
    expect(messages).toEqual([])
  })
})
