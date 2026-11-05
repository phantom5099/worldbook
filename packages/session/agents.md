# session

会话事件持久化。源码 `src/`：`types.ts`（事件类型）、`store.ts`（SessionStore 接口）、`pg-store.ts`（PG 实现）、`session.ts`（SessionService）、`index.ts`（仅 re-export）。`testing/` 提供内存版 `SessionStore`，经 `@worldbook/session/testing` 子路径导出，仅供测试与无 PG 装配使用。测试 `test/`：`session.test.ts`（FakeStore 单测）、`pg-store.test.ts`（PG 集成，无 DATABASE_URL 跳过）。

## 职责

- 定义全部会话事件类型（11 种，见 `types.ts` 的 `SessionEventType`）。
- `SessionService.append`：seq 串行分配 + 批量落库；`getHistory`：按 seq 升序读取。

## 不变量

- seq 单会话内严格递增、从 1 开始；计数器内存缓存，首次 append 时从 `maxSeq` 初始化。
- 落库失败必须丢弃内存计数器（下次从 DB 重新初始化），不允许内存与 DB 漂移后继续追加。
- 空批量不触发落库。
- 事件类型即 `SessionEventType` 联合，新增事件类型只改这里，消费方（context/sink）跟随更新。
- 流式 delta 不是事件、不落库，本模块没有 delta 概念。
