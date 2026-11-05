import { Context, Service } from '@cordisjs/core'
import type { Plugin } from '@cordisjs/core'
import postgres from 'postgres'
import { z } from 'zod'
import { ensureSchema } from '@worldbook/db'
import { MemoryStore, PostgresSessionStore, SessionService } from '@worldbook/session'
import type { SessionStore } from '@worldbook/session'
import { ContextService } from '@worldbook/context'
import { EventSink } from '@worldbook/sink'
import { TurnRegistry } from '@worldbook/turn'
import { ToolRegistry } from '@worldbook/tool'
import type { ToolService } from '@worldbook/tool'
import { OpenAICompatClient } from '@worldbook/model'
import type { ModelClient } from '@worldbook/model'
import { AgentService } from '@worldbook/agent'
import { SubagentService } from '@worldbook/subagent'
import { createHttpServer } from '@worldbook/http'
import type { HttpOptions, HttpServerHandle } from '@worldbook/http'

declare module '@cordisjs/core' {
  interface Context {
    db?: DbService
    session: SessionService
    context: ContextService
    model: ModelClient
    tools: ToolService
    turns: TurnRegistry
    sink: EventSink
    agent: AgentService
    subagent: SubagentService
    /** 仅在 config.http 配置时存在（startApp 启动后可读实际端口） */
    http?: HttpServerHandle
  }
}

export class DbService extends Service<{ url: string }> {
  static [Service.provide] = 'db'
  sql!: postgres.Sql

  constructor(ctx: Context, config: { url: string }) {
    super(ctx, config)
  }

  protected override async start() {
    this.sql = postgres(this.config.url)
    await ensureSchema(this.sql)
  }

  protected override async stop() {
    await this.sql.end({ timeout: 5 })
  }
}

export interface AppConfig {
  database: { url: string } | { memory: true }
  model: { baseUrl: string; apiKey: string; model: string }
  /** 测试/开发注入自定义模型客户端，优先于 model 配置 */
  modelClient?: ModelClient
  system?: string
  maxSteps?: number
  /** 配置后 startApp 启动 HTTP+SSE 传输层；缺省不启动（纯装配/测试用） */
  http?: HttpOptions
  /** 子代理结果/消息到达时是否唤醒空闲会话（默认 true） */
  wakeOnResult?: boolean
  /** 装配期工具注册；子代理工具经 registerSubagentTools 注册，resolve 延迟到执行期 */
  registerTools?: (registry: ToolRegistry, resolve: () => SubagentService) => void
}

/** 子代理能力以工具形式暴露给 loop；resolve 延迟到执行期以拿到装配完成的服务。 */
export function registerSubagentTools(registry: ToolRegistry, resolve: () => SubagentService): void {
  registry.set({
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
  })

  registry.set({
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
  })

  registry.set({
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
  })
}

const assemble: Plugin.Object<Context, AppConfig> = {
  name: 'worldbook',
  inject: {},
  apply(ctx: Context, config: AppConfig) {
    let store: SessionStore
    if ('memory' in config.database) {
      store = new MemoryStore()
    } else {
      store = new PostgresSessionStore(ctx.db!.sql)
    }

    const registry = new ToolRegistry()
    config.registerTools?.(registry, () => subagent)

    const session = new SessionService(store)
    const context = new ContextService(session)
    const model = config.modelClient ?? new OpenAICompatClient(config.model)
    const tools = registry.toService()
    const turns = new TurnRegistry()
    const sink = new EventSink()
    const agent = new AgentService({
      session,
      context,
      model,
      tools,
      turns,
      sink,
      system: config.system,
      maxSteps: config.maxSteps,
    })
    const subagent = new SubagentService({
      session,
      sink,
      turns,
      context,
      model,
      tools,
      ...(config.wakeOnResult === false
        ? {}
        : {
            wake: (sessionId: string, seq: number) => {
              agent.wake(sessionId, seq)
            },
          }),
    })

    ctx.set('session', session)
    ctx.set('context', context)
    ctx.set('model', model)
    ctx.set('tools', tools)
    ctx.set('turns', turns)
    ctx.set('sink', sink)
    ctx.set('agent', agent)
    ctx.set('subagent', subagent)
  },
}

export function createApp(config: AppConfig): Context {
  const root = new Context()
  if ('url' in config.database) {
    root.plugin(DbService, { url: config.database.url })
    assemble.inject = { db: { required: true } }
  }
  root.plugin(assemble, config)
  return root
}

export async function startApp(config: AppConfig): Promise<Context> {
  const ctx = createApp(config)
  await ctx.start()
  if (config.http) {
    const http = createHttpServer(
      { session: ctx.session, sink: ctx.sink, agent: ctx.agent, subagent: ctx.subagent },
      config.http,
    )
    await http.start()
    ctx.set('http', http)
    ctx.on('dispose', () => http.stop())
  }
  return ctx
}
