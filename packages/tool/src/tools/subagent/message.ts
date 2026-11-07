import { z } from 'zod'
import type { ToolDefinition } from '../../tool.js'
import type { SubagentToolHost } from './host.js'

export function createSendMessageTool(resolve: () => SubagentToolHost): ToolDefinition {
  return {
    name: 'send_message',
    description: '向同一根会话下的其他智能体投递消息；目标运行中在下一步吸收，空闲时会被唤醒。',
    parameters: z.object({
      to: z.string().describe('目标会话 id'),
      content: z.string().describe('消息内容'),
    }),
    execute: async (args: { to: string; content: string }, ctx) => {
      await resolve().send(ctx.sessionId, args.to, args.content)
      return { result: 'sent' }
    },
  }
}
