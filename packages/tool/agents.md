# tool

工具定义与执行。源码 `src/tool.ts`（定义 + cordis 服务）、`src/tools/`（内置工具与注册插件，`index.ts` 仅 re-export），测试 `test/tool.test.ts`、`testing/tool-service.ts`。

## 结构

- `ToolDefinition`：name / description / `parameters`（Zod，必选）/ `output`（Zod，可选）/ `execute`。
- `ToolService`（cordis Service，`static [Service.provide] = 'tools'`）：运行期注册表与执行入口。
  - `register(def)` 注册单个工具并返回 disposer；重名报错，disposer 只移除自己那次注册。
  - `list()` 按当前注册投影 JSON Schema specs，每次请求重新计算。
  - `executeBatch()` 按当前注册执行；任何失败（未知工具、参数不合法、执行抛错、output 校验失败、signal 已中止）都转为 `{ status: 'error', result: message }` 回灌，绝不抛出。
- `src/tools/index.ts` 的 `builtinTools`：cordis 插件（`inject: { tools: required }`），在 apply 时经 `ctx.effect(() => ctx.tools.register(...))` 注册 spawn / send_message / wait_subagent；注册随插件作用域销毁。
- `src/tools/subagent/{spawn,message,wait}.ts`：每个文件导出一个 `createXxxTool(resolve)` 工厂，返回单条 `ToolDefinition`；文件名与工具名一一对应。
- `src/tools/subagent/host.ts` 的 `SubagentToolHost`：本模块声明的结构化接口（spawn / send / wait）；工具执行期经 `ctx.get('subagent')` 解析，避免 tool → subagent 的包依赖与构造循环。
- `testing/tool-service.ts`：不启动 cordis 生命周期的 `createTestToolService()`，供不关心装配的测试使用。

## 不变量与错误语义

- 注册表在运行期可变：工具可在服务可用后的任意时刻注册或注销（disposer），loop 每步重新读取 specs；不存在装配期快照。
- `executeBatch` 批次内并发、结果按调用顺序返回。
- `output` schema 校验失败按错误处理；结果须为无损 JSON 可回放。
- 工具之间无可见性过滤：`list()` 无 scope 参数，所有注册的工具对所有会话可见。

## 依赖

`zod`（v4，`z.toJSONSchema` 导出 JSON Schema）、`@cordisjs/core`（Service 与被注入的 Context 声明）；类型上引用 session/turn 的 id 类型。不依赖 subagent：子代理能力经 `SubagentToolHost` 结构化接口在注册插件内延迟解析。
