import type { ContextSnapshot } from '@worldbook/context'
import type { ModelClient, ModelUsage } from '@worldbook/model'
import type { ToolCall } from '@worldbook/tool'
import type { ToolService } from '@worldbook/tool'
import type { SessionService, SessionEvent, SessionEventType } from '@worldbook/session'
import type { EventSink } from '@worldbook/sink'
import { appendAndEmit } from '@worldbook/sink'
import type { TurnRegistry, TurnClaim, TurnEndReason, TurnId } from '@worldbook/turn'

export type { TurnEndReason }

export interface ContextView {
  getContextSnapshot(sessionId: string): Promise<ContextSnapshot>
}

export interface LoopDeps {
  session: SessionService
  context: ContextView
  model: ModelClient
  tools: ToolService
  turns: TurnRegistry
  sink: EventSink
  system?: string
  maxSteps?: number
}

interface RunTurnOptions {
  claim: TurnClaim
  signal: AbortSignal
  /** 缺省时不写 user_message：由日志中已有事件（如 subagent_result）驱动本轮。 */
  input?: string
  /** 每次读取上下文后回调其覆盖的 seq，供上层判断挂起的唤醒是否已被消费。 */
  onContextRead?: (lastSeq: number) => void
}

interface TurnEndedPayload {
  reason: TurnEndReason
  error?: string
  steps: number
}

const DEFAULT_MAX_STEPS = 16

export function createLoop(deps: LoopDeps) {
  const maxSteps = deps.maxSteps ?? DEFAULT_MAX_STEPS
  const toolSpecs = deps.tools.list()

  async function runTurn(sessionId: string, opts: RunTurnOptions): Promise<TurnEndReason> {
    const { claim, signal, input } = opts
    let steps = 0

    const emitEvent = (type: SessionEventType, payload: unknown): Promise<SessionEvent> =>
      appendAndEmit(deps.session, deps.sink, sessionId, type, payload)

    async function finish(reason: TurnEndReason, error?: string): Promise<TurnEndReason> {
      try {
        await emitEvent('turn_ended', {
          reason,
          steps,
          ...(error !== undefined ? { error } : {}),
        } satisfies TurnEndedPayload)
      } catch {
        // turn_ended 落库失败不阻塞 settle：状态机终态必须到达
      }
      deps.turns.settle(sessionId, reason)
      return reason
    }

    /** 上一进程遗留的半截 turn 不再有执行者：claim 后补写终态，避免日志出现嵌套 turn。 */
    async function repairDanglingTurn(): Promise<void> {
      const history = await deps.session.getHistory(sessionId)
      let open = false
      for (const event of history) {
        if (event.type === 'turn_started') open = true
        else if (event.type === 'turn_ended') open = false
      }
      if (open) await emitEvent('turn_ended', { reason: 'interrupted', steps: 0 })
    }

    try {
      await repairDanglingTurn()
      await emitEvent('turn_started', { turnId: claim.turnId })
      if (input !== undefined) await emitEvent('user_message', { text: input })

      let reason: TurnEndReason | undefined
      while (steps < maxSteps) {
        if (signal.aborted) {
          reason = 'interrupted'
          break
        }
        steps += 1
        await emitEvent('step_started', { step: steps })
        const stepReason = await runStep(sessionId, claim.turnId, signal, emitEvent, opts.onContextRead)
        await emitEvent('step_ended', { step: steps })
        if (stepReason) {
          reason = stepReason
          break
        }
      }
      return await finish(reason ?? 'max_steps')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return finish(signal.aborted ? 'interrupted' : 'error', message)
    }
  }

  /** 返回非 undefined 表示循环结束（done 或 interrupted）。 */
  async function runStep(
    sessionId: string,
    turnId: TurnId,
    signal: AbortSignal,
    emitEvent: (type: SessionEventType, payload: unknown) => Promise<SessionEvent>,
    onContextRead?: (lastSeq: number) => void,
  ): Promise<TurnEndReason | undefined> {
    const snapshot = await deps.context.getContextSnapshot(sessionId)
    onContextRead?.(snapshot.lastSeq)
    const messages = deps.system === undefined
      ? snapshot.messages
      : [{ role: 'system' as const, content: deps.system }, ...snapshot.messages]

    let text = ''
    const calls: ToolCall[] = []
    let usage: ModelUsage | undefined

    for await (const ev of deps.model.completeStream({ messages, tools: toolSpecs, signal })) {
      if (ev.type === 'delta') {
        deps.sink.emit(sessionId, { kind: 'delta', text: ev.text })
      } else if (ev.type === 'message') {
        text = ev.text
        calls.push(...ev.toolCalls)
        usage = ev.usage
      }
    }

    await emitEvent('assistant_message', {
      text,
      ...(calls.length > 0 ? { toolCalls: calls } : {}),
      ...(usage ? { usage } : {}),
    })

    if (calls.length === 0) return signal.aborted ? 'interrupted' : 'done'

    await emitEvent('tool_call', { calls })

    const results = await deps.tools.executeBatch(calls, {
      sessionId,
      turnId,
      signal,
    })
    for (const result of results) {
      await emitEvent('tool_result', {
        callId: result.callId,
        name: result.name,
        status: result.status,
        result: result.result,
      })
    }

    return signal.aborted ? 'interrupted' : undefined
  }

  return { runTurn }
}
