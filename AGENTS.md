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

## 工作规范

- 文档用中文、中性陈述句；引用外部项目或数据必须给出处，禁止编造任何证据、方案或代码现状。
- `agents.md` 只引用仓库内被跟踪的内容——源码、其他层级的 `agents.md`、`docs/` 下的文档；仓库外内容与 gitignore 内容一律不提及（含外部项目名与其文档章节号）。
- TypeScript 工程规范、包划分、测试约定见 `packages/AGENTS.md`；包级细节见各包目录下的 `agents.md`。

## 行为红线

- 禁止在当前轮未明确要求时主动修改仓库内容（源码、配置、文档）；只做被要求的事，不顺手重构、不扩张范围。
- 禁止主动执行 commit / push / reset 等影响 git 历史或工作区的操作，仅用户显式要求时进行；`git status` / `git diff` / `git log` 等只读操作不受限。
- 禁止纯格式化、重排、重命名的无效修改，污染 diff。
- 禁止为"将来可能的扩展"预先设计；不做兼容、兜底旧代码。
- 修改过程中发现的错误：属于本轮改动范围就修（含测试）；不属于则在收尾时指出，不擅自扩大范围。
- 回答问题逐点回应不遗漏；没验证过的结论明确说明未验证。

## 运行环境

Node ≥ 22，包管理器 pnpm（workspace 根在仓库根）。当前无数据库实例时，涉及 PostgreSQL 的集成测试自动跳过（见 `packages/session/test/`）。

- 命令：`pnpm test` / `pnpm typecheck` / `pnpm migrate`（数据库迁移，需 `DATABASE_URL`）/ `pnpm start`（进程入口）/ `pnpm smoke [-- --live]`（端到端冒烟）。
- 前端命令：在 `web/` 下 `pnpm dev` / `pnpm test` / `pnpm typecheck` / `pnpm build`，或在仓库根 `pnpm --filter @worldbook/web <script>`。
- 环境配置：`APP_ENV`（development/production）选择仓库根的 `.env.<APP_ENV>`（已 gitignore，需自建）；模型供应商经 `MODEL_PRESET`（deepseek/gpt/glm）选预置，API key 放对应预置声明的环境变量。前端使用 `VITE_API_BASE`（会话接口基地址）、`VITE_SESSION_MODE=mock`（会话改用本地模拟）与开发代理目标 `API_TARGET`。
