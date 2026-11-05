import { createLoop } from '@worldbook/agent'
import type { ContextView } from '@worldbook/agent'
import type { ModelClient } from '@worldbook/model'
import type { ToolService } from '@worldbook/tool'
import type { SessionService, SessionEvent, SessionEventType } from '@worldbook/session'
import type { EventSink } from '@worldbook/sink'
import type { TurnRegistry, TurnEndReason } from '@worldbook/turn'
import { foldSubagentStatus } from './status.js'
import type { SubagentStatus } from './status.js'

export interface SubagentSpec {
  systemPrompt: string
  task: string
  maxSteps?: number
}

export interface SubagentResult {
  childSessionId: string
  reason: TurnEndReason
  content: string
  truncated: boolean
}

export interface SubagentStatusSnapshot {
  status: SubagentStatus
  result?: SubagentResult
}

export interface SubagentWaitResult extends SubagentStatusSnapshot {
  timedOut?: boolean
}

export interface SubagentInfo extends SubagentStatusSnapshot {
  childSessionId: string
}

export interface SubagentWaitOptions {
  timeoutMs?: number
}

export interface SubagentSendOptions {
  /** 默认空闲目标会被唤醒开新一轮；false 时仅入队。 */
  wake?: boolean
}

export class SubagentDepthLimitError extends Error {}
export class SubagentReuseError extends Error {}
export class SubagentSendScopeError extends Error {}

const DEFAULT_MAX_DEPTH = 2
const DEFAULT_RESULT_MAX_CHARS = 4000
const DEFAULT_WAIT_TIMEOUT_MS = 30_000

export interface SubagentDeps {
  session: SessionService
  sink: EventSink
  turns: TurnRegistry
  context: ContextView
  model: ModelClient
  tools: ToolService
  /** 完成/消息到达时唤醒目标会话；seq 为触发事件序号，由装配层接到 AgentService.wake。 */
  wake?: (sessionId: string, seq: number) => void
  maxDepth?: number
  resultMaxChars?: number
}

function lastTurnEndReason(events: readonly SessionEvent[]): TurnEndReason | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]!
    if (event.type !== 'turn_ended') continue
    const reason = (event.payload as { reason?: unknown }).reason
    if (reason === 'done' || reason === 'max_steps' || reason === 'interrupted' || reason === 'error') {
      return reason
    }
  }
  return undefined
}

export class SubagentService {
  private readonly maxDepth: number
  private readonly resultMaxChars: number
  private readonly waiters = new Map<string, Set<() => void>>()
  /** 本进程内仍在执行的子 loop；复用子会话时日志可能还停在上一轮的终态，靠它判断"新一轮未落盘"。 */
  private readonly inflight = new Map<string, Promise<void>>()

  constructor(private readonly deps: SubagentDeps) {
    this.maxDepth = deps.maxDepth ?? DEFAULT_MAX_DEPTH
    this.resultMaxChars = deps.resultMaxChars ?? DEFAULT_RESULT_MAX_CHARS
  }

  private async appendAndEmit(sessionId: string, type: SessionEventType, payload: unknown): Promise<SessionEvent> {
    const [event] = await this.deps.session.append(sessionId, [{ type, payload }])
    this.deps.sink.emit(sessionId, {
      kind: 'event',
      seq: event!.seq,
      type: event!.type,
      payload: event!.payload,
    })
    return event!
  }

