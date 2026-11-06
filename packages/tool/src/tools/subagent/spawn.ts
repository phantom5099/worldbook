import { z } from 'zod'
import type { ToolDefinition } from '../../tool.js'
import type { SubagentToolHost } from './host.js'

export function createSpawnTool(resolve: () => SubagentToolHost): ToolDefinition {
  return {
    name: 'spawn',
    description:
      '启动一个子智能体执行任务（异步，立即返回子会话 id）。完成后结果自动回注到当前会话，空闲时会被唤醒处理。传 sessionId 可复用既有子代理会话续跑。',
    parameters: z.object({
      task: z.string().describe('交给子智能体的任务描述'),
      systemPrompt: z.string().describe('子智能体的系统提示词'),
      sessionId: z.string().optional().describe('复用的子代理会话 id'),
    }),
    execute: async (args: { task: string; systemPrompt: string; sessionId?: string }, ctx) => {
      const childId = await resolve().spawn(
        ctx.sessionId,
        { systemPrompt: args.systemPrompt, task: args.task },
        { sessionId: args.sessionId },
      )
      return { result: { childSessionId: childId } }
    },
  }
}
