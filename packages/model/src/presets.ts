export type ProviderPresetName = 'deepseek' | 'gpt' | 'glm'

interface ProviderPreset {
  baseUrl: string
  defaultModel: string
  apiKeyEnv: string
  /** 与 OpenAI 协议的已知差异；实现透传前不可依赖 */
  notes: string[]
}

// 各项取自供应商官方文档（2026-11 核实）；defaultModel 可被 MODEL_NAME 覆盖
export const PROVIDER_PRESETS: Record<ProviderPresetName, ProviderPreset> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-flash',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    notes: ['思考模式经 reasoning_content 字段独立返回，多轮需回传'],
  },
  gpt: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.2',
    apiKeyEnv: 'OPENAI_API_KEY',
    notes: ['可用模型以 GET /v1/models 实际返回为准'],
  },
  glm: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-5.2',
    apiKeyEnv: 'ZHIPUAI_API_KEY',
    notes: ['enable_thinking 为非 OpenAI 标准参数，v1 不透传'],
  },
}
