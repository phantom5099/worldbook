# packages

服务端运行时 workspace，pnpm 多包分布。
> 优先级：对话中用户的明确指令 > 距被改文件最近的 `agents.md` > 本文件。本文件是**活文档**：源码行为、结构、命令或约定变更时，必须同步更新对应层级（本文件与各包的 `agents.md`）——仓库约定是"保持副本正确"，允许写实现细节，但写下的内容随行为变更负责到底。

## 结构

pnpm workspace 根在仓库根（`pnpm-workspace.yaml` → `packages/*`）。每个模块是独立 npm 包 `@worldbook/<module>`，`exports` 直接指向 TS 源（`./src/index.ts`），无构建产物；跨模块 import 一律用包名（如 `@worldbook/session`），模块内部相对导入保留 `.js` 后缀。各包 `node_modules` 下是 pnpm 生成的 workspace 符号链接（生成物，不提交）。

每个包内部文件划分：具体实现放 `<模块>.ts`（如 `turn/src/turn.ts`），`index.ts` 只做 re-export（公共 API 边界）；实现拆多文件时（如 agent 的 loop/service、session 的 types/store/pg-store）同样由 index 聚合导出，消费者只从包名导入。

## 技术栈与工程约定

- TypeScript 5.9，`NodeNext` 模块；strict + `noUncheckedIndexedAccess`；默认不写注释，只在非显然的约束处写一行。
- 测试：vitest，位于各包 `<module>/test/*.test.ts`，与 `src/` 同级；测试规则见下「测试规则」。
- 命令在仓库根执行：`pnpm test`、`pnpm typecheck`。
- 依赖声明规则：跨包导入写进该包 `dependencies`（仅测试用的写 `devDependencies`），由 pnpm workspace `workspace:*` 链接。
- 导出规则：不增加没有使用者的 `export`。仅供本文件或本包内部使用的声明不加 `export`；只有被其他文件引用的符号才出现在包入口 `index.ts` 的导出面上。

## 测试规则

**唯一判据**：改生产代码的逻辑，测试必须失败；改不影响行为的文案、命名、注释、格式，测试不应失败。不满足此判据的用例一律不写。

**该怎么写**：

- 只断言可观察的行为：给定输入 → 返回值、副作用、状态变化、抛出的错误。断言对象是生产代码的结果，不是测试里自造的数据。
- 采用 Arrange-Act-Assert：一段准备、一段触发、一段断言，一个用例只验证一个概念。
- 用例名描述行为与预期，不描述实现细节。
- 覆盖边界与失败路径（边界值、空集合、错误分支），这里才是缺陷高发区。
- 按层级选择：纯函数用单元测试；跨模块链路用集成测试（mock 掉外部依赖如 LLM），验证真实装配后的端到端行为。

**禁止写的类型**：

1. 文案 / 提示词断言——断言提示词、系统说明、注释、UI 文案包含或不再包含某个字符串。提示词是产品内容，其变更由人工评审守护，不写成测试。
2. 类型形状断言——运行时断言某字面量有哪些字段、字段是什么类型。类型正确性由 `tsc` 保证，这类断言恒真且零信息量；确需钉住类型时用编译期的 `@ts-expect-error` / `expectTypeOf`，不要写成运行时 `expect`。
3. 存在性 / 导出断言——断言文件存在、类 / 函数 / 服务已导出、方法存在。真断裂时编译与上层用例会同时失败，此类用例不提供额外信息。
4. 常量钉死——断言常量等于它自身的字面量。需要守护的是行为，不是常量的副本。
5. 测试内重新实现逻辑——在测试里重写一遍待测算法再断言自己写的副本，只证明写法一致，发现不了实现缺陷。
6. 源码文本 / 结构扫描——用字符串或正则解析源码断言导入、布局或写法。这属于静态分析：类型与导入可解析性由 `tsc` 保证，无需重复。
7. 占位 / 恒真断言——`expect(true).toBe(true)`、只 `toBeDefined()` 不校验值、以及无论如何都会通过的断言。
8. 重复用例——与已有用例覆盖同一行为的副本；发现重复应合并，不要并存。

**其他**：

- 测试必须独立、确定、可任意顺序执行，不依赖执行顺序或共享可变状态（每个用例自备数据并自行清理）。
- 不为「将来可能的变化」预留用例，只覆盖当前真实存在的行为。
- 新增 / 删除测试前先取得用户许可。

## 模块地图与依赖方向

```text
db ← session ← context ← agent ← http ← app（cordis 装配）
turn（独立）        sink（独立）
model、tool（独立，被 agent 消费）
subagent ← agent(LoopFactory) + session + model + tool + sink + turn
http ← subagent（子代理状态端点）
```

