import type {
  AssistantMessagePayload,
  ChangeRecord,
  NarrativePart,
  RelationLabel,
  SessionCast,
  SessionEvent,
  StateNote,
  TurnEndedPayload,
  TurnStartedPayload,
  TurnStatus,
  TurnStep,
  TurnView,
  UserMessagePayload,
} from './types'
import { relationKeyOf } from './normalize'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function statusOf(reason: string | undefined): TurnStatus {
  if (reason === 'interrupted') return 'interrupted'
  if (reason === 'error') return 'error'
  return 'done'
}

function stepOf(payload: AssistantMessagePayload): TurnStep {
  return {
    text: textOf(payload.text),
    ...(Array.isArray(payload.parts) ? { parts: payload.parts } : {}),
    ...(Array.isArray(payload.notes) ? { notes: payload.notes } : {}),
    ...(Array.isArray(payload.toolCalls) ? { toolCalls: payload.toolCalls } : {}),
  }
}

function createTurn(round: number, turnId?: string): TurnView {
  return { ...(turnId ? { turnId } : {}), round, action: '', steps: [], status: 'running' }
}

/** 事件日志 → 页面回合模型。纯函数，历史回放与实时事件共用。 */
export function foldTurns(events: readonly SessionEvent[]): TurnView[] {
  const turns: TurnView[] = []
  let current: TurnView | undefined
  let step: TurnStep | undefined
  let round = 0

  for (const event of events) {
    if (event.type === 'turn_started') {
      if (current) current.status = 'interrupted'
      const payload = isRecord(event.payload) ? (event.payload as unknown as TurnStartedPayload) : undefined
      round += 1
      current = createTurn(round, typeof payload?.turnId === 'string' ? payload.turnId : undefined)
      turns.push(current)
      step = undefined
      continue
    }

    if (event.type === 'user_message' && current) {
      current.action = textOf((event.payload as UserMessagePayload | undefined)?.text)
      continue
    }

    if (event.type === 'assistant_message') {
      if (!current) {
        round += 1
        current = createTurn(round)
        turns.push(current)
      }
      const payload = isRecord(event.payload) ? (event.payload as unknown as AssistantMessagePayload) : { text: '' }
      step = stepOf(payload)
      current.steps.push(step)
      continue
    }

    if (event.type === 'tool_call' && step && isRecord(event.payload)) {
      const calls = event.payload.calls
      if (Array.isArray(calls)) step.toolCalls = [...(step.toolCalls ?? []), ...calls]
      continue
    }

    if (event.type === 'turn_ended' && current) {
      const payload = isRecord(event.payload) ? (event.payload as unknown as TurnEndedPayload) : undefined
      current.status = statusOf(payload?.reason)
      current.reason = payload?.reason
      current = undefined
      step = undefined
    }
  }

  return turns
}

export function lastSeqOf(events: readonly SessionEvent[]): number {
  return events.length ? events[events.length - 1]!.seq : 0
}

export function mergeEvents(
  history: readonly SessionEvent[],
  incoming: readonly SessionEvent[],
): SessionEvent[] {
  const map = new Map<number, SessionEvent>()
  for (const event of history) map.set(event.seq, event)
  for (const event of incoming) map.set(event.seq, event)
  return [...map.values()].sort((a, b) => a.seq - b.seq)
}

export function notesOfTurn(turn: TurnView): StateNote[] {
  return turn.steps.flatMap((step) => step.notes ?? [])
}

const REL_LABELS: RelationLabel[] = ['信任', '好感', '恐惧', '尊重']

function relationLabelOf(value: string): RelationLabel | undefined {
  return REL_LABELS.includes(value as RelationLabel) ? (value as RelationLabel) : undefined
}

/** 把叙事里的关系变化应用到会话角色快照，并生成复盘记录。 */
export function applyNotes(
  cast: readonly SessionCast[],
  notes: readonly StateNote[],
  round: number,
): { cast: SessionCast[]; changes: ChangeRecord[] } {
  const next = cast.map((card) => ({ ...card, relations: { ...card.relations } }))
  const changes: ChangeRecord[] = []

  for (const note of notes) {
    const card = next.find((item) => item.name === note.who)
    for (const delta of note.deltas ?? []) {
      const [labelText, value, direction] = delta
      const label = relationLabelOf(labelText)
      const key = label ? relationKeyOf(label) : undefined
      const amount = Number.parseFloat(value)
      if (card && key && Number.isFinite(amount)) {
        card.relations[key] = Math.max(0, Math.min(1, Number((card.relations[key] + amount).toFixed(2))))
      }
      if (label) {
        changes.push({
          who: note.who,
          label,
          value,
          direction,
          reason: `${note.impression}（第 ${round} 轮）`,
        })
      }
    }
  }

  return { cast: next, changes }
}

export function partsOfStep(step: TurnStep): NarrativePart[] {
  return step.parts ?? [{ type: 'p', text: step.text }]
}

export function fullTextOfTurn(turn: TurnView): string {
  return turn.steps.map((step) => step.text).join('\n\n')
}
