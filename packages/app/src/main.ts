import { PROVIDER_PRESETS } from '@worldbook/model'
import type { ProviderPresetName } from '@worldbook/model'
import { startApp } from './app.js'

/** 灰度开关：APP_ENV 选择 .env.<APP_ENV>；同一套装配代码，环境差异全部收敛在 env 文件里。 */
function loadEnv(): void {
  const envName = process.env.APP_ENV ?? 'development'
  try {
    process.loadEnvFile(`.env.${envName}`)
  } catch {
    console.error(`环境文件 .env.${envName} 不存在（APP_ENV=${envName}）。`)
    process.exitCode = 1
    process.exit(1)
  }
}

async function main() {
  loadEnv()

  const databaseUrl = process.env.DATABASE_URL
  const presetName = process.env.MODEL_PRESET as ProviderPresetName | undefined
  const preset = presetName ? PROVIDER_PRESETS[presetName] : undefined
  if (presetName && !preset) {
    console.error(`未知 MODEL_PRESET：${presetName}（可选：${Object.keys(PROVIDER_PRESETS).join(' / ')}）`)
    process.exitCode = 1
    return
  }
  const apiKey = preset ? process.env[preset.apiKeyEnv] : process.env.MODEL_API_KEY
  const baseUrl = preset?.baseUrl ?? process.env.MODEL_BASE_URL
  const modelName = process.env.MODEL_NAME ?? preset?.defaultModel
  const port = Number(process.env.HTTP_PORT ?? '3000')

  if (!databaseUrl || !apiKey || !baseUrl || !modelName) {
    console.error(
      [
        '缺少环境变量：',
        'DATABASE_URL 必填；',
        preset
          ? `MODEL_PRESET=${presetName} 时须提供 ${preset.apiKeyEnv}（MODEL_NAME 可覆盖默认模型 ${preset.defaultModel}）`
          : 'MODEL_BASE_URL、MODEL_API_KEY、MODEL_NAME 必填（或改用 MODEL_PRESET 预置）',
      ].join(' '),
    )
    process.exitCode = 1
    return
  }

  const ctx = await startApp({
    database: { url: databaseUrl },
    model: { baseUrl, apiKey, model: modelName },
    http: { port },
  })

  console.log(
    `worldbook 已启动（APP_ENV=${process.env.APP_ENV ?? 'development'}，HTTP 端口 ${port}，服务：session/context/model/tools/agent/subagent）`,
  )

  const shutdown = async () => {
    await ctx.stop()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
