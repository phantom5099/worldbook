# Worldbook

AI 文字开放世界：单人、文字优先的 AI 叙事游戏。

> 本文件是 AI 编码代理进入本仓库的**第一入口**。动代码前先读它，并据此定位目标代码。
>
> **优先级**：对话中用户的明确指令 > 距被改文件最近的 `agents.md` > 本文件。
> 实现细节以源码为准。
>
> **活文档**：源码行为、结构、命令或约定变更时，必须同步更新对应层级的 `agents.md`（本仓库约定是"保持副本正确"，允许写实现细节，但写下的内容随行为变更负责到底）。

## 目录地图

| 目录 | 内容 | 何时进入 |
|---|---|---|
| `packages/` | 服务端运行时，pnpm workspace 多包（`@worldbook/*`，本仓库当前主体） | 规范见其下 `packages/AGENTS.md` |
| `scripts/` | 命令行入口：`migrate.ts`（数据库迁移）、`smoke.ts`（临时端到端冒烟，前端就绪后废弃） | 跑 `pnpm migrate` / `pnpm smoke` 时 |
| `web/` | Vue 3 前端（Vite + Pinia + Vue Router），多数数据源使用本地 mock，会话可切换为 HTTP/SSE | 改前端时；规范见其下 `web/AGENTS.md` |
| `rule/` | 代码实现完成后的复核规则（`review.md`） | 完成一轮实现、准备派发复核时 |

## 工作规范

- 文档用中文、中性陈述句；引用外部项目或数据必须给出处，禁止编造任何证据、方案或代码现状。
- `agents.md` 只引用仓库内被跟踪的内容——源码、其他层级的 `agents.md`、`docs/` 下的文档；仓库外内容与 gitignore 内容一律不提及（含外部项目名与其文档章节号）。
- TypeScript 工程规范、包划分、测试约定见 `packages/AGENTS.md`；包级细节见各包目录下的 `agents.md`。

## 代码复核

- 代码实现与验证完成后，必须派发独立的复核子智能体，按 `rule/review.md` 复核；实现者不自行出具复核结论。
- 派发提示词先声明角色与任务，开头写明“你是负责复核代码的子智能体。你的任务是……”，再提供原始需求与验收点、改动文件清单与最终 diff、已执行的验证命令及结果、明确不做的部分；要求复核者直接读代码与调用链，不只看转述。
- 复核者只读：不修改源码、不执行 git 写操作、不新增依赖；可运行验证命令，只输出发现与证据。
- 主智能体逐条处理报告：不改变原需求行为、且属于本轮范围的问题，修复后重新验证；修复改变了行为或触及新路径时，再派一次增量复核。
- 需要变更原需求行为，或修复超出本次方案范围的，不得直接修改：整理清楚后上报用户决定。

## 行为红线

- 禁止在当前轮未明确要求时主动修改仓库内容（源码、配置、文档）；只做被要求的事，不顺手重构、不扩张范围。
- 禁止主动执行 commit / push / reset 等影响 git 历史或工作区的操作，仅用户显式要求时进行；`git status` / `git diff` / `git log` 等只读操作不受限。
- 禁止纯格式化、重排、重命名的无效修改，污染 diff。
- 禁止为"将来可能的扩展"预先设计；不做兼容、兜底旧代码。
- 修改过程中发现的错误：属于本轮改动范围就修（含测试）；不属于则在收尾时指出，不擅自扩大范围。
- 回答问题逐点回应不遗漏；没验证过的结论明确说明未验证。

## 运行环境

Node ≥ 22，包管理器 pnpm（workspace 根在仓库根）。当前无数据库实例时，涉及 PostgreSQL 的集成测试自动跳过（见 `packages/session/test/`）。

- 命令：`pnpm test` / `pnpm typecheck` / `pnpm dev`（本地入口，依次加载 `.env`、`.env.local`）/ `pnpm migrate`（数据库迁移，需 `DATABASE_URL`，本地同样加载这两个文件）/ `pnpm start`（进程入口，只读进程环境变量）/ `pnpm smoke [-- --live]`（端到端冒烟）。
- 前端命令：在 `web/` 下 `pnpm dev` / `pnpm test` / `pnpm typecheck` / `pnpm build`，或在仓库根 `pnpm --filter @worldbook/web <script>`。
- 环境配置：应用运行时的环境变量由 `packages/app/src/config.ts` 的 `readConfig` 统一读取并校验，必填项缺失或格式非法时启动失败（`pnpm migrate` 只读取 `DATABASE_URL`）；本地开发以仓库根 `.env.example` 为模板创建 `.env` 与 `.env.local`（后者覆盖前者，均 gitignore），由 `pnpm dev`、`pnpm migrate` 加载，部署由平台注入同名变量，`pnpm start` 不加载文件。模型供应商经 `MODEL_PRESET`（deepseek/gpt/glm）选预置，API key 放对应预置声明的环境变量；不用预置时填 `MODEL_BASE_URL`、`MODEL_API_KEY`、`MODEL_NAME`。进程内结构上限经 `TURN_STATE_MAX_ENTRIES`（默认 100000）、`SESSION_COUNTER_MAX_ENTRIES`（默认 100000）、`SINK_MAX_BUFFERED_FRAMES`（默认 1024）配置。前端使用 `VITE_API_BASE`（会话接口基地址）、`VITE_SESSION_MODE=mock`（会话改用本地模拟）与开发代理目标 `API_TARGET`。
- 持续集成：`.github/workflows/ci.yml` 在 PR、push 到 `main` 与手动触发时运行；Node 22 执行后端类型检查，检测到 `web/package.json` 时再执行前端类型检查、测试与构建；Node 22/24 矩阵配合 PostgreSQL 18 执行迁移与全部测试。
