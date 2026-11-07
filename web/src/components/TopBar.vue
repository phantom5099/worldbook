<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'

const route = useRoute()
const router = useRouter()
const sessions = useSessionsStore()
const ui = useUiStore()

const scoped = computed(() => Boolean(route.meta.scoped))
const active = computed(() => sessions.active)
const heads: Record<string, string> = {
  sessions: '会话',
  entry: '新建会话',
  worlds: '世界',
  world: '世界',
  cards: '角色',
  settings: '提供商',
}
const heading = computed(() => heads[String(route.name)] ?? 'Worldbook')

const eyebrow = computed(() => {
  if (!scoped.value) return ''
  if (!active.value) return '世界书 · 会话'
  return `${active.value.snapshot.world.name} · ${active.value.status === 'active' ? '会话' : '草稿'}`
})
const title = computed(() => (scoped.value ? (active.value?.title ?? 'Worldbook') : heading.value))
const progress = computed(() => {
  if (!scoped.value) return '—'
  if (!active.value || active.value.status !== 'active') return '草稿 · 未开始'
  return `${sessions.unitLabel} · ${sessions.turnCount} / 12`
})

function goStory(): void {
  if (active.value) void router.push(`/story/${active.value.id}`)
}
</script>

<template>
  <header class="topbar">
    <button class="icon-btn menu-btn" aria-label="打开导航" @click="ui.toggleRail">
      <span class="hamburger"><i></i><i></i><i></i></span>
    </button>

    <div class="world-id">
      <span class="world-eyebrow">{{ eyebrow }}</span>
      <strong>{{ title }}</strong>
    </div>

    <div class="topbar-actions">
      <span class="unit-progress">{{ progress }}</span>
      <span class="ai-chip">AI 生成</span>
      <button class="icon-btn text-btn" aria-label="继续当前会话" @click="goStory">读</button>
      <button class="icon-btn text-btn" aria-label="调整正文字号" @click="ui.toggleFont">Aa</button>
      <button class="icon-btn text-btn" aria-label="切换状态侧栏" @click="ui.toggleContext">栏</button>
    </div>
  </header>
</template>
