# agent

turn/step 两级 ReAct 循环与对外入口。源码 `src/`：`loop.ts`（LoopFactory 纯函数）、`service.ts`（AgentService + TurnHandle）、`index.ts`（仅 re-export）；测试 `test/loop.test.ts`。

## 结构

- `createLoop(deps)` → `{ runTurn(sessionId, {claim, signal, input?, onContextRead?}) }`：**不自己 claim**——调用方先 `TurnRegistry.claim` 拿到 claim，loop 收尾时负责 `settle(sessionId, reason)`。缺省 `input` 时不写 `user_message`，由日志中已有事件（如 `subagent_result`）驱动本轮；`turn_started` 前先修复日志中未闭合的孤儿 turn，并把 `claim.turnId` 写入 `turn_started` 载荷。每步读取上下文后通过 `onContextRead(lastSeq)` 报告快照覆盖的事件序号。工具 specs 在每步请求前经 `deps.tools.list()` 重新读取（ToolService 运行期可注册/注销）；system prompt 不经过 context，由 loop 在请求组装时置于消息首位。
- `sessionTurnIds(session)`：`TurnIdSource` 实现，从会话日志最后一个带数字 `turnId` 的 `turn_started` 恢复回合编号；装配层用它构造 `TurnRegistry`，使重启后的编号续接而非重置。
- `AgentService.start(sessionId, input)` → `Promise<TurnHandle {turnId, done, interrupt}>`：异步 claim、发 `transition:running` 帧、后台跑 loop；`interrupt()` 走 AbortController，不进状态机。
- `AgentService.wake(sessionId, seq)` → `Promise<TurnHandle | undefined>`：由 seq 对应的事件驱动一轮、不写输入。会话已有活跃 turn 时返回 `undefined`，并把唤醒挂起：该 turn 后续读取的上下文若始终没覆盖到 seq，收尾后自动补开一轮；已被下一步读到则丢弃，不产生多余回合。
- `done` promise：resolve 为 `TurnEndReason`（done/max_steps/interrupted/error），并在 settle 后补发终态 `transition` 帧。

## 单 step 流程

getContextSnapshot（全量投影，回报快照覆盖的 seq）→ completeStream（delta 即时播发 sink）→ `assistant_message` 落库 → 有 toolCalls 则 `tool_call` 事件 → executeBatch → 逐条 `tool_result` 事件（单条 payload `{callId, name, status, result}`，与 context 投影配对）→ 继续。

## 不变量与边界

- **claim 在调用方，settle 在 loop**：claim 为异步（读取持久化回合编号），loop 任何退出路径（含异常）都到达 `settle(sessionId, reason)`；`turn_ended` 落库失败也不阻塞 settle（终态必须到达）。
- `max_steps`（默认 16）只在步数耗尽且最后一步仍要工具时返回；最后一步自然出文本则 `done`。
- 错误回合：模型/落库抛错 → `error` + 错误信息写入 turn_ended payload；signal 已中止时一律归为 `interrupted`。
- 子代理结果回灌：不需要显式注入——context 每步全量重投影，`subagent_result`/`subagent_message` 事件自然进入下一轮上下文。
- 孤儿 turn 修复发生在 `runTurn` 内、`turn_started` 之前（补写 `turn_ended {reason: 'interrupted', steps: 0}` 并播发事件）；不做启动扫描，修复后日志保证同一会话的 turn 不嵌套。
- LoopFactory 是纯函数：不持有会话、不感知传输协议，依赖全部构造注入。
- `context` 依赖用结构化类型 `ContextView`（`getContextSnapshot` 返回消息与覆盖的 seq），不绑死 ContextService 类。

## 依赖

session、context、model、tool、sink、turn（接口层）；无 cordis。
