<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const sessions = useSessionsStore()
const ui = useUiStore()

const navs = [
  { key: 'sessions', glyph: '话', label: '会话', to: '/sessions' },
  { key: 'worlds', glyph: '界', label: '世界', to: '/worlds' },
  { key: 'cards', glyph: '人', label: '角色', to: '/cards' },
  { key: 'settings', glyph: '商', label: '提供商', to: '/settings' },
]

const currentNav = computed(() => String(route.meta.nav ?? 'sessions'))
const active = computed(() => sessions.active)
const turn = computed(() => sessions.turnCount)
const castCount = computed(() => active.value?.snapshot.cast.length ?? 0)

function go(to: string): void {
  ui.closeDrawers()
  void router.push(to)
}

function logout(): void {
  auth.logout()
  ui.closeDrawers()
  void router.push('/sessions')
}
</script>

<template>
  <aside :class="['rail', { open: ui.railOpen }]" aria-label="主导航">
    <div class="rail-brand">
      <span class="brand-mark">W</span>
      <span class="brand-text">
        <strong>Worldbook</strong>
        <small>文字开放世界</small>
      </span>
    </div>

    <nav class="rail-nav">
      <button
        v-for="nav in navs"
        :key="nav.key"
        :class="['nav-item', { active: currentNav === nav.key }]"
        :aria-current="currentNav === nav.key ? 'page' : undefined"
        @click="go(nav.to)"
      >
        <span class="nav-glyph">{{ nav.glyph }}</span><span>{{ nav.label }}</span>
      </button>
    </nav>

    <div class="rail-spacer"></div>

    <div class="rail-scope">
      <div class="scope-head"><span>本单元范围</span><span>{{ turn }} / 12 轮</span></div>
      <div class="scope-track"><span :style="{ width: `${sessions.progress}%` }"></span></div>
      <p>角色 {{ castCount }} / {{ castCount || 4 }} · 节点 {{ Math.min(24, turn * 2) }} / 24</p>
    </div>

    <div class="rail-account">
      <span class="rail-account-avatar">{{ auth.initial }}</span>
      <span class="rail-account-copy">
        <strong>{{ auth.displayName }}</strong>
        <small>@{{ auth.account?.handle ?? '本地账号' }}</small>
      </span>
      <button type="button" class="rail-logout" @click="logout">退出</button>
    </div>

    <button class="rail-new" @click="go('/entry')">
      <span>＋</span><span>新建会话</span>
    </button>
  </aside>
</template>
