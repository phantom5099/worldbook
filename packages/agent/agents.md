# agent

turn/step 两级 ReAct 循环与对外入口。源码 `src/`：`loop.ts`（LoopFactory 纯函数）、`service.ts`（AgentService + TurnHandle）、`index.ts`（仅 re-export）；测试 `test/loop.test.ts`。

## 结构

- `createLoop(deps)` → `{ runTurn(sessionId, input, {claim, signal}) }`：**不自己 claim**——调用方先 `TurnRegistry.claim` 拿到 claim，loop 收尾时负责 `settle`。
- `AgentService.start(sessionId, input)` → `TurnHandle {turnId, done, interrupt}`：同步 claim、发 `transition:running` 帧、后台跑 loop；`interrupt()` 走 AbortController，不进状态机。
- `done` promise：resolve 为 `TurnEndReason`（done/max_steps/interrupted/error），并在 settle 后补发终态 `transition` 帧。

## 单 step 流程

getContext（全量投影）→ completeStream（delta 即时播发 sink）→ `assistant_message` 落库 → 有 toolCalls 则 `tool_call` 事件 → executeBatch → 逐条 `tool_result` 事件（单条 payload `{callId, name, status, result}`，与 context 投影配对）→ 继续。

## 不变量与边界

- **claim 在调用方，settle 在 loop**：loop 任何退出路径（含异常）都到达 settle；`turn_ended` 落库失败也不阻塞 settle（终态必须到达）。
- `max_steps`（默认 10）只在步数耗尽且最后一步仍要工具时返回；最后一步自然出文本则 `done`。
- 错误回合：模型/落库抛错 → `error` + 错误信息写入 turn_ended payload；signal 已中止时一律归为 `interrupted`。
- 子代理结果回灌：不需要显式注入——context 每步全量重投影，`subagent_result`/`subagent_message` 事件自然进入下一轮上下文。
- LoopFactory 是纯函数：不持有会话、不感知传输协议，依赖全部构造注入。
- `context` 依赖用结构化类型 `ContextView`（Promise 版 getContext），不绑死 ContextService 类。

## 依赖

session、context、model、tool、sink、turn（接口层）；无 cordis。
