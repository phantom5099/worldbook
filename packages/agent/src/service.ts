import { createLoop } from './loop.js'
import type { LoopDeps, TurnEndReason } from './loop.js'
import type { TurnId, TurnPhase } from '@worldbook/turn'
import { TurnAlreadyActiveError } from '@worldbook/turn'

export { TurnAlreadyActiveError }
export type { TurnEndReason, LoopDeps }

const PHASE_OF: Record<TurnEndReason, TurnPhase> = {
  done: 'completed',
  max_steps: 'completed',
  interrupted: 'cancelled',
  error: 'failed',
}

export interface TurnHandle {
  turnId: TurnId
  done: Promise<TurnEndReason>
  interrupt(reason?: string): void
}

export class AgentService {
  private readonly loop: ReturnType<typeof createLoop>

  constructor(private readonly deps: LoopDeps) {
    this.loop = createLoop(deps)
  }

  start(sessionId: string, input: string): TurnHandle {
    const claim = this.deps.turns.claim(sessionId)
    const controller = new AbortController()
    this.deps.sink.emit(sessionId, { kind: 'transition', phase: 'running' })
    const done = this.loop
      .runTurn(sessionId, input, { claim, signal: controller.signal })
      .then((reason) => {
        this.deps.sink.emit(sessionId, {
          kind: 'transition',
          phase: PHASE_OF[reason],
          reason,
        })
        return reason
      })
    return {
      turnId: claim.turnId,
      done,
      interrupt: (reason?: string) => controller.abort(reason),
    }
  }
}
