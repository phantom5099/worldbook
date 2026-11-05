import { describe, expect, it } from 'vitest'
import { EventSink, type SinkFrame } from '../src/index.js'

async function collect(iterable: AsyncIterable<SinkFrame>, count: number): Promise<SinkFrame[]> {
  const frames: SinkFrame[] = []
  for await (const frame of iterable) {
    frames.push(frame)
    if (frames.length >= count) break
  }
  return frames
}

describe('EventSink', () => {
  it('无消费者时 emit 不抛错', () => {
    const sink = new EventSink()
    expect(() => sink.emit('s1', { kind: 'delta', text: 'x' })).not.toThrow()
  })

  it('按 emit 顺序投递帧，break 后解除订阅', async () => {
    const sink = new EventSink()
    const stream = sink.attach('s1')
    sink.emit('s1', { kind: 'transition', phase: 'running' })
    sink.emit('s1', { kind: 'delta', text: 'a' })
    const frames = await collect(stream, 2)
    expect(frames).toEqual([
      { kind: 'transition', phase: 'running' },
      { kind: 'delta', text: 'a' },
    ])
    sink.emit('s1', { kind: 'delta', text: 'late' })
  })

  it('多消费者收到相同的全序帧', async () => {
    const sink = new EventSink()
    const a = collect(sink.attach('s1'), 2)
    const b = collect(sink.attach('s1'), 2)
    sink.emit('s1', { kind: 'event', seq: 1, type: 'user_message', payload: 'hi' })
    sink.emit('s1', { kind: 'event', seq: 2, type: 'assistant_message', payload: 'yo' })
    const [framesA, framesB] = await Promise.all([a, b])
    expect(framesA).toEqual(framesB)
    expect(framesA[0]).toEqual({ kind: 'event', seq: 1, type: 'user_message', payload: 'hi' })
  })

  it('先 emit 后 attach 的帧不可见（只播发订阅之后的帧）', async () => {
    const sink = new EventSink()
    sink.emit('s1', { kind: 'delta', text: 'before' })
    const collecting = collect(sink.attach('s1'), 1)
    sink.emit('s1', { kind: 'delta', text: 'after' })
    const frames = await collecting
    expect(frames).toEqual([{ kind: 'delta', text: 'after' }])
  })

  it('close 结束所有消费者的迭代', async () => {
    const sink = new EventSink()
    const stream = sink.attach('s1')
    const frames: SinkFrame[] = []
    const done = (async () => {
      for await (const frame of stream) frames.push(frame)
    })()
    sink.close('s1')
    await done
    expect(frames).toEqual([])
  })
})
