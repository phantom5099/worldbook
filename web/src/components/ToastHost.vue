<script setup lang="ts">
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
</script>

<template>
  <div :class="['toast', { show: Boolean(ui.toastText) }]" role="status" aria-live="polite">
    {{ ui.toastText }}
  </div>
</template>
