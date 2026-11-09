import { startApp } from './app.js'
import { readConfig } from './config.js'

async function main() {
  const config = readConfig(process.env)
  const ctx = await startApp(config)

  console.log(
    `worldbook 已启动（HTTP 端口 ${config.http.port}，服务：session/context/model/tools/agent/subagent）`,
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
