export type SessionId = string
export type TurnId = number

export type TurnPhase = 'running' | 'completed' | 'failed' | 'cancelled'
export type TurnEndReason = 'done' | 'max_steps' | 'interrupted' | 'error'

export interface TurnSnapshot {
  turnId: TurnId
  phase: TurnPhase
  reason?: TurnEndReason
}

export interface TurnClaim {
  turnId: TurnId
}

/** 持久化的回合编号来源：会话没有历史回合时返回 0。 */
export interface TurnIdSource {
  lastTurnId(sessionId: SessionId): Promise<TurnId>
}

export class TurnAlreadyActiveError extends Error {}

const PHASE_OF: Record<TurnEndReason, TurnPhase> = {
  done: 'completed',
  max_steps: 'completed',
  interrupted: 'cancelled',
  error: 'failed',
}

export class TurnRegistry {
  private states = new Map<SessionId, TurnSnapshot>()
  private claiming = new Set<SessionId>()

  constructor(private readonly ids: TurnIdSource) {}

  async claim(sessionId: SessionId): Promise<TurnClaim> {
    if (this.states.get(sessionId)?.phase === 'running' || this.claiming.has(sessionId)) {
      throw new TurnAlreadyActiveError(`session ${sessionId} already has an active turn`)
    }
    this.claiming.add(sessionId)
    try {
      const current = this.states.get(sessionId)
      const lastTurnId = current !== undefined ? current.turnId : await this.ids.lastTurnId(sessionId)
      const turnId = lastTurnId + 1
      this.states.set(sessionId, { turnId, phase: 'running' })
      return { turnId }
    } finally {
      this.claiming.delete(sessionId)
    }
  }

  settle(sessionId: SessionId, reason: TurnEndReason): void {
    const state = this.states.get(sessionId)
    if (state?.phase !== 'running') return
    this.states.set(sessionId, { turnId: state.turnId, phase: PHASE_OF[reason], reason })
  }

  getState(sessionId: SessionId): TurnSnapshot | undefined {
    return this.states.get(sessionId)
  }
}
