<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import { useRoute, useRouter } from 'vue-router'
import { useUiStore } from '@/stores/ui'

const route = useRoute()
const router = useRouter()
const ui = useUiStore()

const navs: Array<{ key: string; glyph: string; label: string; to: RouteLocationRaw }> = [
  { key: 'sessions', glyph: '话', label: '会话', to: '/sessions' },
  { key: 'worlds', glyph: '界', label: '世界', to: '/worlds' },
  { key: 'cards', glyph: '人', label: '角色', to: '/cards' },
  { key: 'settings', glyph: '商', label: '提供商', to: '/settings' },
]

function active(key: string): boolean {
  return String(route.meta.nav ?? 'sessions') === key
}

function go(to: RouteLocationRaw): void {
  ui.closeDrawers()
  void router.push(to)
}
</script>

<template>
  <nav class="mobile-nav" aria-label="移动端导航">
    <button
      v-for="nav in navs"
      :key="nav.key"
      :class="['mobile-nav-item', { active: active(nav.key) }]"
      @click="go(nav.to)"
    >
      <span>{{ nav.glyph }}</span><small>{{ nav.label }}</small>
    </button>
  </nav>
</template>
