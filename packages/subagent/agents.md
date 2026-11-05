# subagent

子智能体：spawn（可选会话复用）、mailbox 互通信、状态/等待与结果回注。源码 `src/subagent.ts`、`src/status.ts`（`index.ts` 仅 re-export），测试 `test/subagent.test.ts`、`test/status.test.ts`。

## 结构

- `SubagentService.spawn(parentSessionId, spec {systemPrompt, task, maxSteps?}, opts? {sessionId?})` → 子会话 id，立即返回（子 loop 后台执行）。
  - 不带 `opts.sessionId`：新建子会话（`parent_id` + `depth`）。
  - 带 `opts.sessionId`：复用既有子会话续跑；目标必须是 `parent_id` 指向父会话的子会话，否则抛 `SubagentReuseError`。
  - 向父会话 append `subagent_spawned`（含 `task`、`systemPrompt`、`reused`、可选 `maxSteps`）。
- `send(from, to, message, opts? {wake?})`：同根校验（沿 parent_id 链）后向目标会话 append `subagent_message`；跨根抛 `SubagentSendScopeError`。默认投递后以该事件的 seq 唤醒目标会话，`wake: false` 仅入队。
- `wait(childSessionId, opts? {timeoutMs?})` → `SubagentWaitResult {status, result?, timedOut?}`：默认超时 30000ms，超时返回当前快照并带 `timedOut: true`；未知 id 返回 `{status: 'unknown'}`。
- `status(childSessionId)` → `SubagentStatusSnapshot {status, result?}`：只读折叠，不激活子 Agent。
- `listChildren(parentSessionId)` → `SubagentInfo[]`：扫描父会话 `subagent_spawned`/`subagent_result` 目录，逐个折叠子会话状态。
- 结果回注：子 loop 结束取最终 assistant_message，超长截断（默认 4000 字符），向父会话 append `subagent_result`，随后以该事件的 seq 唤醒父会话。

## 状态折叠（`src/status.ts`）

- `SubagentStatus`：`running | completed | failed | cancelled | interrupted | unknown`。
- `foldSubagentStatus(events, active)`：按 `turn_started`/`turn_ended` 折叠；未闭合时有活跃执行者为 `running`，否则为 `interrupted`（进程重启遗留）；闭合后按 reason 映射：`done`/`max_steps` → `completed`，`error` → `failed`，`interrupted` → `cancelled`；无回合记录为 `unknown`。
- 进程内活跃记录（inflight 子 loop、TurnRegistry 中的 claim）优先于日志：复用的子会话在上一轮 `turn_ended` 与新一轮 `turn_started` 之间日志仍是旧终态，此时状态报 `running`。
- 重启后无活跃执行者，状态完全由事件日志折叠得出，无需启动扫描。

## 不变量与边界

- 深度限制：`depth > maxDepth`（v1 = 2）时 spawn 抛 `SubagentDepthLimitError`。
- 复用/新建的子会话同样受 turn 状态机约束：子会话已有活跃 turn 时 claim 抛 `TurnAlreadyActiveError`。
- 通信范围是全同根拓扑（父↔子、兄弟互发）。
- 结果与消息全部经事件日志交付，无跨会话回调；子 loop 的 claim/settle 与主 loop 共用同一 TurnRegistry。
- 完成推送是进程内加速：`wait` 通过 waiter 集合即时返回；日志折叠对重启后的等待同样成立。
- 唤醒携带触发事件 seq：目标会话有活跃 turn 时 `AgentService` 挂起唤醒，该 turn 收尾前已读到该事件则丢弃，否则收尾后补开一轮，收尾窗口不丢唤醒。
- 工具化暴露（spawn/send_message/wait_subagent 三个 ToolDefinition）在 app 装配层注册，见 app 模块。

## 依赖

复用 agent 的 `createLoop`（每个 spawn 按 spec 构造独立 loop 实例）；依赖 session、sink、turns、context、model、tools；可选 `wake(sessionId, seq)` 回调由装配层接到 `AgentService.wake`。
