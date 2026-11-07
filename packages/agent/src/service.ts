import { createLoop } from './loop.js'
import type { LoopDeps, TurnEndReason } from './loop.js'
import type { TurnClaim, TurnId } from '@worldbook/turn'
import { phaseOf, TurnAlreadyActiveError } from '@worldbook/turn'

export { TurnAlreadyActiveError }
export type { TurnEndReason, LoopDeps }

interface TurnHandle {
  turnId: TurnId
  done: Promise<TurnEndReason>
  interrupt(reason?: string): void
}

export class AgentService {
  private readonly loop: ReturnType<typeof createLoop>
  /** 活跃 turn 期间被拒绝的唤醒：记录触发事件 seq，待 turn 收尾时判断是否已被读取。 */
  private readonly pendingWakes = new Map<string, number>()

  constructor(private readonly deps: LoopDeps) {
    this.loop = createLoop(deps)
  }

  async start(sessionId: string, input: string): Promise<TurnHandle> {
    return this.startTurn(sessionId, input)
  }

  /**
   * 由日志中已有事件驱动一轮（如子代理结果回注），seq 为触发事件序号。
   * 会话已有活跃 turn 时不重复开轮：挂起该唤醒，若本轮上下文始终没读到该事件，收尾后补开一轮。
   */
  async wake(sessionId: string, seq: number): Promise<TurnHandle | undefined> {
    try {
      return await this.startTurn(sessionId)
    } catch (err) {
      if (err instanceof TurnAlreadyActiveError) {
        if (seq > (this.pendingWakes.get(sessionId) ?? 0)) {
          this.pendingWakes.set(sessionId, seq)
        }
        return undefined
      }
      throw err
    }
  }

  private async startTurn(sessionId: string, input?: string): Promise<TurnHandle> {
    const claim = await this.deps.turns.claim(sessionId)
    const controller = new AbortController()
    this.deps.sink.emit(sessionId, { kind: 'transition', phase: 'running' })
    return {
      turnId: claim.turnId,
      done: this.runClaimedTurn(sessionId, claim, input, controller.signal),
      interrupt: (reason?: string) => controller.abort(reason),
    }
  }

  private async runClaimedTurn(
    sessionId: string,
    claim: TurnClaim,
    input: string | undefined,
    signal: AbortSignal,
  ): Promise<TurnEndReason> {
    let reason: TurnEndReason
    try {
      reason = await this.loop.runTurn(sessionId, {
        claim,
        signal,
        ...(input !== undefined ? { input } : {}),
        onContextRead: (lastSeq) => this.consumeWake(sessionId, lastSeq),
      })
    } catch {
      reason = signal.aborted ? 'interrupted' : 'error'
      this.deps.turns.settle(sessionId, reason)
    }
    this.deps.sink.emit(sessionId, { kind: 'transition', phase: phaseOf(reason), reason })
    await this.replayWake(sessionId)
    return reason
  }

  /** 本轮上下文已覆盖的 seq：挂起的唤醒若来自更早的事件，说明已被吸收。 */
  private consumeWake(sessionId: string, lastSeq: number): void {
    const pending = this.pendingWakes.get(sessionId)
    if (pending !== undefined && pending <= lastSeq) this.pendingWakes.delete(sessionId)
  }

  /** 收尾后补开一轮，处理本轮没读到的唤醒；若会话已被别人 claim 则由那一轮读取。 */
  private async replayWake(sessionId: string): Promise<void> {
    if (!this.pendingWakes.delete(sessionId)) return
    try {
      await this.startTurn(sessionId)
    } catch (err) {
      if (!(err instanceof TurnAlreadyActiveError)) throw err
    }
  }
}