| 包 | 职责 |
|---|---|
| `db` | postgres.js 连接池封装 + 版本化迁移（migrations/），唯一 DB 出口 |
| `session` | 事件类型定义；事件追加（seq 分配）、历史获取；PostgresSessionStore（MemoryStore 在 `testing` 子路径） |
| `turn` | turn 状态机：claim（异步、按 session 互斥）、settle 幂等唯一终态、getState 快照；回合号由持久化日志续接 |
| `sink` | 会话级有序帧队列：transition / event / delta；流式帧不落库 |
| `model` | ModelClient 接口；Mock 实现（测试）与 OpenAI 官方 SDK 实现（baseURL 覆盖）；供应商预置表 |
| `tool` | ToolDefinition（Zod 参数必选、输出 schema 可选）；`ToolService`（cordis 服务 `tools`，`register` 返回 disposer）；`builtinTools` 插件自注册内置工具；`list()` 按当前注册投影 specs；executeBatch 统一错误兜底 |
| `context` | 事件日志 → LLM 消息投影（纯函数，快照附带覆盖的 seq）；压缩不在此版 |
| `agent` | LoopFactory 纯函数（turn/step 两级循环）；AgentService.start / wake 入口（活跃 turn 唤醒挂起、收尾按需补开）；孤儿 turn 修复 |
| `subagent` | spawn（可选 sessionId 复用子会话）、send（同根互通信）、status/wait 日志折叠、listChildren；结果回注与按事件 seq 唤醒父会话 |
| `http` | HTTP+SSE 传输层：POST /sessions、POST /turns（409 互斥）、GET /sessions/:id/stream、GET /sessions/:id/history、GET /sessions/:id/subagents |
| `app` | cordis 插件装配：服务注册、依赖声明、进程入口、环境（APP_ENV）灰度开关 |

基础层（db 这类存储/基础设施包）与业务模块平级放在 `packages/` 下，不设独立的 infra 目录。包管理（pnpm workspace 链接）与运行时装配（cordis，见 app 包）是两个独立层面。

## 快速定位（我要改 X —— 去哪里）

| 你想做什么 | 去哪里 |
|---|---|
| 改 loop 循环 / 步进逻辑 | `packages/agent/src/loop.ts` |
| 改 Agent 对外入口 | `packages/agent/src/service.ts` |
| 改事件类型 / SSE 帧结构 | `packages/session/src/types.ts` |
| 改事件存储（内存/PG） | `packages/session/src/store.ts`、`pg-store.ts`、`packages/session/testing/memory-store.ts` |
| 改 turn 状态机（互斥/终态） | `packages/turn/src/turn.ts` |
| 改流式帧队列 | `packages/sink/src/sink.ts` |
| 改 LLM 调用 / SDK 适配 | `packages/model/src/openai.ts` |
| 改供应商预置（baseUrl/模型/key 变量） | `packages/model/src/presets.ts` |
| 改工具定义 / 执行 | `packages/tool/src/tool.ts`（定义与 ToolService）、`packages/tool/src/tools/` |
| 改上下文投影 | `packages/context/src/context.ts` |
| 改子代理 | `packages/subagent/src/` |
| 改 HTTP 路由 / SSE 端点 | `packages/http/src/http.ts` |
| 改表结构 | `packages/db/migrations/`（新增版本文件）+ `packages/db/src/migrate.ts` 登记 `MIGRATIONS` |
| 改装配 / 依赖注入 | `packages/app/src/app.ts` |
| 改环境变量 / 灰度开关 / 进程入口 | `packages/app/src/main.ts` |
| 新增工具给 agent 用 | 在 `packages/tool/src/tools/<域>/` 下按工具新建文件定义 `ToolDefinition`，在 `packages/tool/src/tools/index.ts` 的 `builtinTools` 插件里 `ctx.tools.register`（需要业务服务时在执行期从 ctx 解析） |
| 新增跨包依赖 | 该包 `package.json` 加 `workspace:*`，并更新两侧 `agents.md` 的依赖方向 |

## 跨包不变量（改代码前先确认没有破坏）

1. 事件日志是唯一真相源：任何进入 LLM 上下文或 SSE 的信息，除 delta 帧外必须先落库。
2. seq 由 SessionService 在单会话内串行分配（依赖 turn 的 claim 互斥），DB 主键兜底。
3. `settle` 是唯一终态出口且幂等；中断经 `TurnHandle.interrupt()` → AbortController → loop 收尾 → `settle('interrupted')`。
4. loop 工厂是纯函数，不持有会话、不感知传输协议；模块依赖经构造参数注入。
5. ToolService 的注册表运行期可变：内置工具由 tool 包的 `builtinTools` 插件经 `ctx.tools.register` 注册（注册随插件作用域销毁），loop 每步重新读取 specs；装配层只声明对 `tools` 服务的依赖。
