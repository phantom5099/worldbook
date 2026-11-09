type SessionId = string
export type TurnId = number

export type TurnPhase = 'running' | 'completed' | 'failed' | 'cancelled'
export type TurnEndReason = 'done' | 'max_steps' | 'interrupted' | 'error'

interface TurnSnapshot {
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

export function phaseOf(reason: TurnEndReason): TurnPhase {
  return PHASE_OF[reason]
}

/** 折叠所需的事件字段；结构兼容 SessionEvent，避免 turn 依赖 session 包。 */
interface TurnEventView {
  type: string
  payload?: unknown
}

/** 从事件日志折叠出的回合状态；unknown 表示没有回合记录，不是生命周期阶段。 */
export interface FoldedTurnState {
  phase: TurnPhase | 'unknown'
  reason?: TurnEndReason
}

function isTurnEndReason(value: unknown): value is TurnEndReason {
  return value === 'done' || value === 'max_steps' || value === 'interrupted' || value === 'error'
}

/**
 * active 优先：进程内已有 claim 即为 running，覆盖日志滞后（新一轮 turn_started 尚未落盘）。
 * 无活跃执行者的未闭合回合视为进程重启遗留，按 interrupted 折叠为 cancelled。
 */
export function foldTurnState(
  events: readonly TurnEventView[],
  active: boolean,
): FoldedTurnState {
  if (active) return { phase: 'running' }
  let open = false
  let lastReason: TurnEndReason | undefined
  for (const event of events) {
    if (event.type === 'turn_started') {
      open = true
    } else if (event.type === 'turn_ended') {
      open = false
      const reason = (event.payload as { reason?: unknown }).reason
      lastReason = isTurnEndReason(reason) ? reason : 'error'
    }
  }
  if (open) return { phase: phaseOf('interrupted') }
  if (lastReason === undefined) return { phase: 'unknown' }
  return { phase: phaseOf(lastReason), reason: lastReason }
}

export interface TurnRegistryOptions {
  /** 终态快照上限；缺省不淘汰。running 与正在 claim 的会话不计入淘汰。 */
  maxEntries?: number
}

export class TurnRegistry {
  private states = new Map<SessionId, TurnSnapshot>()
  private claiming = new Set<SessionId>()

  constructor(
    private readonly ids: TurnIdSource,
    private readonly options: TurnRegistryOptions = {},
  ) {}

  async claim(sessionId: SessionId): Promise<TurnClaim> {
    if (this.states.get(sessionId)?.phase === 'running' || this.claiming.has(sessionId)) {
      throw new TurnAlreadyActiveError(`session ${sessionId} already has an active turn`)
    }
    this.claiming.add(sessionId)
    try {
      const current = this.states.get(sessionId)
      const lastTurnId = current !== undefined ? current.turnId : await this.ids.lastTurnId(sessionId)
      const turnId = lastTurnId + 1
      this.states.delete(sessionId)
      this.states.set(sessionId, { turnId, phase: 'running' })
      return { turnId }
    } finally {
      this.claiming.delete(sessionId)
    }
  }

  settle(sessionId: SessionId, reason: TurnEndReason): void {
    const state = this.states.get(sessionId)
    if (state?.phase !== 'running') return
    this.states.delete(sessionId)
    this.states.set(sessionId, { turnId: state.turnId, phase: phaseOf(reason), reason })
    this.evict()
  }

  getState(sessionId: SessionId): TurnSnapshot | undefined {
    return this.states.get(sessionId)
  }

  /** Map 插入序即最近使用序；被淘汰的终态快照下次 claim 由 TurnIdSource 从日志恢复编号。 */
  private evict(): void {
    const maxEntries = this.options.maxEntries
    if (maxEntries === undefined) return
    if (this.states.size <= maxEntries) return
    for (const [sessionId, state] of this.states) {
      if (this.states.size <= maxEntries) return
      if (state.phase === 'running' || this.claiming.has(sessionId)) continue
      this.states.delete(sessionId)
    }
  }
}
