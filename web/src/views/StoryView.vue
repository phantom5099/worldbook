<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { IntentSuggestion, SessionSummary } from '@/api/types'
import { messageOf } from '@/api/errors'
import { partsOfStep } from '@/api/turns'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'
import PartLine from '@/components/PartLine.vue'
import StateNoteBox from '@/components/StateNoteBox.vue'

const route = useRoute()
const router = useRouter()
const sessions = useSessionsStore()
const ui = useUiStore()

const action = ref('')
const streamEl = ref<HTMLElement | null>(null)
const composer = ref<HTMLTextAreaElement | null>(null)

const session = computed(() => sessions.active)
const unitIndex = computed(() => session.value?.unitIndex ?? 1)
const isDraft = computed(() => session.value?.status === 'draft')
const unitTitle = computed(() => {
  const current = session.value
  if (!current) return 'Worldbook'
  return unitIndex.value === 1 ? current.snapshot.unit.title : `${current.snapshot.world.name} · ${sessions.unitLabel}`
})
const unitMeta = computed(() => {
  const current = session.value
  if (!current) return ''
  return unitIndex.value === 1
    ? current.snapshot.unit.meta
    : `${current.snapshot.world.name} · ${sessions.turnCount} / 12 轮`
})
const intents = computed<IntentSuggestion[]>(() => session.value?.snapshot.intents ?? [])
const opening = computed(() => session.value?.snapshot.opening)
const liveLines = computed(() => sessions.liveText.split('\n').filter((line) => line.trim().length > 0))
const canWrite = computed(() => sessions.canSend)
const placeholder = computed(() => {
  if (sessions.completed) return '本单元已完成 · 去复盘开启下一单元'
  if (sessions.streaming) return '叙事生成中…'
  return '或者，用自己的话行动……'
})

