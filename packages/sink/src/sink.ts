import type { TurnEndReason, TurnPhase } from '@worldbook/turn'
import type { OutgoingEvent, SessionEvent, SessionEventType, SessionId } from '@worldbook/session'

export type SinkFrame =
  | { kind: 'transition'; phase: TurnPhase; reason?: TurnEndReason }
  | { kind: 'event'; seq: number; type: SessionEventType; payload: unknown }
  | { kind: 'delta'; text: string }

export interface SinkSubscription extends AsyncIterable<SinkFrame> {
  /** 背压期间暂停消费：delta 直接丢弃，其余帧继续缓冲。 */
  pause(): void
  resume(): void
}

export interface EventSinkOptions {
  /** 单个订阅的未消费帧上限；缺省不限制。delta 超限丢弃，非 delta 超限结束该订阅。 */
  maxBufferedFrames?: number
}

class FrameQueue {
  private buffer: SinkFrame[] = []
  private waiters: Array<() => void> = []
  private closed = false
  private released = false
  private paused = false

  constructor(
    private readonly maxBufferedFrames: number | undefined,
    private readonly onRelease: () => void,
  ) {}

  push(frame: SinkFrame): void {
    if (this.released) return
    if (this.paused && frame.kind === 'delta') return
    if (this.maxBufferedFrames !== undefined && this.buffer.length >= this.maxBufferedFrames) {
      if (frame.kind === 'delta') return
      this.release()
      return
    }
    this.buffer.push(frame)
    this.waiters.shift()?.()
  }

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
  }

  close(): void {
    this.closed = true
    while (this.waiters.length > 0) this.waiters.shift()?.()
  }

  /** 退订的唯一出口：结束迭代、丢弃未读帧并解除注册；可重复调用。 */
  release(): void {
    if (this.released) return
    this.released = true
    this.close()
    this.buffer.length = 0
    this.onRelease()
  }

  async next(): Promise<IteratorResult<SinkFrame>> {
    if (this.buffer.length > 0) {
      return { value: this.buffer.shift()!, done: false }
    }
    if (this.closed) return { value: undefined, done: true }
    await new Promise<void>((resolve) => this.waiters.push(resolve))
    if (this.buffer.length > 0) return { value: this.buffer.shift()!, done: false }
    return { value: undefined, done: true }
  }
}

export class EventSink {
  private consumers = new Map<SessionId, Set<FrameQueue>>()

  constructor(private readonly options: EventSinkOptions = {}) {}

  attach(sessionId: SessionId): SinkSubscription {
    const queue = new FrameQueue(this.options.maxBufferedFrames, () =>
      this.detach(sessionId, queue),
    )
    let set = this.consumers.get(sessionId)
    if (!set) {
      set = new Set()
      this.consumers.set(sessionId, set)
    }
    set.add(queue)
    return {
      pause: () => queue.pause(),
      resume: () => queue.resume(),
      [Symbol.asyncIterator]() {
        return {
          next: () => queue.next(),
          return: async () => {
            queue.release()
            return { value: undefined, done: true }
          },
        }
      },
    }
  }

  emit(sessionId: SessionId, frame: SinkFrame): void {
    const set = this.consumers.get(sessionId)
    if (!set) return
    for (const queue of set) queue.push(frame)
  }

  close(sessionId: SessionId): void {
    const set = this.consumers.get(sessionId)
    if (!set) return
    for (const queue of set) queue.close()
    this.consumers.delete(sessionId)
  }

  private detach(sessionId: SessionId, queue: FrameQueue): void {
    const set = this.consumers.get(sessionId)
    if (!set) return
    set.delete(queue)
    if (set.size === 0) this.consumers.delete(sessionId)
  }
}

interface EventAppender {
  append(sessionId: SessionId, events: readonly OutgoingEvent[]): Promise<SessionEvent[]>
}

/** 先落库再播发 event 帧：event 帧只在 append 成功后产生。 */
export async function appendAndEmit(
  session: EventAppender,
  sink: EventSink,
  sessionId: SessionId,
  type: SessionEventType,
  payload: unknown,
): Promise<SessionEvent> {
  const [event] = await session.append(sessionId, [{ type, payload }])
  sink.emit(sessionId, { kind: 'event', seq: event!.seq, type: event!.type, payload: event!.payload })
  return event!
}
