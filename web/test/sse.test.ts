import { describe, expect, it } from 'vitest'
import { isSinkFrame, parseSseBuffer, readSseStream } from '@/api/sse'

function sse(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`
}

describe('isSinkFrame', () => {
  it('接受三种合法帧', () => {
    expect(isSinkFrame({ kind: 'delta', text: '雾' })).toBe(true)
    expect(isSinkFrame({ kind: 'transition', phase: 'running' })).toBe(true)
    expect(isSinkFrame({ kind: 'event', seq: 1, type: 'turn_started', payload: {} })).toBe(true)
  })

  it('拒绝未知类型与缺失字段', () => {
    expect(isSinkFrame({ kind: 'event', seq: 1, type: 'mystery', payload: {} })).toBe(false)
    expect(isSinkFrame({ kind: 'delta' })).toBe(false)
    expect(isSinkFrame(null)).toBe(false)
  })
})

describe('parseSseBuffer', () => {
  it('解析完整帧并保留未闭合尾巴', () => {
    const buffer = `${sse({ kind: 'delta', text: '一' })}${sse({ kind: 'delta', text: '二' })}data: {"kind":"delta"`
    const parsed = parseSseBuffer(buffer)
    expect(parsed.frames).toEqual([
      { kind: 'delta', text: '一' },
      { kind: 'delta', text: '二' },
    ])
    expect(parsed.rest).toBe('data: {"kind":"delta"')
  })

  it('支持 CRLF 与跨行 data', () => {
    const buffer = 'data: {"kind":"delta",\r\ndata: "text":"雾"}\r\n\r\n'
    expect(parseSseBuffer(buffer).frames).toEqual([{ kind: 'delta', text: '雾' }])
  })

  it('损坏的帧不阻断后续帧', () => {
    const buffer = `data: {oops}\n\n${sse({ kind: 'delta', text: '好' })}`
    expect(parseSseBuffer(buffer).frames).toEqual([{ kind: 'delta', text: '好' }])
  })

  it('忽略注释与空行块', () => {
    const buffer = `: ping\n\n${sse({ kind: 'transition', phase: 'done' })}`
    expect(parseSseBuffer(buffer).frames).toEqual([{ kind: 'transition', phase: 'done' }])
  })
})

describe('readSseStream', () => {
  it('跨 chunk 拼接帧并在结束时取出尾帧', async () => {
    const encoder = new TextEncoder()
    const chunks = [
      'data: {"kind":"delta","te',
      'xt":"雾"}\n\ndata: {"kind":"transition","phase":"done"}\n\n',
      'data: {"kind":"event","seq":2,"type":"turn_ended","payload":{"reason":"done"}}',
    ]
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    })
    const frames = []
    for await (const frame of readSseStream(new Response(stream), new AbortController().signal)) {
      frames.push(frame)
    }
    expect(frames).toEqual([
      { kind: 'delta', text: '雾' },
      { kind: 'transition', phase: 'done' },
      { kind: 'event', seq: 2, type: 'turn_ended', payload: { reason: 'done' } },
    ])
  })
})
