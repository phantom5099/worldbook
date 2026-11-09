/** 只读环境变量：本地开发由启动命令加载 .env 文件，部署由平台注入。 */
export function readConfig(env: NodeJS.ProcessEnv) {
  return {
    turnStateMaxEntries: readPositiveInt(env, 'TURN_STATE_MAX_ENTRIES', 100_000),
    sessionCounterMaxEntries: readPositiveInt(env, 'SESSION_COUNTER_MAX_ENTRIES', 100_000),
    sinkMaxBufferedFrames: readPositiveInt(env, 'SINK_MAX_BUFFERED_FRAMES', 1024),
  }
}

function readPositiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim()
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} 须为正整数，当前值：${raw}`)
  }
  return value
}
