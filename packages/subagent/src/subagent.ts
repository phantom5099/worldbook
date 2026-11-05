import { createLoop } from '@worldbook/agent'
import type { ContextView } from '@worldbook/agent'
import type { ModelClient } from '@worldbook/model'
import type { ToolService } from '@worldbook/tool'
import type { SessionService, SessionEvent, SessionEventType } from '@worldbook/session'
import type { EventSink } from '@worldbook/sink'
import type { TurnRegistry, TurnEndReason } from '@worldbook/turn'

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

export class SubagentDepthLimitError extends Error {}
export class SubagentReuseError extends Error {}
export class SubagentSendScopeError extends Error {}

const DEFAULT_MAX_DEPTH = 2
const DEFAULT_RESULT_MAX_CHARS = 4000

export interface SubagentDeps {
  session: SessionService
  sink: EventSink
  turns: TurnRegistry
  context: ContextView
  model: ModelClient
  tools: ToolService
  maxDepth?: number
  resultMaxChars?: number
}

export class SubagentService {
  private readonly maxDepth: number
  private readonly resultMaxChars: number
  private readonly pending = new Map<string, Promise<SubagentResult>>()

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

    const claim = this.deps.turns.claim(childSessionId)
    try {
      await this.appendAndEmit(parentSessionId, 'subagent_spawned', {
        childSessionId,
        task: spec.task,
        reused: Boolean(opts?.sessionId),
      })
    } catch (err) {
      this.deps.turns.settle(claim.turnId, 'error')
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
      .runTurn(childSessionId, spec.task, { claim, signal: new AbortController().signal })
      .then(async (reason) => {
        const history = await this.deps.session.getHistory(childSessionId)
        const lastAssistant = [...history].reverse().find((e) => e.type === 'assistant_message')
        const fullText =
          lastAssistant && typeof lastAssistant.payload === 'object' && lastAssistant.payload !== null && 'text' in lastAssistant.payload
            ? String((lastAssistant.payload as { text: unknown }).text ?? '')
            : ''
        const truncated = fullText.length > this.resultMaxChars
        const content = truncated ? fullText.slice(0, this.resultMaxChars) + '……（已截断）' : fullText
        const result: SubagentResult = { childSessionId, reason, content, truncated }
        await this.appendAndEmit(parentSessionId, 'subagent_result', {
          childSessionId,
          reason,
          content,
          truncated,
        })
        return result
      })

    this.pending.set(childSessionId, done)
    return childSessionId
  }

  /** mailbox 投递：from 与 to 必须在同一根会话下；接收方在 step 边界经全量重投影吸收，空闲不唤醒。 */
  async send(fromSessionId: string, toSessionId: string, message: string): Promise<void> {
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

    await this.appendAndEmit(toSessionId, 'subagent_message', {
      fromSessionId,
      content: message,
    })
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

  wait(childSessionId: string): Promise<SubagentResult> {
    const pending = this.pending.get(childSessionId)
    if (!pending) {
      throw new Error(`no pending subagent for session ${childSessionId}`)
    }
    return pending
  }
}
