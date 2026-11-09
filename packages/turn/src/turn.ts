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
  /** 快照节点总数上限；缺省不淘汰。淘汰时跳过 running 快照。 */
  maxEntries?: number
}

interface TurnNode extends TurnSnapshot {
  sessionId: SessionId
  prev: TurnNode | null
  next: TurnNode | null
}

export class TurnRegistry {
  private readonly nodes = new Map<SessionId, TurnNode>()
  private readonly claiming = new Set<SessionId>()
  private head: TurnNode | null = null
  private tail: TurnNode | null = null

  constructor(
    private readonly ids: TurnIdSource,
    private readonly options: TurnRegistryOptions = {},
  ) {}

  async claim(sessionId: SessionId): Promise<TurnClaim> {
    if (this.nodes.get(sessionId)?.phase === 'running' || this.claiming.has(sessionId)) {
      throw new TurnAlreadyActiveError(`session ${sessionId} already has an active turn`)
    }
    this.claiming.add(sessionId)
    try {
      const current = this.nodes.get(sessionId)
      const lastTurnId = current !== undefined ? current.turnId : await this.ids.lastTurnId(sessionId)
      const turnId = lastTurnId + 1
      this.setState(sessionId, { turnId, phase: 'running' })
      return { turnId }
    } finally {
      this.claiming.delete(sessionId)
    }
  }

  settle(sessionId: SessionId, reason: TurnEndReason): void {
    const node = this.nodes.get(sessionId)
    if (node?.phase !== 'running') return
    node.phase = phaseOf(reason)
    node.reason = reason
    this.moveToTail(node)
    this.evict()
  }

  getState(sessionId: SessionId): TurnSnapshot | undefined {
    const node = this.nodes.get(sessionId)
    if (node === undefined) return undefined
    return { turnId: node.turnId, phase: node.phase, reason: node.reason }
  }

  private setState(sessionId: SessionId, state: TurnSnapshot): void {
    const existing = this.nodes.get(sessionId)
    if (existing !== undefined) {
      existing.turnId = state.turnId
      existing.phase = state.phase
      existing.reason = state.reason
      this.moveToTail(existing)
      return
    }
    const node: TurnNode = {
      sessionId,
      turnId: state.turnId,
      phase: state.phase,
      reason: state.reason,
      prev: this.tail,
      next: null,
    }
    if (this.tail !== null) this.tail.next = node
    else this.head = node
    this.tail = node
    this.nodes.set(sessionId, node)
  }

  /**
   * 链表按最近使用排序，链头即最旧；淘汰从链头取，跳过 running 快照。
   * 被淘汰的终态快照下次 claim 由 TurnIdSource 从日志恢复编号。
   */
  private evict(): void {
    const maxEntries = this.options.maxEntries
    if (maxEntries === undefined) return
    let node = this.head
    while (node !== null && this.nodes.size > maxEntries) {
      const next = node.next
      if (node.phase === 'running') {
        node = next
        continue
      }
      this.remove(node)
      node = next
    }
  }

  private moveToTail(node: TurnNode): void {
    if (this.tail === node) return
    this.unlink(node)
    node.prev = this.tail
    this.tail!.next = node
    this.tail = node
  }

  private remove(node: TurnNode): void {
    this.unlink(node)
    this.nodes.delete(node.sessionId)
  }

  private unlink(node: TurnNode): void {
    if (node.prev !== null) node.prev.next = node.next
    else this.head = node.next
    if (node.next !== null) node.next.prev = node.prev
    else this.tail = node.prev
    node.prev = null
    node.next = null
  }
}
