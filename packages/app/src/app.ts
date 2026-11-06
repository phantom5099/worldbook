import { Context, Service } from '@cordisjs/core'
import type { Plugin } from '@cordisjs/core'
import { DbService as PostgresDb, ensureSchema } from '@worldbook/db'
import type { Sql } from '@worldbook/db'
import { PostgresSessionStore, SessionService } from '@worldbook/session'
import type { SessionStore } from '@worldbook/session'
import { ContextService } from '@worldbook/context'
import { EventSink } from '@worldbook/sink'
import { TurnRegistry } from '@worldbook/turn'
import { ToolService, builtinTools } from '@worldbook/tool'
import { OpenAICompatClient } from '@worldbook/model'
import type { ModelClient } from '@worldbook/model'
import { AgentService, sessionTurnIds } from '@worldbook/agent'
import { SubagentService } from '@worldbook/subagent'
import { createHttpServer } from '@worldbook/http'
import type { HttpOptions, HttpServerHandle } from '@worldbook/http'

declare module '@cordisjs/core' {
  interface Context {
    db?: DatabaseService
    session: SessionService
    context: ContextService
    model: ModelClient
    turns: TurnRegistry
    sink: EventSink
    agent: AgentService
    subagent: SubagentService
    /** 仅在 config.http 配置时存在（startApp 启动后可读实际端口） */
    http?: HttpServerHandle
  }
}

export class DatabaseService extends Service<{ url: string }> {
  static [Service.provide] = 'db'
  sql!: Sql
  private database!: PostgresDb

  constructor(ctx: Context, config: { url: string }) {
    super(ctx, config)
  }

  protected override async start() {
    this.database = new PostgresDb(this.config.url)
    this.sql = this.database.sql
    await ensureSchema(this.sql)
  }

  protected override async stop() {
    await this.database.close()
  }
}

export interface AppConfig {
  database: { url: string } | { store: SessionStore }
  model: { baseUrl: string; apiKey: string; model: string }
  /** 测试/开发注入自定义模型客户端，优先于 model 配置 */
  modelClient?: ModelClient
  system?: string
  maxSteps?: number
  /** 配置后 startApp 启动 HTTP+SSE 传输层；缺省不启动（纯装配/测试用） */
  http?: HttpOptions
  /** 子代理结果/消息到达时是否唤醒空闲会话（默认 true） */
  wakeOnResult?: boolean
}

const assemble: Plugin.Object<Context, AppConfig> = {
  name: 'worldbook',
  inject: { tools: { required: true } },
  apply(ctx: Context, config: AppConfig) {
    const store = 'store' in config.database ? config.database.store : new PostgresSessionStore(ctx.db!.sql)

    const session = new SessionService(store)
    const context = new ContextService(session)
    const model = config.modelClient ?? new OpenAICompatClient(config.model)
    const tools = ctx.tools
    const turns = new TurnRegistry(sessionTurnIds(session))
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
              void agent.wake(sessionId, seq)
            },
          }),
    })

    ctx.set('session', session)
    ctx.set('context', context)
    ctx.set('model', model)
    ctx.set('turns', turns)
    ctx.set('sink', sink)
    ctx.set('agent', agent)
    ctx.set('subagent', subagent)
  },
}

export function createApp(config: AppConfig): Context {
  const root = new Context()
  root.plugin(ToolService)
  root.plugin(builtinTools)
  if ('url' in config.database) {
    root.plugin(DatabaseService, { url: config.database.url })
    assemble.inject = { tools: { required: true }, db: { required: true } }
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
