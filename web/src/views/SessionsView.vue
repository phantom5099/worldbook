<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { SessionSummary } from '@/api/types'
import { shortDate } from '@/api/ids'
import { messageOf } from '@/api/errors'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'
import BookCover from '@/components/BookCover.vue'
import SessionEditModal from '@/components/SessionEditModal.vue'

const router = useRouter()
const sessions = useSessionsStore()
const ui = useUiStore()
const editTarget = ref<SessionSummary | null>(null)

const focus = computed(() => sessions.active ?? sessions.sessions[0] ?? null)

onMounted(async () => {
  try {
    await sessions.load()
  } catch (reason) {
    ui.toast(messageOf(reason))
  }
})

function unitOf(session: SessionSummary): string {
  return session.unitIndex === 1 ? session.snapshot.unit.index : `第 ${session.unitIndex} 单元`
}

async function resume(session: SessionSummary): Promise<void> {
  sessions.select(session.id)
  await router.push(`/story/${session.id}`)
}

async function start(session: SessionSummary): Promise<void> {
  try {
    await sessions.activate(session.id)
    ui.toast(`已开始「${session.title}」`)
    await router.push(`/story/${session.id}`)
  } catch (reason) {
    ui.toast(messageOf(reason))
  }
}

function edit(session: SessionSummary): void {
  editTarget.value = session
}

async function saveSession(patch: { title: string; snapshot: SessionSummary['snapshot'] }): Promise<void> {
  if (!editTarget.value) return
  try {
    await sessions.update(editTarget.value.id, patch)
    editTarget.value = null
    ui.toast('会话已更新')
  } catch (reason) {
    ui.toast(messageOf(reason))
  }
}
</script>

<template>
  <section class="view">
    <div class="page-head">
      <h1>你的会话</h1>
      <p>会话从世界书衍生；创建后世界书与角色卡内容锁定，只能调整模型。</p>
      <div class="inline-actions">
        <button class="primary-btn" type="button" @click="router.push('/entry')">＋ 新建会话</button>
      </div>
    </div>

    <div v-if="!focus" class="empty-state">
      <strong>还没有会话</strong>
      <p>从一本世界书开始，主角与参与角色会以副本进入会话。</p>
      <button class="primary-btn" type="button" @click="router.push('/entry')">从世界书开始</button>
    </div>

    <div v-else class="session-hero">
      <div class="session-hero-cover"><BookCover :world="focus.snapshot.world" /></div>
      <div class="session-hero-body">
        <span class="page-kicker">{{ focus.status === 'active' ? '当前会话 · 进行中' : '当前会话 · 草稿' }}</span>
        <h2>{{ focus.title }}</h2>
        <p class="session-hero-meta">
          {{ focus.snapshot.world.name }} · {{ focus.status === 'active' ? unitOf(focus) : '尚未开始' }} · 创建于 {{ shortDate(focus.createdAt) }}
        </p>
        <p class="session-hero-card">
          <span>主角 </span>{{ focus.snapshot.protagonist.name }} · {{ focus.snapshot.protagonist.role || '身份未定' }}
          <template v-if="focus.snapshot.protagonist.goal"> · 公开目标：{{ focus.snapshot.protagonist.goal }}</template>
        </p>
      </div>
      <div class="session-hero-actions">
        <button v-if="focus.status === 'active'" class="primary-btn" type="button" @click="resume(focus)">继续阅读</button>
        <button v-else class="primary-btn" type="button" @click="start(focus)">开始会话</button>
        <button class="ghost-btn" type="button" @click="edit(focus)">编辑</button>
      </div>
    </div>

    <div v-if="sessions.sessions.length" class="session-list" style="margin-top: 16px">
      <div v-for="session in sessions.sessions" :key="session.id" class="session-card">
        <div class="session-card-top">
          <div class="session-thumb"><BookCover :world="session.snapshot.world" /></div>
          <div class="session-card-title">
            <strong>{{ session.title }}</strong>
            <small>{{ session.snapshot.world.name }} · {{ shortDate(session.createdAt) }}</small>
          </div>
          <span :class="['status-pill', session.status === 'draft' ? 'draft' : 'locked']">
            {{ session.status === 'draft' ? '草稿' : '进行中' }}
          </span>
        </div>
        <div class="session-card-card">
          <span>主角 </span>{{ session.snapshot.protagonist.name }} · {{ session.snapshot.protagonist.role || '身份未定' }}
        </div>
        <div class="session-progress"><i :style="{ width: `${Math.min(100, (session.turnCount / 12) * 100)}%` }"></i></div>
        <div class="session-card-foot">
          <span>{{ session.status === 'active' ? `${unitOf(session)} · ${session.turnCount} / 12 轮` : '尚未开始 · 0 / 12 轮' }}</span>
          <span>{{ session.snapshot.protagonist.model }}</span>
        </div>
        <div class="session-card-actions">
          <button v-if="session.status === 'active'" class="primary-btn" type="button" @click="resume(session)">打开</button>
          <button v-else class="primary-btn" type="button" @click="start(session)">开始</button>
          <button class="ghost-btn" type="button" @click="edit(session)">编辑</button>
        </div>
      </div>
    </div>

    <p v-if="sessions.loading" class="empty-inline">正在读取会话…</p>
    <p v-if="sessions.error" class="auth-error">{{ sessions.error }}</p>

    <SessionEditModal
      v-if="editTarget"
      :key="editTarget.id"
      :session="editTarget"
      @close="editTarget = null"
      @save="saveSession"
    />
  </section>
</template>
