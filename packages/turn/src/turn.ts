import { randomUUID } from 'node:crypto'

export type SessionId = string
export type TurnId = string

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

export class TurnAlreadyActiveError extends Error {}

const PHASE_OF: Record<TurnEndReason, TurnPhase> = {
  done: 'completed',
  max_steps: 'completed',
  interrupted: 'cancelled',
  error: 'failed',
}

interface TurnRecord {
  sessionId: SessionId
  turnId: TurnId
  promise: Promise<TurnEndReason>
  resolve: (reason: TurnEndReason) => void
}

export class TurnRegistry {
  private active = new Map<TurnId, TurnRecord>()
  private activeBySession = new Map<SessionId, TurnId>()
  private lastBySession = new Map<SessionId, TurnSnapshot>()

  claim(sessionId: SessionId): TurnClaim {
    if (this.activeBySession.has(sessionId)) {
      throw new TurnAlreadyActiveError(`session ${sessionId} already has an active turn`)
    }
    const turnId = randomUUID()
    let resolve!: (reason: TurnEndReason) => void
    const promise = new Promise<TurnEndReason>((res) => {
      resolve = res
    })
    this.active.set(turnId, { sessionId, turnId, promise, resolve })
    this.activeBySession.set(sessionId, turnId)
    return { turnId }
  }

  settle(turnId: TurnId, reason: TurnEndReason): void {
    const record = this.active.get(turnId)
    if (!record) return
    this.active.delete(turnId)
    this.activeBySession.delete(record.sessionId)
    this.lastBySession.set(record.sessionId, {
      turnId,
      phase: PHASE_OF[reason],
      reason,
    })
    record.resolve(reason)
  }

  wait(turnId: TurnId): Promise<TurnEndReason> {
    const record = this.active.get(turnId)
    if (record) return record.promise
    throw new Error(`unknown turn ${turnId}: settled or never claimed; capture the promise via claim before settle`)
  }

  getState(sessionId: SessionId): TurnSnapshot | undefined {
    const turnId = this.activeBySession.get(sessionId)
    if (turnId && this.active.has(turnId)) return { turnId, phase: 'running' }
    return this.lastBySession.get(sessionId)
  }
}