function scrollToBottom(): void {
  void nextTick(() => {
    const last = streamEl.value?.lastElementChild as HTMLElement | null
    if (last && typeof last.scrollIntoView === 'function') {
      last.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  })
}

watch(
  () => [sessions.turns.length, sessions.liveText, sessions.streaming],
  scrollToBottom,
  { flush: 'post' },
)

async function boot(): Promise<void> {
  if (!sessions.sessions.length) await sessions.load()
  const requested = String(route.params.id ?? '')
  const target = requested
    ? sessions.sessions.find((item) => item.id === requested)
    : (sessions.active ?? sessions.sessions[0])
  if (!target) {
    if (requested) ui.toast('会话不存在')
    await router.replace('/sessions')
    return
  }
  if (requested && !sessions.sessions.some((item) => item.id === requested)) {
    ui.toast('会话不存在')
    await router.replace('/sessions')
    return
  }
  sessions.select(target.id)
  if (!requested) {
    await router.replace(`/story/${target.id}`)
    return
  }
  if (target.status === 'active' && target.serverId) await sessions.enterStory(target.id)
}

onMounted(async () => {
  try {
    await boot()
  } catch (reason) {
    ui.toast(messageOf(reason))
  }
})

onBeforeUnmount(() => sessions.leaveStory())

watch(
  () => route.params.id,
  (next, previous) => {
    if (next && next !== previous) void boot().catch((reason) => ui.toast(messageOf(reason)))
  },
)

async function startDraft(): Promise<void> {
  const current = session.value
  if (!current) return
  try {
    await sessions.activate(current.id)
    await sessions.enterStory(current.id)
    ui.toast(`已开始「${current.title}」`)
  } catch (reason) {
    ui.toast(messageOf(reason))
  }
}

async function sendAction(text: string): Promise<void> {
  const current = session.value
  if (!current) return
  const value = text.trim()
  if (!value) {
    ui.toast('先写下你想做的事')
    composer.value?.focus()
    return
  }
  action.value = ''
  void nextTick(() => autoGrow())
  try {
    await sessions.send(value)
  } catch (reason) {
    ui.toast(messageOf(reason))
    action.value = value
  }
}

function choose(intent: IntentSuggestion): void {
  if (!canWrite.value) return
  void sendAction(intent.action)
}

function autoGrow(): void {
  const input = composer.value
  if (!input) return
  input.style.height = 'auto'
  input.style.height = `${Math.min(input.scrollHeight, 130)}px`
}

function onEnter(event: KeyboardEvent): void {
  if (event.isComposing) return
  void sendAction(action.value)
}

function goSessions(): void {
  void router.push('/sessions')
}

function goRecap(): void {
  void router.push('/recap')
}

function goCast(): void {
  void router.push('/cast')
}

function unitOf(current: SessionSummary): string {
  return current.unitIndex === 1 ? current.snapshot.unit.index : `第 ${current.unitIndex} 单元`
}
</script>

<template>
  <section class="view">
    <div v-if="!session" class="empty-state">
      <strong>还没有可阅读的会话</strong>
      <p>从一本世界书开始，主角与参与角色会以副本进入会话。</p>
      <button class="primary-btn" type="button" @click="router.push('/entry')">从世界书开始</button>
    </div>

    <template v-else>
      <div class="unit-head">
        <div class="unit-line">
          <span class="unit-kicker">{{ unitOf(session) }}</span>
          <h1>{{ unitTitle }}</h1>
          <span class="unit-status">{{ sessions.completed ? '已完成' : '展开' }}</span>
        </div>
        <p class="unit-meta">{{ unitMeta }}</p>
        <div class="unit-progressline"><span :style="{ width: `${sessions.progress}%` }"></span></div>
      </div>

      <div v-if="isDraft" class="empty-state">
        <strong>「{{ session.title }}」还是一份草稿</strong>
        <p>{{ session.snapshot.world.name }} · 主角 {{ session.snapshot.protagonist.name }}。开始后会创建服务端会话并锁定角色内容。</p>
        <div class="inline-actions">
          <button class="primary-btn" type="button" @click="startDraft">开始会话</button>
          <button class="ghost-btn" type="button" @click="goSessions">回到会话列表</button>
        </div>
      </div>

      <template v-else>
        <div :class="['scene-banner', session.snapshot.world.scene]" aria-hidden="true">
          <div class="scene-fog"></div>
          <div class="scene-caption">
            <span class="scene-place">{{ opening?.place }}</span>
            <span class="scene-time">{{ opening?.time }}</span>
          </div>
        </div>

        <div ref="streamEl" class="prose">
          <template v-if="unitIndex === 1">
            <PartLine v-for="(part, index) in opening?.parts ?? []" :key="`open-${index}`" :part="part" />
            <StateNoteBox v-if="opening?.note" :note="opening.note" />
          </template>
          <template v-else>
            <p>{{ sessions.unitLabel }}从一个未闭合的线程继续。你没有回到原点，只是换了一盏灯。</p>
            <p v-for="thread in session.snapshot.threads.slice(0, 2)" :key="thread.title">{{ thread.title }}：{{ thread.note }}</p>
          </template>

          <article v-for="turn in sessions.turns" :key="turn.turnId ?? `turn-${turn.round}`" class="turn">
            <div class="turn-meta">第 {{ turn.round }} 轮 · 你的行动</div>
            <div class="player-action">{{ turn.action }}</div>
            <div class="ai-block-head">
              <span class="ai-chip small">AI 生成</span>
              <span>第 {{ turn.round }} 轮 · 小说模式</span>
            </div>
            <div class="ai-prose">
              <template v-for="(step, stepIndex) in turn.steps" :key="stepIndex">
                <PartLine v-for="(part, partIndex) in partsOfStep(step)" :key="partIndex" :part="part" />
                <StateNoteBox v-for="(note, noteIndex) in step.notes ?? []" :key="`note-${noteIndex}`" :note="note" />
              </template>
              <template v-if="turn.status === 'running' && sessions.streaming">
                <p v-for="(line, index) in liveLines" :key="`live-${index}`">{{ line }}</p>
                <span v-if="!liveLines.length" class="typing">叙事生成中</span>
              </template>
            </div>
            <p v-if="turn.status === 'interrupted'" class="card-note">本轮被中断，可以重新行动。</p>
            <p v-else-if="turn.status === 'error'" class="card-note">本轮生成失败：{{ turn.reason || '未知错误' }}</p>
          </article>

          <article v-if="sessions.streaming && !sessions.turns.length" class="turn">
            <div class="ai-block-head">
              <span class="ai-chip small">AI 生成</span>
              <span>等待叙事</span>
            </div>
            <div class="ai-prose">
              <p v-for="(line, index) in liveLines" :key="`live-${index}`">{{ line }}</p>
              <span v-if="!liveLines.length" class="typing">叙事生成中</span>
            </div>
          </article>
        </div>

        <p v-if="sessions.error" class="auth-error">{{ sessions.error }}</p>

        <section class="turn-options" aria-labelledby="choiceTitle">
          <div class="options-head">
            <h2 id="choiceTitle">{{ sessions.completed ? '本单元已完成' : '你要怎么做？' }}</h2>
            <span>{{ sessions.completed ? '12 轮已走完 · 状态已锁定' : '选项表示意图，不锁死自由输入' }}</span>
          </div>

          <div v-if="sessions.completed" class="empty-inline">
            本单元 12 轮已走完。前往复盘查看选择与关系变化，或直接开启下一单元。
            <br>
            <button class="primary-btn" type="button" @click="goRecap">去复盘</button>
          </div>
          <div v-else class="intent-list">
            <button
              v-for="(intent, index) in intents"
              :key="intent.key"
              class="intent-card"
              type="button"
              :disabled="!canWrite"
              @click="choose(intent)"
            >
              <span class="intent-index">{{ String(index + 1).padStart(2, '0') }}</span>
              <span class="intent-body">
                <span class="intent-tone">{{ intent.tone }}</span>
                <span class="intent-title">{{ intent.title }}</span>
                <span class="intent-hint">{{ intent.hint }}</span>
              </span>
              <span class="intent-arrow">→</span>
            </button>
          </div>

          <form class="composer" @submit.prevent="sendAction(action)">
            <label class="sr-only" for="composerInput">用你自己的话行动</label>
            <div class="composer-box">
              <textarea
                id="composerInput"
                ref="composer"
                v-model="action"
                rows="1"
                :disabled="!canWrite"
                :placeholder="placeholder"
                @input="autoGrow"
                @keydown.enter.exact.prevent="onEnter"
              ></textarea>
              <button class="send-btn" type="submit" :disabled="!canWrite" aria-label="发送行动">发送</button>
            </div>
            <p class="composer-note">
              主角 {{ session.snapshot.protagonist.name }} · 首选 {{ session.snapshot.protagonist.model }} · 本轮预计 3–5 次调用
            </p>
          </form>

          <p class="ai-disclosure">
            本段由 AI 生成 · 内容可能不准确 ·
            <button type="button" class="link-btn" @click="ui.toast('举报入口已打开（原型）')">举报</button>
          </p>
        </section>

        <div class="inline-actions session-story-links">
          <button class="ghost-btn" type="button" @click="goCast">在场角色</button>
          <button class="ghost-btn" type="button" @click="goRecap">单元复盘</button>
        </div>
      </template>
    </template>
  </section>
</template>
