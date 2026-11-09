<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import ContextRail from './ContextRail.vue'
import MobileNav from './MobileNav.vue'
import RailNav from './RailNav.vue'
import ToastHost from './ToastHost.vue'
import TopBar from './TopBar.vue'

const route = useRoute()
const ui = useUiStore()

const scrim = computed(() => ui.railOpen || ui.contextOpen)

watch(
  () => route.fullPath,
  () => ui.closeDrawers(),
)
</script>

<template>
  <div class="app">
    <RailNav />
    <div class="main">
      <TopBar />
      <div class="viewport">
        <main class="content">
          <RouterView />
        </main>
        <ContextRail />
      </div>
    </div>
    <MobileNav />
    <div :class="['scrim', { show: scrim }]" @click="ui.closeDrawers"></div>
    <ToastHost />
  </div>
</template>
