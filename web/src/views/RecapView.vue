<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { messageOf } from '@/api/errors'
import { partsOfStep } from '@/api/turns'
import type { TurnView } from '@/api/types'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'
import AppAvatar from '@/components/AppAvatar.vue'

const NUM_CN = ['', '第一', '第二', '第三', '第四', '第五', '第六', '第七', '第八', '第九', '第十', '第十一', '第十二']
const router = useRouter()
const sessions = useSessionsStore()
const ui = useUiStore()
const loading = ref(true)

const session = computed(() => sessions.active)
const rounds = computed(() => Math.max(sessions.turnCount, sessions.turns.length))
const completed = computed(() => sessions.completed || rounds.value >= 12)
const nodes = computed(() => Math.min(24, rounds.value * 2))
const roles = computed(() => sessions.cast.length)
const threads = computed(() => session.value?.snapshot.threads ?? [])
const changes = computed(() => sessions.changes)

const stats = computed(() => [
  { label: '实际轮次', value: String(rounds.value), suffix: '/ 12', note: completed.value ? '已结算' : '进行中' },
  { label: '在场角色', value: String(roles.value), suffix: `/ ${roles.value}`, note: '无超限' },
  { label: '使用节点', value: String(nodes.value), suffix: '/ 24', note: '预算内' },
  { label: '未闭线程', value: String(threads.value.length), suffix: '', note: '下单元回收' },
])

const description = computed(() => {
  const current = session.value
  if (!current) return ''
  return rounds.value
    ? `你在《${current.snapshot.world.name}》完成了 ${rounds.value} 轮行动，${changes.value.length} 条关系变化已记录。`
    : `${current.snapshot.opening.parts[0]?.text ?? '这个单元还没有行动记录。'}`
})

const scope = computed(() => {
  const deviation = (actual: number, planned: number) => Math.round(((actual - planned) / planned) * 100)
  return [
    { label: '单元轮次', planned: 12, actual: rounds.value, deviation: deviation(rounds.value, 12) },
    { label: '使用节点', planned: 24, actual: nodes.value, deviation: deviation(nodes.value, 24) },
    { label: '激活角色', planned: roles.value, actual: roles.value, deviation: 0 },
  ]
})

const nextLabel = computed(() => {
  const index = (session.value?.unitIndex ?? 1) + 1
  return completed.value ? `开启${NUM_CN[index] ?? '下一'}单元 →` : '继续当前单元 →'
})

function summaryOf(turn: TurnView): string {
  for (const step of turn.steps) {
    for (const part of partsOfStep(step)) {
      if (part.type === 'p') return part.text.length > 52 ? `${part.text.slice(0, 52)}…` : part.text
    }
  }
  return ''
}

function avatarOf(name: string) {
  return sessions.cast.find((card) => card.name === name)
}

onMounted(async () => {
  loading.value = true
  try {
    if (!sessions.sessions.length) await sessions.load()
    if (!sessions.activeId) {
      const first = sessions.sessions.find((item) => item.status === 'active') ?? sessions.sessions[0]
      if (first) sessions.select(first.id)
    }
    const current = session.value
    if (current?.status === 'active' && current.serverId && !sessions.turns.length) {
      await sessions.loadHistory(current.id)
    }
  } catch (reason) {
    ui.toast(messageOf(reason))
  } finally {
    loading.value = false
  }
})

function backToStory(): void {
  if (sessions.activeId) void router.push(`/story/${sessions.activeId}`)
  else void router.push('/sessions')
}

async function nextUnit(): Promise<void> {
  const current = session.value
  if (!current) return
  if (!completed.value) {
    await router.push(`/story/${current.id}`)
    return
  }
  try {
    const next = await sessions.nextUnit()
    ui.toast(`${sessions.unitLabel}已开启`)
    await router.push(`/story/${next.id}`)
  } catch (reason) {
    ui.toast(messageOf(reason))
  }
}
</script>

