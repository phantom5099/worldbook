import type { SessionEvent } from '@worldbook/session'
import type { TurnEndReason } from '@worldbook/turn'

export type SubagentStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
  | 'unknown'

function isTurnEndReason(value: unknown): value is TurnEndReason {
  return value === 'done' || value === 'max_steps' || value === 'interrupted' || value === 'error'
}

/** 从会话事件折叠子代理状态：无活跃执行者的半截 turn 视为 interrupted（进程重启遗留）。 */
export function foldSubagentStatus(
  events: readonly SessionEvent[],
  active: boolean,
): SubagentStatus {
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
  if (open) return active ? 'running' : 'interrupted'
  if (lastReason === undefined) return 'unknown'
  if (lastReason === 'interrupted') return 'cancelled'
  return lastReason === 'error' ? 'failed' : 'completed'
}
