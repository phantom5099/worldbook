import type { SessionService } from '@worldbook/session'
import type { TurnIdSource } from '@worldbook/turn'

/** 从会话日志恢复回合编号：`turn_started` 载荷携带 turnId。 */
export function sessionTurnIds(session: SessionService): TurnIdSource {
  return {
    async lastTurnId(sessionId) {
      const events = await session.getHistory(sessionId)
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const event = events[i]!
        if (event.type !== 'turn_started') continue
        const turnId = (event.payload as { turnId?: unknown }).turnId
        if (typeof turnId === 'number') return turnId
      }
      return 0
    },
  }
}
