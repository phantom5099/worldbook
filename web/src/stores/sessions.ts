import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  ChangeRecord,
  SessionCast,
  SessionEvent,
  SessionSummary,
  SinkFrame,
  TurnView,
} from '@/api/types'
import { messageOf } from '@/api/errors'
import { foldTurns, mergeEvents, notesOfTurn, applyNotes } from '@/api/turns'
import { services } from '@/services/services'
import { useUiStore } from './ui'

const NUM_CN = ['', '第一', '第二', '第三', '第四', '第五', '第六', '第七', '第八', '第九', '第十', '第十一', '第十二']
const ROUND_LIMIT = 12

export const useSessionsStore = defineStore('sessions', () => {
  const ui = useUiStore()
  const sessions = ref<SessionSummary[]>([])
  const activeId = ref<string | null>(null)
  const events = ref<SessionEvent[]>([])
  const turns = ref<TurnView[]>([])
  const loading = ref(false)
  const streaming = ref(false)
  const liveText = ref('')
  const connected = ref(false)
  const error = ref('')
  const phase = ref('idle')

  let streamAbort: AbortController | undefined
  let streamTask: Promise<void> | undefined
  let activeServerId = ''

  const active = computed(() => sessions.value.find((item) => item.id === activeId.value) ?? null)
  const unitLabel = computed(() => {
    const index = active.value?.unitIndex ?? 1
    return index === 1 ? (active.value?.snapshot.unit.index ?? '第一单元') : `${NUM_CN[index] ?? index}单元`
  })
  const turnCount = computed(() => Math.min(ROUND_LIMIT, active.value?.turnCount ?? 0))
  const completed = computed(() => Boolean(active.value?.completed))
  const progress = computed(() => Math.min(100, (turnCount.value / ROUND_LIMIT) * 100))
  const cast = computed<SessionCast[]>(() => replay().cast)
  const changes = computed<ChangeRecord[]>(() =>
    turns.value.length ? replay().changes : (active.value?.changes ?? []),
  )
  const canSend = computed(
    () => Boolean(active.value?.status === 'active' && active.value.serverId && !completed.value && !streaming.value),
  )

  function replay(): { cast: SessionCast[]; changes: ChangeRecord[] } {
    const snapshot = active.value?.snapshot
    if (!snapshot) return { cast: [], changes: [] }
    let next = snapshot.cast.map((card) => ({ ...card, relations: { ...card.relations } }))
    const records: ChangeRecord[] = []
    for (const turn of turns.value) {
      const notes = notesOfTurn(turn)
      if (!notes.length) continue
      const applied = applyNotes(next, notes, turn.round)
      next = applied.cast
      records.push(...applied.changes)
    }
    return { cast: next, changes: records }
  }

  function replaceSession(next: SessionSummary): void {
    const index = sessions.value.findIndex((item) => item.id === next.id)
    if (index >= 0) sessions.value[index] = next
    else sessions.value.unshift(next)
  }

  function resetStory(): void {
    events.value = []
    turns.value = []
    liveText.value = ''
    error.value = ''
    phase.value = 'idle'
  }

  async function load(): Promise<SessionSummary[]> {
    loading.value = true
    error.value = ''
    try {
      sessions.value = await services.sessions.list()
      const exists = sessions.value.some((item) => item.id === activeId.value)
      if (!exists) {
        const firstActive = sessions.value.find((item) => item.status === 'active')
        activeId.value = firstActive?.id ?? sessions.value[0]?.id ?? null
      }
      return sessions.value
    } catch (reason) {
      error.value = messageOf(reason)
      throw reason
    } finally {
      loading.value = false
    }
  }

  function select(id: string): void {
    if (activeId.value !== id) resetStory()
    activeId.value = id
  }

  function current(): SessionSummary | null {
    return sessions.value.find((item) => item.id === activeId.value) ?? null
  }

  function storySession(): SessionSummary | null {
    return active.value
  }

  async function loadHistory(id: string): Promise<void> {
    select(id)
    const session = current()
    if (!session?.serverId) {
      resetStory()
      return
    }
    error.value = ''
    try {
      const list = await services.transport.history(session.serverId)
      activeServerId = session.serverId
      events.value = list
      turns.value = foldTurns(list)
      const last = turns.value[turns.value.length - 1]
      if (last?.status === 'running') {
        streaming.value = true
        phase.value = 'running'
      } else {
        streaming.value = false
      }
      await syncProgress()
    } catch (reason) {
      error.value = messageOf(reason)
      throw reason
    }
  }

  function connectStream(): void {
    const session = current()
    if (!session?.serverId) return
    if (streamAbort && activeServerId === session.serverId) return
    stopStream()
    activeServerId = session.serverId
    streamAbort = new AbortController()
    const signal = streamAbort.signal
    connected.value = true
    streamTask = consume(session.serverId, signal).finally(() => {
      connected.value = false
    })
  }

  async function consume(serverId: string, signal: AbortSignal): Promise<void> {
    try {
      for await (const frame of services.transport.stream(serverId, signal)) {
        if (signal.aborted) break
        await handleFrame(frame)
      }
    } catch (reason) {
      if (signal.aborted) return
      error.value = messageOf(reason)
      streaming.value = false
    }
  }

  async function handleFrame(frame: SinkFrame): Promise<void> {
    if (frame.kind === 'delta') {
      liveText.value += frame.text
      return
    }
    if (frame.kind === 'transition') {
      phase.value = frame.phase
      if (frame.phase === 'running') {
        streaming.value = true
        liveText.value = ''
      } else if (frame.phase === 'done' || frame.phase === 'error') {
        streaming.value = false
        liveText.value = ''
        await refreshHistory()
      }
      return
    }
    events.value = mergeEvents(events.value, [
      { seq: frame.seq, type: frame.type, payload: frame.payload, createdAt: new Date().toISOString() },
    ])
    turns.value = foldTurns(events.value)
    if (frame.type === 'assistant_message') liveText.value = ''
    if (frame.type === 'turn_ended') {
      streaming.value = false
      phase.value = 'done'
      await commitTurn()
    }
  }

  async function refreshHistory(): Promise<void> {
    const session = current()
    if (!session?.serverId) return
    const list = await services.transport.history(session.serverId)
    events.value = list
    turns.value = foldTurns(list)
  }

  async function commitTurn(): Promise<void> {
    await syncProgress()
  }

  /** 以事件日志为准回填进度：离开页面或断线时事件仍会落库，回来时据此校正。 */
  async function syncProgress(): Promise<void> {
    const session = current()
    if (!session || !session.serverId) return
    const done = turns.value.filter((turn) => turn.status !== 'running').length
    if (!done) return
    const nextCount = Math.min(ROUND_LIMIT, Math.max(session.turnCount, done))
    const isComplete = nextCount >= ROUND_LIMIT
    if (nextCount === session.turnCount && isComplete === session.completed) return
    const updated = await services.sessions.markProgress(session.id, {
      turnCount: nextCount,
      changes: replay().changes,
      completed: isComplete || session.completed,
    })
    replaceSession(updated)
    if (isComplete && !session.completed) ui.toast('本单元已完成 · 去复盘查看结算')
  }

  async function enterStory(id: string): Promise<void> {
    await loadHistory(id)
    const session = current()
    if (session?.status === 'active' && session.serverId) connectStream()
  }

  function leaveStory(): void {
    stopStream()
  }

  function stopStream(): void {
    streamAbort?.abort()
    streamAbort = undefined
    streamTask = undefined
    connected.value = false
  }

  async function send(action: string): Promise<void> {
    const session = current()
    if (!session?.serverId) throw new Error('会话还没有连接到服务端')
    if (streaming.value) throw new Error('上一轮还在生成，稍等片刻')
    if (session.completed || session.turnCount >= ROUND_LIMIT) throw new Error('本单元已完成 · 去复盘开启下一单元')
    const text = action.trim().slice(0, 300)
    if (!text) throw new Error('先写下你想做的事')
    error.value = ''
    liveText.value = ''
    streaming.value = true
    connectStream()
    try {
      await services.transport.startTurn(session.serverId, text)
    } catch (reason) {
      streaming.value = false
      error.value = messageOf(reason)
      await refreshHistory().catch(() => undefined)
      throw reason
    }
  }

  async function create(input: Parameters<typeof services.sessions.create>[0]): Promise<SessionSummary> {
    const session = await services.sessions.create(input)
    replaceSession(session)
    activeId.value = session.id
    return session
  }

  async function activate(id: string): Promise<SessionSummary> {
    const session = await services.sessions.activate(id)
    replaceSession(session)
    activeId.value = id
    return session
  }

  async function update(
    id: string,
    patch: Parameters<typeof services.sessions.update>[1],
  ): Promise<SessionSummary> {
    const session = await services.sessions.update(id, patch)
    replaceSession(session)
    return session
  }

  async function remove(id: string): Promise<void> {
    await services.sessions.remove(id)
    sessions.value = sessions.value.filter((item) => item.id !== id)
    if (activeId.value === id) {
      resetStory()
      activeId.value = sessions.value[0]?.id ?? null
    }
  }

  async function nextUnit(): Promise<SessionSummary> {
    const session = current()
    if (!session || !session.completed) throw new Error('本单元还没有完成')
    const next = await services.sessions.startUnit(session.id)
    replaceSession(next)
    resetStory()
    await loadHistory(next.id)
    return next
  }

  return {
    sessions,
    activeId,
    active,
    events,
    turns,
    loading,
    streaming,
    liveText,
    connected,
    error,
    phase,
    unitLabel,
    turnCount,
    completed,
    progress,
    cast,
    changes,
    canSend,
    load,
    select,
    storySession,
    loadHistory,
    enterStory,
    leaveStory,
    connectStream,
    refreshHistory,
    send,
    create,
    activate,
    update,
    remove,
    nextUnit,
  }
})
