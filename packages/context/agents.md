# context

会话上下文投影。源码 `src/context.ts`（`index.ts` 仅 re-export），测试 `test/context.test.ts`。

## 结构

- `projectMessages(events)`：纯函数，事件日志 → LLM 消息数组，可独立单测。
- `ContextService.getContextSnapshot(sessionId)`：getHistory + projectMessages，返回 `ContextSnapshot {messages, lastSeq}`（`lastSeq` 为快照覆盖的最后一条事件 seq，空会话为 0）。loop 每 step 调用。

## 投影规则

- `user_message` / `assistant_message` → 对应消息；assistant 载荷里的 `toolCalls` 与后续 `tool_result` 按 callId 配对生成 `tool` 消息。
- 有 `toolCalls` 但日志中始终没有对应 `tool_result` 的调用（崩溃、`tool_result` 落库失败等），在 assistant 消息之后补一条内容为 `aborted` 的 `tool` 消息；否则接口会因缺配对被拒绝。
- `tool_call` 事件仅审计，不投影（工具调用意图已随 assistant_message 载荷进入上下文）。
- `subagent_result` / `subagent_message` → 带发送方归属的 user 消息（子代理通信的回灌通道）。
- 其余类型（turn/step/subagent_spawned）为审计事件，不投影。

## 不变量与边界

- 压缩/裁剪是投影函数的内部实现演进，`getContextSnapshot` 接口不变；本版无压缩。
- system prompt 不参与投影：本模块只投影事件日志，系统提示词由 agent 在请求组装时置于消息首位。
