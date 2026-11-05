# turn

turn 状态机。源码 `src/turn.ts`（`index.ts` 仅 re-export），测试 `test/turn.test.ts`。

## 职责

单会话单活跃 turn 的互斥与终结：`claim` / `settle` / `wait` / `getState`。

## 不变量

- 同一 sessionId 同时最多一个 running turn；`claim` 冲突抛 `TurnAlreadyActiveError`。
- `settle` 幂等且是唯一终态出口：终态以第一次调用为准；对未知 turnId 无副作用。
- phase 初始即 `running`（claim 即启动，无 pending 观测态）；`reason → phase` 映射固定：done/max_steps→completed、interrupted→cancelled、error→failed。
- `wait` 必须在 settle 前调用（AgentService 在 start 时持有 promise）；settle 后该 turnId 的 wait 抛错。
- 中断不在本模块：由 `agent` 模块的 TurnHandle 触发 AbortController，loop 收尾后调 `settle('interrupted')`。

## 内存模型

active 记录在 turn 结束时删除，终态快照保留在 `lastBySession`（每会话一条，内存有界）。
