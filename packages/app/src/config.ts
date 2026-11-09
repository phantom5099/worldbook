import { PROVIDER_PRESETS } from '@worldbook/model'
import type { ProviderPresetName } from '@worldbook/model'
import type { HttpOptions } from '@worldbook/http'
import type { AppConfig } from './app.js'

/** 环境变量解析结果：readConfig 总会给出 HTTP 端口，因此 http 一定存在。 */
type ProcessConfig = AppConfig & { http: HttpOptions }

/**
 * 唯一的环境变量读取入口：本地由启动命令的 --env-file 加载文件，部署由平台注入；
 * 缺必填项或格式非法时抛错，让进程在启动阶段失败。
 */
export function readConfig(env: NodeJS.ProcessEnv): ProcessConfig {
  return {
    database: { url: readRequired(env, 'DATABASE_URL') },
    model: readModel(env),
    http: { port: readPositiveInt(env, 'HTTP_PORT', 3000) },
    turnStateMaxEntries: readPositiveInt(env, 'TURN_STATE_MAX_ENTRIES', 100_000),
    sessionCounterMaxEntries: readPositiveInt(env, 'SESSION_COUNTER_MAX_ENTRIES', 100_000),
    sinkMaxBufferedFrames: readPositiveInt(env, 'SINK_MAX_BUFFERED_FRAMES', 1024),
  }
}

function readModel(env: NodeJS.ProcessEnv): AppConfig['model'] {
  const presetName = readOptional(env, 'MODEL_PRESET')
  if (presetName === undefined) {
    return {
      baseUrl: readRequired(env, 'MODEL_BASE_URL'),
      apiKey: readRequired(env, 'MODEL_API_KEY'),
      model: readRequired(env, 'MODEL_NAME'),
    }
  }
  if (!isPresetName(presetName)) {
    throw new Error(
      `未知 MODEL_PRESET：${presetName}（可选：${Object.keys(PROVIDER_PRESETS).join(' / ')}）`,
    )
  }
  const preset = PROVIDER_PRESETS[presetName]
  return {
    baseUrl: preset.baseUrl,
    apiKey: readRequired(env, preset.apiKeyEnv),
    model: readOptional(env, 'MODEL_NAME') ?? preset.defaultModel,
  }
}

function isPresetName(value: string): value is ProviderPresetName {
  return Object.hasOwn(PROVIDER_PRESETS, value)
}

function readRequired(env: NodeJS.ProcessEnv, name: string): string {
  const value = readOptional(env, name)
  if (value === undefined) {
    throw new Error(`缺少环境变量 ${name}`)
  }
  return value
}

function readOptional(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim()
  return value === '' ? undefined : value
}

function readPositiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = readOptional(env, name)
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} 须为正整数，当前值：${raw}`)
  }
  return value
}