  /** spawn 立即返回子会话 id；子 loop 在后台执行，结果经 subagent_result 事件回注父会话。 */
  async spawn(
    parentSessionId: string,
    spec: SubagentSpec,
    opts?: { sessionId?: string },
  ): Promise<string> {
    const parent = await this.deps.session.getSession(parentSessionId)
    if (!parent) throw new Error(`parent session ${parentSessionId} not found`)

    const depth = parent.depth + 1
    if (depth > this.maxDepth) {
      throw new SubagentDepthLimitError(
        `subagent depth ${depth} exceeds limit ${this.maxDepth}`,
      )
    }

    let childSessionId: string
    if (opts?.sessionId) {
      const child = await this.deps.session.getSession(opts.sessionId)
      if (!child) throw new SubagentReuseError(`session ${opts.sessionId} not found`)
      if (child.parentId !== parentSessionId) {
        throw new SubagentReuseError(
          `session ${opts.sessionId} is not a child of ${parentSessionId}`,
        )
      }
      childSessionId = opts.sessionId
    } else {
      childSessionId = await this.deps.session.createSession({
        parentId: parentSessionId,
        depth,
      })
    }

    const claim = await this.deps.turns.claim(childSessionId)
    try {
      await this.appendAndEmit(parentSessionId, 'subagent_spawned', {
        childSessionId,
        task: spec.task,
        reused: Boolean(opts?.sessionId),
        systemPrompt: spec.systemPrompt,
        ...(spec.maxSteps !== undefined ? { maxSteps: spec.maxSteps } : {}),
      })
    } catch (err) {
      this.deps.turns.settle(childSessionId, 'error')
      throw err
    }

    const loop = createLoop({
      session: this.deps.session,
      context: this.deps.context,
      model: this.deps.model,
      tools: this.deps.tools,
      turns: this.deps.turns,
      sink: this.deps.sink,
      system: spec.systemPrompt,
      maxSteps: spec.maxSteps,
    })

    const done = loop
      .runTurn(childSessionId, {
        claim,
        signal: new AbortController().signal,
        input: spec.task,
      })
      .then(async (reason) => {
        const history = await this.deps.session.getHistory(childSessionId)
        const result = this.buildResult(history, childSessionId, reason)
        const injected = await this.appendAndEmit(parentSessionId, 'subagent_result', {
          childSessionId,
          reason,
          content: result.content,
          truncated: result.truncated,
        })
        this.deps.wake?.(parentSessionId, injected.seq)
      })
      .finally(() => {
        this.inflight.delete(childSessionId)
        this.notify(childSessionId)
      })
    this.inflight.set(childSessionId, done)
    // 结果落库失败不影响状态：turn_ended 已记录，wait/status 仍可折叠出终态。
    void done.catch(() => {})
    return childSessionId
  }

  /** mailbox 投递：from 与 to 必须在同一根会话下；目标运行中下一步吸收，空闲时按需唤醒。 */
  async send(
    fromSessionId: string,
    toSessionId: string,
    message: string,
    opts: SubagentSendOptions = {},
  ): Promise<void> {
    const [from, to] = await Promise.all([
      this.deps.session.getSession(fromSessionId),
      this.deps.session.getSession(toSessionId),
    ])
    if (!from) throw new Error(`session ${fromSessionId} not found`)
    if (!to) throw new Error(`session ${toSessionId} not found`)

    const [fromRoot, toRoot] = await Promise.all([this.rootOf(fromSessionId), this.rootOf(toSessionId)])
    if (fromRoot !== toRoot) {
      throw new SubagentSendScopeError(
        `sessions ${fromSessionId} and ${toSessionId} are not under the same root`,
      )
    }

    const delivered = await this.appendAndEmit(toSessionId, 'subagent_message', {
      fromSessionId,
      content: message,
    })
    if (opts.wake !== false) this.deps.wake?.(toSessionId, delivered.seq)
  }

