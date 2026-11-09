# app

cordis 装配与进程入口。源码 `src/`：`app.ts`（装配）、`config.ts`（环境变量解析与校验）、`main.ts`（进程入口）、`index.ts`（仅 re-export）；测试 `test/assembly.test.ts`。内存存储 MemoryStore 位于 session 包的 `testing` 子路径，由调用方注入。

## 结构

- `DatabaseService`（cordis Service，name `db`）：复用 db 包的 `DbService` 建连接池，`ensureSchema`（幂等建表），stop 时关闭。
- `createApp(config)` / `startApp(config)`：`createApp` 先挂 tool 包的 `ToolService` 与 `builtinTools` 插件，再挂装配插件；装配插件由 `createAssemble(withDb)` **按配置构造**（`database: {url}` 时 `inject` 追加 `{db: required}`，`{store}` 时只注入 `tools`），不再改写模块级插件对象——同一进程内先后装配不同 database 形态的 app 互不影响。装配插件把 db/session/context/model/turns/sink/agent/subagent 经 `ctx.set` 注册到 ctx（tools 由 ToolService 自身提供）；`{store}` 时直接使用调用方注入的 `SessionStore`（测试/无 PG 环境自行构造 MemoryStore）。`TurnRegistry` 以 `sessionTurnIds(session)` 构造，回合编号从会话日志续接。
- 工具集由 tool 包自注册：内置工具的定义与 `ctx.tools.register` 都在 tool 包的 `builtinTools` 插件内完成；app 只负责挂载插件，不接触注册表。
- `config.http?: {port, host?}`：startApp 在 ctx.start() 后用 @worldbook/http 的 `createHttpServer` 启动传输层，句柄经 `ctx.set('http', ...)` 暴露（`ctx.http.port()` 取实际端口），`ctx.on('dispose')` 时 stop。
- 装配时把 SubagentService 的 `wake(sessionId, seq)` 回调接到 `AgentService.wake`，子代理结果/消息到达时以对应事件 seq 唤醒会话（活跃 turn 期间挂起，收尾时未被读到则补开一轮）。`wake` 在装配层是 `void` 契约：返回的 promise 由装配层 `catch` 后记录日志，subagent 侧不持有悬空 promise。
- ctx 服务类型经 `declare module '@cordisjs/core'` 的 `interface Context` 合并提供（cordis 3.18.1：Service 子类用 `static [Service.provide]` 命名、`ctx.plugin` 注册、ready 后 `ctx.set` 暴露）。

## 配置

- `config.ts` 的 `readConfig(env)` 是唯一的环境变量读取入口：`main.ts` 只调用一次并把结果交给 `startApp`，其他模块不读 `process.env`。缺必填项、未知 `MODEL_PRESET` 或数值非法时抛错，进程启动失败，错误信息给出变量名与当前值。
- 数据库：`DATABASE_URL` 必填。
- 模型：`MODEL_PRESET`（deepseek/gpt/glm，见 model 包 `PROVIDER_PRESETS`）选中预置后只需对应 `apiKeyEnv` 声明的变量，baseUrl 与默认模型取自预置；不用预置时 `MODEL_BASE_URL`、`MODEL_API_KEY`、`MODEL_NAME` 三项必填。`MODEL_NAME` 可覆盖预置默认模型。
- HTTP：`HTTP_PORT` 缺省 3000；解析结果必带 `http`，可直接读 `config.http.port`。
- 缓存上限：`TURN_STATE_MAX_ENTRIES`（turn 终态快照，默认 100000）、`SESSION_COUNTER_MAX_ENTRIES`（会话 seq 计数器，默认 100000）、`SINK_MAX_BUFFERED_FRAMES`（单订阅未消费帧，默认 1024）。解析结果即 `AppConfig`，同名字段注入各服务构造参数。
- 本地文件：`pnpm dev`、`pnpm migrate` 用 `tsx --env-file-if-exists` 依次加载仓库根 `.env`、`.env.local`（后者覆盖前者，均 gitignore），模板为被跟踪的 `.env.example`；切换本地配置改用 `pnpm exec tsx --env-file=.env.<名称> packages/app/src/main.ts`。部署由平台注入环境变量，`pnpm start` 不加载任何文件。

## 不变量与边界

- app 不接触工具注册表：工具注册由 tool 包的 `builtinTools` 插件完成，注册随插件作用域销毁；装配层只声明对 `tools` 服务的依赖。
- `modelClient` 配置可注入 Mock（测试/冒烟）；生产走 OpenAICompatClient。
- 装配插件不做任何运行期决策，只做构造与注册；业务逻辑全在下游模块。
- 环境差异只经环境变量表达，装配代码与启动命令不随环境分叉；供应商与环境不绑定。

## 依赖

全部下游模块（含 `@worldbook/http`）；`@cordisjs/core`（本模块装配与 tool 包的 Service 基类）。
