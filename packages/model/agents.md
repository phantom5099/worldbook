# model

模型客户端契约与实现。源码 `src/model.ts`（契约）、`src/openai.ts`（OpenAI 官方 SDK 实现）、`src/presets.ts`（供应商预置表）、`index.ts`（仅 re-export）；`testing/mock-model.ts` 为测试替身，经 `@worldbook/model/testing` 子路径导出；测试 `test/model.test.ts`。

## 结构

- `ModelClient.completeStream(request)`：唯一的模型调用面，流式 `AsyncIterable<ModelEvent>`。
- `ModelEvent` 两类：`delta`（流式片段）、`message`（终局：全文 + toolCalls + usage）。工具调用只由终局的 `message` 携带，不逐段产出。
- `MockModelClient`（`testing/`）：脚本队列（`enqueue`），记录全部 `requests` 供断言；脚本耗尽或 `error` 字段抛错。不属于生产代码，不进主入口导出。
- `OpenAICompatClient`：基于官方 `openai` npm 包（v7）+ `baseURL` 覆盖，SSE 解析与重试由 SDK 承担，tool_calls 分片在本包按 `index` 累积；DeepSeek/GLM 等 OpenAI 兼容供应商共用。构造参数 `{baseUrl, apiKey, model, headers?, fetchImpl?}`（`fetchImpl` 走 SDK 的 `fetch` 注入，测试用）。
- `PROVIDER_PRESETS`：deepseek / gpt / glm 三家预置（baseUrl、defaultModel、apiKeyEnv、与 OpenAI 协议的差异备注）；`MODEL_NAME` 可覆盖 defaultModel。DeepSeek 当前模型名为 `deepseek-v4-flash` / `deepseek-v4-pro`，旧名 deepseek-chat/deepseek-reasoner 已于 2026-07-24 停用（官方文档），勿用。

## 不变量与边界

- 消息契约 `ModelMessage` 与 context 的 `LlmMessage` 结构相同但**独立定义**：model 是最底层模块，不反向依赖 context/tool；靠结构化类型兼容。
- `toOpenAiMessages` / `toOpenAiTools` 把本包契约映射为 SDK 类型；assistant toolCalls 的 arguments 统一 `JSON.stringify`，响应侧分片在本包聚合后 JSON.parse，非法 JSON 抛错（loop 转为 error 回合）。
- 请求体固定 `stream: true` + `stream_options.include_usage`；非 2xx 抛 SDK `APIError`（消息含状态码）。
- 流式 `tool_calls` 分片可能不带 `id`：终局聚合时缺 id 的调用按 `randomUUID()` 生成，保证并行调用可区分。
- abort 语义：`request.signal` 经 SDK 请求选项传入；signal 已中止时 `MockModelClient` 抛错。
- 供应商私有参数（GLM `enable_thinking`、DeepSeek `reasoning_content` 回传）v1 不透传，仅记录在预置备注。

## 依赖

`openai`（官方 SDK，唯一运行时依赖）；类型上与 tool/context 无 import。
