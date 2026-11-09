# sink

事件投放。源码 `src/sink.ts`（`index.ts` 仅 re-export），测试 `test/sink.test.ts`。

## 职责

会话级有序帧队列的多播：SSE 消费入口 `attach`，生产方 `emit`，停机 `close`。`appendAndEmit(session, sink, sessionId, type, payload)` 供生产方统一"先落库再播发 event 帧"，agent loop 与 subagent 共用。

## 帧类型（SinkFrame）

- `transition`：状态机转移（由 turn/agent 在 claim/settle 时产出）。
- `event`：已落库事件的镜像（仅在 SessionService.append 成功后发出，保证与 DB 一致）。
- `delta`：模型流式片段，仅此帧不落库。

## 不变量与边界

- 每会话所有生产方向同一队列 emit，消费者看到的帧序与 emit 序一致。
- 无消费者时 emit 静默丢弃：event 帧可从 DB 重放，delta 本就不可重放。
- 只播发订阅之后的帧；消费者 break（for-await return）即解除订阅：`return()` 走队列唯一的 `release()` 出口——结束迭代、清空未读 buffer、释放挂起的 waiter（挂起中的 `next()` 立即 done）并从 `consumers` 注销；可重复调用。HTTP 层的正常结束、断连与异常统一依赖此语义。
- 构造参数 `options.maxBufferedFrames` 是单个订阅的未消费帧上限，缺省时不限制：delta 在暂停或超限时直接丢弃；非 delta 帧超限时走 `release()` 结束该订阅，由客户端重连并按历史重放。
- `attach` 返回 `SinkSubscription`，除异步迭代外提供 `pause()` / `resume()`：暂停期间只丢弃 delta，transition / event 帧继续缓冲。HTTP 层在响应背压时暂停订阅、drain 后恢复。
- cordis `ctx.emit` 不承担会话流（方案 D-7），本模块是有序流的唯一通道。
