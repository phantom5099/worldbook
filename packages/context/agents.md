# context

会话上下文投影。源码 `src/context.ts`（`index.ts` 仅 re-export），测试 `test/context.test.ts`。

## 结构

- `projectMessages(events, opts)`：纯函数，事件日志 → LLM 消息数组，可独立单测。
- `ContextService.getContextSnapshot(sessionId, opts)`：getHistory + projectMessages，返回 `ContextSnapshot {messages, lastSeq}`（`lastSeq` 为快照覆盖的最后一条事件 seq，空会话为 0）；`getContext` 只返回其中的 `messages`。loop 每 step 调用快照版。

## 投影规则

- `user_message` / `assistant_message` → 对应消息；assistant 载荷里的 `toolCalls` 与后续 `tool_result` 按 callId 配对生成 `tool` 消息。
- `tool_call` 事件仅审计，不投影（工具调用意图已随 assistant_message 载荷进入上下文）。
- `subagent_result` / `subagent_message` → 带发送方归属的 user 消息（子代理通信的回灌通道）。
- 其余类型（turn/step/subagent_spawned）为审计事件，不投影。
- `opts.system` 置于消息序列首位。

## 不变量与边界

- 压缩/裁剪是投影函数的内部实现演进，`getContextSnapshot` 接口不变；本版无压缩。
- 本模块不关心 system prompt 内容来源，由调用方传入。
