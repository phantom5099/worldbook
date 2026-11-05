import { z } from 'zod'

export interface ToolRunContext {
  sessionId: string
  turnId: number
  signal: AbortSignal
}

export interface ToolCall {
  callId: string
  name: string
  args: unknown
}

export type ToolCallStatus = 'ok' | 'error'

export interface ToolCallResult {
  callId: string
  name: string
  status: ToolCallStatus
  result: string
}

export interface ToolResult<R = unknown> {
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

export interface ToolService {
  list(scope?: string): ModelToolSpec[]
  executeBatch(calls: readonly ToolCall[], ctx: ToolRunContext): Promise<ToolCallResult[]>
}

export class ToolRegistry {
  private defs = new Map<string, ToolDefinition>()

  set(def: ToolDefinition): void {
    if (this.defs.has(def.name)) {
      throw new Error(`tool ${def.name} already registered`)
    }
    this.defs.set(def.name, def)
  }

  toService(): ToolService {
    return new DefaultToolService(new Map(this.defs))
  }
}

class DefaultToolService implements ToolService {
  constructor(private readonly defs: ReadonlyMap<string, ToolDefinition>) {}

  list(_scope?: string): ModelToolSpec[] {
    void _scope
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
