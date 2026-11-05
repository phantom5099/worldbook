# sink

事件投放。源码 `src/sink.ts`（`index.ts` 仅 re-export），测试 `test/sink.test.ts`。

## 职责

会话级有序帧队列的多播：SSE 消费入口 `attach`，生产方 `emit`，停机 `close`。

## 帧类型（SinkFrame）

- `transition`：状态机转移（由 turn/agent 在 claim/settle 时产出）。
- `event`：已落库事件的镜像（仅在 SessionService.append 成功后发出，保证与 DB 一致）。
- `delta`：模型流式片段，仅此帧不落库。

## 不变量与边界

- 每会话所有生产方向同一队列 emit，消费者看到的帧序与 emit 序一致。
- 无消费者时 emit 静默丢弃：event 帧可从 DB 重放，delta 本就不可重放。
- 只播发订阅之后的帧；消费者 break（for-await return）即解除订阅：`return()` 会 close 该队列并释放挂起的 waiter（挂起中的 `next()` 立即 done），HTTP 层断连清理依赖此语义。
- cordis `ctx.emit` 不承担会话流（方案 D-7），本模块是有序流的唯一通道。
