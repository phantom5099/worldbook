import type { SessionEventType, SinkFrame } from './types'

const EVENT_TYPES: readonly SessionEventType[] = [
  'turn_started',
  'turn_ended',
  'user_message',
  'assistant_message',
  'tool_result',
  'subagent_spawned',
  'subagent_result',
  'subagent_message',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isSinkFrame(value: unknown): value is SinkFrame {
  if (!isRecord(value) || typeof value.kind !== 'string') return false
  if (value.kind === 'delta') return typeof value.text === 'string'
  if (value.kind === 'transition') return typeof value.phase === 'string'
  if (value.kind === 'event') {
    return (
      typeof value.seq === 'number' &&
      typeof value.type === 'string' &&
      EVENT_TYPES.includes(value.type as SessionEventType)
    )
  }
  return false
}

export interface ParsedSse {
  frames: SinkFrame[]
  rest: string
}

/** 从缓冲区取出完整帧，保留最后一个未闭合块。 */
export function parseSseBuffer(buffer: string): ParsedSse {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const blocks = normalized.split('\n\n')
  const rest = blocks.pop() ?? ''
  const frames: SinkFrame[] = []
  for (const block of blocks) {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    if (!data) continue
    try {
      const parsed = JSON.parse(data) as unknown
      if (isSinkFrame(parsed)) frames.push(parsed)
    } catch {
      // 单帧损坏不阻断后续帧；后端升级期间可能混入旧格式。
    }
  }
  return { frames, rest }
}

export async function* readSseStream(response: Response, signal: AbortSignal): AsyncGenerator<SinkFrame> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('响应没有可读的流')
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parsed = parseSseBuffer(buffer)
      buffer = parsed.rest
      for (const frame of parsed.frames) yield frame
    }
    buffer += decoder.decode()
    const tail = parseSseBuffer(`${buffer}\n\n`)
    for (const frame of tail.frames) yield frame
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}
