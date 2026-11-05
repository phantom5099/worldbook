# app

cordis 装配与进程入口。源码 `src/`：`app.ts`（装配）、`main.ts`（进程入口，APP_ENV 灰度开关）、`index.ts`（仅 re-export）；测试 `test/assembly.test.ts`。内存存储 MemoryStore 已下沉到 session 包。

## 结构

- `DbService`（cordis Service，name `db`）：postgres 连接池 + `ensureSchema`（幂等建表），stop 时关闭——唯一有生命周期的服务。
- `createApp(config)` / `startApp(config)`：装配插件把 db/session/context/model/tools/turns/sink/agent/subagent 经 `ctx.set` 注册到 ctx；`database: {url}` 时声明 `inject: {db: required}`，`{memory: true}` 时用 MemoryStore（开发/测试，无 PG 依赖）。`TurnRegistry` 以 `sessionTurnIds(session)` 构造，回合编号从会话日志续接。
- `config.http?: {port, host?}`：startApp 在 ctx.start() 后用 @worldbook/http 的 `createHttpServer` 启动传输层，句柄经 `ctx.set('http', ...)` 暴露（`ctx.http.port()` 取实际端口），`ctx.on('dispose')` 时 stop。
- `registerSubagentTools(registry, resolve)`：把 spawn / send_message / wait_subagent 三个 ToolDefinition 注册进装配期注册表；`resolve` 闭包延迟到执行期取 SubagentService。
- `config.wakeOnResult`（默认 true）：SubagentService 的 `wake(sessionId, seq)` 回调接到 `AgentService.wake`，子代理结果/消息到达时以对应事件 seq 唤醒会话（活跃 turn 期间挂起，收尾时未被读到则补开一轮）；置 false 时 SubagentService 不持有 `wake`。
- ctx 服务类型经 `declare module '@cordisjs/core'` 的 `interface Context` 合并提供（cordis 3.18.1：Service 子类用 `static [Service.provide]` 命名、`ctx.plugin` 注册、ready 后 `ctx.set` 暴露）。

## 环境与灰度开关

- `main.ts`：`APP_ENV`（默认 development）选择仓库根 `.env.<APP_ENV>`（gitignore，自建）；同一套装配代码，环境差异全部收敛在 env 文件。
- 模型配置：`MODEL_PRESET`（deepseek/gpt/glm，见 model 包 `PROVIDER_PRESETS`）选中预置后只需对应 `apiKeyEnv` 声明的变量；或不用预置直接给 `MODEL_BASE_URL`/`MODEL_API_KEY`。`MODEL_NAME` 可覆盖预置默认模型，`HTTP_PORT` 缺省 3000，`DATABASE_URL` 必填。

## 不变量与边界

- 工具注册必须发生在 `registry.toService()` 快照之前；快照后运行期工具集不可变（tool 模块保证）。
- `modelClient` 配置可注入 Mock（测试/冒烟）；生产走 OpenAICompatClient。
- 装配插件不做任何运行期决策，只做构造与注册；业务逻辑全在下游模块。
- 灰度开关即换 `APP_ENV`；供应商与环境不绑定（同一 env 文件里配什么就用什么）。

## 依赖

全部下游模块（含 `@worldbook/http`）；`@cordisjs/core`（仅本模块与测试使用 cordis API）。
