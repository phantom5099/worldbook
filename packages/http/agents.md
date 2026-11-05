# http

HTTP+SSE 传输层。源码 `src/http.ts`（`index.ts` 仅 re-export），测试 `test/http.test.ts`。

## 结构

`createHttpServer(deps {session, sink, agent, subagent}, opts {port, host?})` → `HttpServerHandle {start, port, stop}`；`port: 0` 时由系统分配（测试/冒烟用），`port()` 返回实际端口。

| 路由 | 行为 |
|---|---|
| `POST /sessions` | 创建会话（可选 `{meta}`），201 → `{sessionId}` |
| `POST /turns` | `{sessionId, input}` 启动回合，202 → `{turnId}`；会话已有活跃 turn 抛 409（TurnAlreadyActiveError 映射）；缺字段 400 |
| `GET /sessions/:id/stream` | SSE：sink 的 `attach()` 帧序逐帧下发（`data: <json>\n\n`），15s 心跳注释帧；未知会话 404 |
| `GET /sessions/:id/history` | 已落库事件回放 |
| `GET /sessions/:id/subagents` | 该会话的直接子代理状态目录 `{sessionId, subagents}`（SubagentService.listChildren）；未知会话 404 |

## 不变量与边界

- SSE 的 event 帧与 DB 一致（sink 保证 emit 前已落库）；delta 帧仅在线、不可重放。
- 传输层无业务逻辑：不构造事件、不投影上下文；turn 的 claim 互斥复用 turn 包，AgentService.start 唯一入口。
- 消费者断开（req close）即调用订阅迭代器的 `return()`（依赖 sink 的退订语义：释放挂起 waiter 并出队）；心跳随连接关闭清理。
- `stop()` 关闭监听并断开全部连接（closeAllConnections），供进程退出与冒烟脚本收尾。
- 依赖 agent、session、sink、subagent、turn 的接口层；无 cordis、无 web 框架（node:http）。
