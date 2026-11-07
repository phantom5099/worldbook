# turn

turn 状态机。源码 `src/turn.ts`（`index.ts` 仅 re-export），测试 `test/turn.test.ts`。

## 职责

单会话单活跃 turn 的互斥与终结：`claim(sessionId)` / `settle(sessionId, reason)` / `getState(sessionId)`；以及从事件日志折叠回合状态的 `foldTurnState(events, active)`。

## 回合编号

- `turnId` 为单会话内递增整数，由注入的 `TurnIdSource.lastTurnId(sessionId)` 提供基线（无历史返回 0），`claim` 取基线 +1。
- 当前进程内已有终态快照时直接在其编号上递增，不再调用来源；重启后首次 claim 由来源从持久化事件恢复，编号不重置。
- 编号的持久化由 agent loop 负责：`turn_started` 载荷携带 `{turnId}`，来源实现据此续接。

## 不变量

- 同一 sessionId 同时最多一个 running turn；`claim` 是异步方法，活跃或正在 claim 的会话再次 claim 抛 `TurnAlreadyActiveError`。
- `settle` 幂等且是唯一终态出口：终态以第一次调用为准；对无活跃回合的会话无副作用。
- phase 初始即 `running`（claim 即启动，无 pending 观测态）；`reason → phase` 映射固定：done/max_steps→completed、interrupted→cancelled、error→failed。
- 中断不在本模块：由 `agent` 模块的 TurnHandle 触发 AbortController，loop 收尾后调 `settle(sessionId, 'interrupted')`。

## 日志折叠

- `foldTurnState(events: TurnEventView[], active: boolean)` → `FoldedTurnState {phase, reason?}`：`TurnEventView` 只取 `{type, payload?}`，结构兼容 `SessionEvent`，turn 不依赖 session 包。
- `active` 优先：进程内已有 claim 即返回 `running`，覆盖日志滞后（新一轮 `turn_started` 尚未落盘）。
- 日志未闭合且无活跃执行者：视为进程重启遗留，按 `interrupted` 折叠为 `cancelled`，不伪造 `reason`。
- 已闭合回合：按最后一条 `turn_ended` 的 reason 经 `phaseOf` 映射并保留 `reason`；reason 不合法按 `error` 处理；没有任何回合记录返回 `{phase: 'unknown'}`（查询结果，不是生命周期阶段）。

## 内存模型

回合快照以 sessionId 为键存在单一 Map 中：`claim` 写入 running 快照，`settle` 原地覆盖为终态快照（含 `reason`），记录不删除，作为下一次 `claim` 的编号基线与 `getState` 的来源（每会话一条，随见过的会话数线性增长，不做淘汰）。`claiming` 集合只在等待编号基线的异步窗口内占位，防止并发 claim 穿透互斥。
