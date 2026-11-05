import type { TurnEndReason, TurnPhase } from '@worldbook/turn'
import type { SessionEventType, SessionId } from '@worldbook/session'

export type SinkFrame =
  | { kind: 'transition'; phase: TurnPhase; reason?: TurnEndReason }
  | { kind: 'event'; seq: number; type: SessionEventType; payload: unknown }
  | { kind: 'delta'; text: string }

class FrameQueue {
  private buffer: SinkFrame[] = []
  private waiters: Array<() => void> = []
  private closed = false

  push(frame: SinkFrame): void {
    this.buffer.push(frame)
    this.waiters.shift()?.()
  }

  close(): void {
    this.closed = true
    while (this.waiters.length > 0) this.waiters.shift()?.()
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

  attach(sessionId: SessionId): AsyncIterable<SinkFrame> {
    const queue = new FrameQueue()
    let set = this.consumers.get(sessionId)
    if (!set) {
      set = new Set()
      this.consumers.set(sessionId, set)
    }
    set.add(queue)
    const sink = this
    return {
      [Symbol.asyncIterator]() {
        return {
          next: () => queue.next(),
          return: async () => {
            queue.close()
            sink.detach(sessionId, queue)
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
