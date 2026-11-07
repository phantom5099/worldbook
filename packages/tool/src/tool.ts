import { z } from 'zod'
import { Service } from '@cordisjs/core'
import type { Context } from '@cordisjs/core'

interface ToolRunContext {
  sessionId: string
  turnId: number
  signal: AbortSignal
}

export interface ToolCall {
  callId: string
  name: string
  args: unknown
}

type ToolCallStatus = 'ok' | 'error'

export interface ToolCallResult {
  callId: string
  name: string
  status: ToolCallStatus
  result: string
}

interface ToolResult<R = unknown> {
  result: R
  display?: string
}

export interface ToolDefinition<A = unknown, R = unknown> {
  name: string
  description: string
  parameters: z.ZodType<A>
  output?: z.ZodType<R>
  execute(args: A, ctx: ToolRunContext): Promise<ToolResult<R>>
}

export interface ModelToolSpec {
  name: string
  description: string
  parameters: unknown
}

declare module '@cordisjs/core' {
  interface Context {
    tools: ToolService
  }
}

/** 工具注册表与执行入口；工具插件经 `register` 自我注册，注册随调用方作用域销毁。 */
export class ToolService extends Service {
  static [Service.provide] = 'tools'

  private readonly defs = new Map<string, ToolDefinition>()

  constructor(ctx: Context) {
    super(ctx)
  }

  /** 注册单个工具；返回的 disposer 只移除本次注册。 */
  register(def: ToolDefinition): () => void {
    if (this.defs.has(def.name)) {
      throw new Error(`tool ${def.name} already registered`)
    }
    this.defs.set(def.name, def)
    return () => {
      if (this.defs.get(def.name) === def) this.defs.delete(def.name)
    }
  }

  /** 按当前注册投影模型可见的 specs；每次请求重新计算。 */
  list(): ModelToolSpec[] {
    return [...this.defs.values()].map((def) => ({
      name: def.name,
      description: def.description,
      parameters: z.toJSONSchema(def.parameters),
    }))
  }

  async executeBatch(calls: readonly ToolCall[], ctx: ToolRunContext): Promise<ToolCallResult[]> {
    return Promise.all(calls.map((call) => this.executeOne(call, ctx)))
  }

  private async executeOne(call: ToolCall, ctx: ToolRunContext): Promise<ToolCallResult> {
    if (ctx.signal.aborted) {
      return { callId: call.callId, name: call.name, status: 'error', result: 'aborted' }
    }
    const def = this.defs.get(call.name)
    if (!def) {
      return { callId: call.callId, name: call.name, status: 'error', result: `unknown tool: ${call.name}` }
    }
    let args: unknown
    try {
      args = def.parameters.parse(call.args)
    } catch (error) {
      return {
        callId: call.callId,
        name: call.name,
        status: 'error',
        result: `invalid arguments: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
    try {
      const raw = await def.execute(args as never, ctx)
      if (def.output) {
        def.output.parse(raw.result)
      }
      return {
        callId: call.callId,
        name: call.name,
        status: 'ok',
        result: raw.display ?? JSON.stringify(raw.result),
      }
    } catch (error) {
      return {
        callId: call.callId,
        name: call.name,
        status: 'error',
        result: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
