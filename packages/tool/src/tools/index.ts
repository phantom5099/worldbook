import type { Context, Plugin } from '@cordisjs/core'
import type { SubagentToolHost } from './subagent/host.js'
import { createSendMessageTool } from './subagent/message.js'
import { createSpawnTool } from './subagent/spawn.js'
import { createWaitSubagentTool } from './subagent/wait.js'

const FACTORIES = [createSpawnTool, createSendMessageTool, createWaitSubagentTool]

/** 内置工具插件：向 ctx.tools 注册子代理工具，注册随插件作用域销毁。 */
export const builtinTools: Plugin.Object<Context> = {
  name: 'worldbook-tool-builtin',
  inject: { tools: { required: true } },
  apply(ctx) {
    // subagent 依赖 ToolService 构造，只能执行期解析，避免反向包依赖与构造循环。
    const host = () => ctx.get('subagent') as SubagentToolHost
    for (const create of FACTORIES) ctx.effect(() => ctx.tools.register(create(host)))
  },
}
