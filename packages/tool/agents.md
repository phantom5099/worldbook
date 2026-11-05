# tool

工具定义与执行。源码 `src/tool.ts`（`index.ts` 仅 re-export），测试 `test/tool.test.ts`。

## 结构

- `ToolDefinition`：name / description / `parameters`（Zod，必选）/ `output`（Zod，可选）/ `execute`。
- `ToolRegistry`：装配期可变注册表（`set` 重名报错），`toService()` 产出只读快照。
- `ToolService`：运行期只读消费面，loop 唯一依赖——`list()`（JSON Schema specs）+ `executeBatch()`。

## 不变量与错误语义

- 注册只发生在装配期；`toService()` 之后注册表变化不影响已产出的服务。
- `executeBatch` 批次内并发、结果按调用顺序返回；任何失败（未知工具、参数不合法、执行抛错、output 校验失败、signal 已中止）都转为 `{ status: 'error', result: message }` 回灌，**绝不抛出**——模型永远拿到形状一致的结果。
- `output` schema 校验失败按错误处理；结果须为无损 JSON 可回放。
- `list(scope?)` 的 scope 是参数位，v1 不做可见性过滤。

## 依赖

`zod`（v4，`z.toJSONSchema` 导出 JSON Schema）；类型上引用 session/turn 的 id 类型。
