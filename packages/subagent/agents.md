# subagent

子智能体：spawn（可选会话复用）、mailbox 互通信、wait 与结果回注。源码 `src/subagent.ts`（`index.ts` 仅 re-export），测试 `test/subagent.test.ts`。

## 结构

- `SubagentService.spawn(parentSessionId, spec {systemPrompt, task, maxSteps?}, opts? {sessionId?})` → 子会话 id，立即返回（子 loop 后台执行）。
  - 不带 `opts.sessionId`：新建子会话（`parent_id` + `depth`）。
  - 带 `opts.sessionId`：复用既有子会话续跑；目标必须是 `parent_id` 指向父会话的子会话，否则抛 `SubagentReuseError`。
- `send(from, to, message)`：同根校验（沿 parent_id 链）后向目标会话 append `subagent_message`；跨根抛 `SubagentSendScopeError`。
- `wait(childSessionId)` → `SubagentResult {childSessionId, reason, content, truncated}`；未知 id 抛错。
- 结果回注：子 loop 结束取最终 assistant_message，超长截断（默认 4000 字符），向父会话 append `subagent_result`。

## 不变量与边界

- 深度限制：`depth > maxDepth`（v1 = 2）时 spawn 抛 `SubagentDepthLimitError`。
- 复用/新建的子会话同样受 turn 状态机约束：子会话已有活跃 turn 时 claim 抛 `TurnAlreadyActiveError`。
- 通信范围是全同根拓扑（父↔子、兄弟互发）。
- 投递是纯队列语义：接收方在自己的 step 边界经全量重投影吸收，空闲不唤醒；需要唤醒走 spawn 复用入口。
- 子代理结果与消息全部经事件日志交付，无跨会话回调；子 loop 的 claim/settle 与主 loop 共用同一 TurnRegistry。
- 工具化暴露（spawn/send_message/wait_subagent 三个 ToolDefinition）在 app 装配层注册，见 app 模块。

## 依赖

复用 agent 的 `createLoop`（每个 spawn 按 spec 构造独立 loop 实例）；依赖 session、sink、turns、context、model、tools。