  /** 等待子代理结束；超时返回当前状态而非抛错。未知会话返回 unknown。 */
  async wait(childSessionId: string, opts: SubagentWaitOptions = {}): Promise<SubagentWaitResult> {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError(`timeoutMs 必须为正数，收到 ${timeoutMs}`)
    }
    let release!: () => void
    const woke = new Promise<void>((resolve) => {
      release = resolve
      const set = this.waiters.get(childSessionId) ?? new Set<() => void>()
      set.add(resolve)
      this.waiters.set(childSessionId, set)
    })
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const snapshot = await this.inspect(childSessionId)
      if (snapshot.status !== 'running') return snapshot
      const timedOut = await Promise.race([
        woke.then(() => false),
        new Promise<true>((resolve) => {
          timer = setTimeout(() => resolve(true), timeoutMs)
        }),
      ])
      const after = await this.inspect(childSessionId)
      return timedOut ? { ...after, timedOut } : after
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      const set = this.waiters.get(childSessionId)
      set?.delete(release)
      if (set !== undefined && set.size === 0) this.waiters.delete(childSessionId)
    }
  }

  status(childSessionId: string): Promise<SubagentStatusSnapshot> {
    return this.inspect(childSessionId)
  }

  /** 读父会话 subagent_spawned 目录，逐个折叠子会话状态；不激活任何子 Agent。 */
  async listChildren(parentSessionId: string): Promise<SubagentInfo[]> {
    const events = await this.deps.session.getHistory(parentSessionId)
    const ids: string[] = []
    const seen = new Set<string>()
    const stored = new Map<string, SubagentResult>()
    for (const event of events) {
      if (event.type === 'subagent_spawned') {
        const childSessionId = (event.payload as { childSessionId?: unknown }).childSessionId
        if (typeof childSessionId === 'string' && !seen.has(childSessionId)) {
          seen.add(childSessionId)
          ids.push(childSessionId)
        }
      } else if (event.type === 'subagent_result') {
        const payload = event.payload as Partial<SubagentResult>
        if (typeof payload.childSessionId === 'string' && typeof payload.content === 'string') {
          stored.set(payload.childSessionId, {
            childSessionId: payload.childSessionId,
            reason: payload.reason ?? 'done',
            content: payload.content,
            truncated: Boolean(payload.truncated),
          })
        }
      }
    }

    const infos: SubagentInfo[] = []
    for (const childSessionId of ids) {
      const snapshot = await this.inspect(childSessionId)
      const result = snapshot.result ?? stored.get(childSessionId)
      infos.push({ childSessionId, status: snapshot.status, ...(result ? { result } : {}) })
    }
    return infos
  }

  private async inspect(childSessionId: string): Promise<SubagentStatusSnapshot> {
    const row = await this.deps.session.getSession(childSessionId)
    if (!row) return { status: 'unknown' }
    const history = await this.deps.session.getHistory(childSessionId)
    const active =
      this.inflight.has(childSessionId) ||
      this.deps.turns.getState(childSessionId)?.phase === 'running'
    const status = foldSubagentStatus(history, active)
    // 复用的子会话在上一轮 turn_ended 与新 turn_started 之间日志仍是旧终态，进程内活跃记录优先。
    if (active && status !== 'running') return { status: 'running' }
    if (status !== 'completed') return { status }
    const reason = lastTurnEndReason(history) ?? 'done'
    return { status, result: this.buildResult(history, childSessionId, reason) }
  }

  private buildResult(
    history: readonly SessionEvent[],
    childSessionId: string,
    reason: TurnEndReason,
  ): SubagentResult {
    const lastAssistant = [...history].reverse().find((e) => e.type === 'assistant_message')
    const fullText =
      lastAssistant && typeof lastAssistant.payload === 'object' && lastAssistant.payload !== null && 'text' in lastAssistant.payload
        ? String((lastAssistant.payload as { text: unknown }).text ?? '')
        : ''
    const truncated = fullText.length > this.resultMaxChars
    const content = truncated ? fullText.slice(0, this.resultMaxChars) + '……（已截断）' : fullText
    return { childSessionId, reason, content, truncated }
  }

  private notify(childSessionId: string): void {
    const set = this.waiters.get(childSessionId)
    if (set === undefined) return
    for (const release of set) release()
    this.waiters.delete(childSessionId)
  }

  private async rootOf(sessionId: string): Promise<string> {
    const visited = new Set<string>()
    let current = sessionId
    while (!visited.has(current)) {
      visited.add(current)
      const row = await this.deps.session.getSession(current)
      if (!row) throw new Error(`session ${current} not found`)
      if (row.parentId === null) return row.id
      current = row.parentId
    }
    throw new Error(`session parent chain from ${sessionId} contains a cycle`)
  }
}
