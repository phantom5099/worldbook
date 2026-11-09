# Web 前端

`web/` 是 Worldbook 的 Vue 单页应用。进入本目录改代码前先读本文件；上位规范见仓库根 `agents.md`。

## 技术栈与命令

- Vue 3（`<script setup lang="ts">`）、TypeScript strict、Vite、Pinia、Vue Router（hash history）、Vitest + jsdom + `@vue/test-utils`。
- 在 `web/` 下运行：`pnpm dev` / `pnpm test` / `pnpm typecheck` / `pnpm build`；在仓库根使用 `pnpm --filter @worldbook/web <script>`。
- 开发服务器默认监听 5173；`/sessions` 与 `/turns` 由 Vite 代理到 `API_TARGET`（默认 `http://localhost:3000`）。
- 类型检查与构建都用 `vue-tsc`；`@/` 映射到 `src/`。

## 目录职责

| 路径 | 内容 |
|---|---|
| `src/views/` | 路由页面：会话列表、新建会话、故事、世界书、世界详情、角色卡、角色、复盘、提供商；登录页不挂路由，由 `App.vue` 在未登录时渲染。 |
| `src/components/` | 可复用组件；`card/`、`common/`、`session/`、`shell/`、`story/`、`world/` 按用途分组。 |
| `src/stores/` | Pinia setup store：`auth`、`content`（世界书与角色卡）、`sessions`、`providers`、`ui`。 |
| `src/api/endpoints/types.ts` | 页面与状态层调用的后端端点契约；新增端点先在这里定义。 |
| `src/api/endpoints/` | 端点实现与组合根：`turns.ts` 是回合运行时的 HTTP 客户端，`index.ts` 的 `createApi` 装配并导出单例 `api`。 |
| `src/mocks/` | 尚无后端端点的 mock 实现、种子数据与 `MockTurnApi`。 |
| `src/api/` | 与 UI 无关的数据逻辑：类型、事件折叠（`turns.ts`）、SSE 解析（`sse.ts`）、归一化、错误与 ID。 |
| `src/styles/` | 从静态原型迁移的样式，入口为 `index.css`。 |
| `test/` | Vitest 测试，运行于 jsdom。 |

## 端点调用与 mock 边界

- 页面和 store 只通过 `api` 调用后端端点，不直接访问 `localStorage`。
- 回合运行时已有后端契约：`createApi` 默认装配 `HttpTurnApi`，请求基地址取 `VITE_API_BASE`（默认为空，走同源）；设置 `VITE_SESSION_MODE=mock` 时换成 `MockTurnApi`。
- 账号、世界书、角色卡、会话列表、提供商与起草器还没有后端端点，由 `src/mocks/` 的 mock 提供同签名实现。后端就绪后新增对应 HTTP 客户端并在 `createApi` 里切换，不提前编造端点。
- HTTP 契约：`POST /sessions`（`{ meta }` 返回 `{ sessionId }`）、`POST /turns`（`{ sessionId, input }`）、`GET /sessions/:id/history?afterSeq=`、`GET /sessions/:id/stream`。流帧为 `{ kind: 'transition' }`、`{ kind: 'event' }`、`{ kind: 'delta' }`。
- 提供商用量统计没有后端数据，界面显示 `—`；起草器由本地关键词规则生成可编辑草稿，不产生叙事内容。

## 账号与本地数据隔离

- `MockStore` 统一加前缀 `wb-mock:v1`；内容键为 `content:<ownerId>`，会话索引为 `sessions:<ownerId | anonymous>`，自定义提供商为 `providers:custom:<ownerId>`，账号列表全局共享。
- 每个账号首次访问内容时写入各自的种子世界书与角色卡；删除世界书会级联删除其下角色卡，世界默认主角卡不允许删除。
- 会话先以草稿存在本地，不创建服务端会话；`activate` 时才调用 `TurnApi.create`。`startUnit` 递增单元序号、清空轮次与完成标记，并为新单元创建新的服务端会话。

## 会话模型与流处理

- `SessionSnapshot` 是不可变快照。关系与复盘变化不写回快照，而是由 `replay` 把事件日志中的 `StateNote` 依次应用到快照副本上得到。
- 关系增量是元组 `[RelationLabel, string, 'up' | 'down']`，应用时把数值夹在 `0..1`。
- `foldTurns` 把 `SessionEvent[]` 折叠为 `TurnView[]`；`mergeEvents` 按 `seq` 去重排序。单个单元上限 12 轮。
- 进入故事页先 `loadHistory`，再为已激活会话连接流。`loadHistory` 结束时会调用 `syncProgress`，以历史中的完整回合数校正本地进度，覆盖“离开页面期间流被中断”的情况。
- 流帧处理：`delta` 累积到 `liveText`；`transition` 切换阶段，`done` / `error` 时刷新历史；`event` 合并进日志并重新折叠。离开故事页会中止流。
- 发送前由 `canSend` 校验：会话已激活、有 `serverId`、单元未完成且当前不在生成中。

## 编写约定

- 保持 TypeScript strict、`noUncheckedIndexedAccess` 与 `verbatimModuleSyntax`；类型导入使用 `import type`。
- 新增端点时先在 `api/endpoints/types.ts` 定义契约，再在 `mocks/` 提供 mock（有后端时在 `api/endpoints/` 写 HTTP 实现），最后通过 `createApi` 装配；不在页面里写条件分支选择实现。
- 测试替身统一放在 `src/mocks/` 或测试文件的 `vi.mock` 工厂中，不从生产入口导出仅供测试的接口。
- 测试使用 `MemoryStorage` + `MockStore` 隔离本地数据；涉及组件时挂载真实 router 与 Pinia。
- 页面迁移保持原型已有的 CSS 类名与结构，避免样式分叉。
