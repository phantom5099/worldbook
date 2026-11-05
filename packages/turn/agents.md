# turn

turn 状态机。源码 `src/turn.ts`（`index.ts` 仅 re-export），测试 `test/turn.test.ts`。

## 职责

单会话单活跃 turn 的互斥与终结：`claim(sessionId)` / `settle(sessionId, reason)` / `getState(sessionId)`。

## 回合编号

- `turnId` 为单会话内递增整数，由注入的 `TurnIdSource.lastTurnId(sessionId)` 提供基线（无历史返回 0），`claim` 取基线 +1。
- 当前进程内已有终态快照时直接在其编号上递增，不再调用来源；重启后首次 claim 由来源从持久化事件恢复，编号不重置。
- 编号的持久化由 agent loop 负责：`turn_started` 载荷携带 `{turnId}`，来源实现据此续接。

## 不变量

- 同一 sessionId 同时最多一个 running turn；`claim` 是异步方法，活跃或正在 claim 的会话再次 claim 抛 `TurnAlreadyActiveError`。
- `settle` 幂等且是唯一终态出口：终态以第一次调用为准；对无活跃回合的会话无副作用。
- phase 初始即 `running`（claim 即启动，无 pending 观测态）；`reason → phase` 映射固定：done/max_steps→completed、interrupted→cancelled、error→failed。
- 中断不在本模块：由 `agent` 模块的 TurnHandle 触发 AbortController，loop 收尾后调 `settle(sessionId, 'interrupted')`。

## 内存模型

回合快照以 sessionId 为键存在单一 Map 中：`claim` 写入 running 快照，`settle` 原地覆盖为终态快照（含 `reason`），记录不删除，作为下一次 `claim` 的编号基线与 `getState` 的来源（每会话一条，内存有界）。`claiming` 集合只在等待编号基线的异步窗口内占位，防止并发 claim 穿透互斥。