<template>
  <section class="view">
    <div class="page-head">
      <button class="back-link" type="button" @click="backToStory">← 返回会话</button>
      <h1>{{ session ? `${session.title} · 复盘` : '单元复盘' }}</h1>
      <p>{{ description }}</p>
    </div>

    <p v-if="loading" class="empty-inline">正在读取回合记录…</p>

    <div v-if="!session" class="empty-state">
      <strong>还没有可复盘的会话</strong>
      <p>完成至少一轮行动后，这里会记录选择、关系变化与未闭线程。</p>
      <button class="primary-btn" type="button" @click="router.push('/sessions')">回到会话列表</button>
    </div>

    <template v-else>
      <div class="stat-grid">
        <div v-for="stat in stats" :key="stat.label" class="stat">
          <span>{{ stat.label }}</span>
          <strong>{{ stat.value }} <small>{{ stat.suffix }}</small></strong>
          <em>{{ stat.note }}</em>
        </div>
      </div>

      <section class="recap-block">
        <div class="section-head"><h2>关键选择</h2></div>
        <ol class="timeline">
          <li v-for="turn in sessions.turns" :key="turn.turnId ?? `turn-${turn.round}`">
            <span class="time">第 {{ turn.round }} 轮</span>
            <div>
              <strong>{{ turn.action || '（尚未记录行动）' }}</strong>
              <p v-if="summaryOf(turn)">{{ summaryOf(turn) }}</p>
              <span class="event-id">第 {{ turn.round }} 轮 · 小说模式 · {{ turn.status }}</span>
            </div>
          </li>
          <li v-if="!sessions.turns.length">
            <div class="empty-inline">还没有行动记录。进入故事开始第一轮。</div>
          </li>
        </ol>
      </section>

      <section class="recap-block">
        <div class="section-head"><h2>关系变化</h2></div>
        <div class="delta-list">
          <div v-for="(change, index) in changes" :key="`${change.who}-${change.label}-${index}`" class="delta-row">
            <AppAvatar
              :name="change.who"
              :avatar="avatarOf(change.who)?.avatar"
              :avatar-class="avatarOf(change.who)?.avatarClass"
            />
            <div>
              <strong>{{ change.who }} · {{ change.label }}</strong>
              <p>{{ change.reason }}</p>
            </div>
            <span :class="['delta', change.direction]">{{ change.value }}</span>
          </div>
          <div v-if="!changes.length" class="empty-inline">还没有关系变化。</div>
        </div>
      </section>

      <section class="recap-block">
        <div class="section-head"><h2>未闭线程</h2></div>
        <div class="thread-list">
          <div v-for="thread in threads" :key="thread.title" class="thread">
            <span :class="['thread-dot', { new: thread.state === '新', done: thread.state === '已闭合' }]"></span>
            <div>
              <strong>{{ thread.title }}</strong>
              <p>{{ thread.note }}</p>
            </div>
            <span class="thread-state">{{ thread.state || '进行中' }}</span>
          </div>
          <div v-if="!threads.length" class="empty-inline">这本世界书还没有预置线程。</div>
        </div>
      </section>

      <section class="recap-block">
        <div class="section-head"><h2>范围计划与实际</h2></div>
        <div class="scope-table">
          <div class="scope-tr scope-th"><span>项目</span><span>计划</span><span>实际</span><span>偏差</span></div>
          <div v-for="row in scope" :key="row.label" class="scope-tr">
            <span>{{ row.label }}</span>
            <span>{{ row.planned }}</span>
            <span>{{ row.actual }}</span>
            <span :class="Math.abs(row.deviation) > 20 ? 'warn' : 'ok'">{{ row.deviation > 0 ? '+' : '' }}{{ row.deviation }}%</span>
          </div>
        </div>
        <p class="card-note">
          {{ completed ? '本单元已结算。未闭线程将至少有一条进入下一单元；世界书模板不受影响。' : '单元仍在进行：以上为实时快照，12 轮走完后自动结算。' }}
        </p>
      </section>

      <div class="recap-foot">
        <button class="primary-btn" type="button" @click="nextUnit">{{ nextLabel }}</button>
      </div>
    </template>
  </section>
</template>
