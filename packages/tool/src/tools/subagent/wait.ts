import { z } from 'zod'
import type { ToolDefinition } from '../../tool.js'
import type { SubagentToolHost } from './host.js'

export function createWaitSubagentTool(resolve: () => SubagentToolHost): ToolDefinition {
  return {
    name: 'wait_subagent',
    description: '等待指定子智能体结束；超时返回当前状态（timedOut）。',
    parameters: z.object({
      sessionId: z.string().describe('spawn 返回的子会话 id'),
      timeoutMs: z.number().int().positive().optional().describe('超时毫秒数，默认 30000'),
    }),
    execute: async (args: { sessionId: string; timeoutMs?: number }) => {
      const result = await resolve().wait(args.sessionId, { timeoutMs: args.timeoutMs })
      return { result }
    },
  }
}
