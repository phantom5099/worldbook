<script setup lang="ts">
defineProps<{ icon: string }>()
</script>

<template>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <template v-if="icon === 'deepseek'">
      <path d="M4 12.3c2.6-3.8 6.9-5.5 10.4-4.1 2.4 1 4.1 2.9 5.6 4.8-2.3-.2-4.1.9-5.5 2.7-1.4 1.9-3.5 3-5.8 2.9-2.7-.1-4.9-1.9-5.4-4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M4 12.3c.2 2.2-1 3.6-2 4.6 2.6.4 4.4-.7 5.2-2.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="9.4" cy="11.7" r=".9" fill="currentColor" />
    </template>
    <template v-else-if="icon === 'minimax'">
      <path d="M12 3.5l1.9 5.3 5.3 1.9-5.3 1.9L12 17.9l-1.9-5.3L4.8 10.7l5.3-1.9L12 3.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M18.6 16l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" fill="currentColor" />
    </template>
    <template v-else-if="icon === 'qiniu'">
      <path d="M12 3.8 20 8l-8 4.2L4 8l8-4.2Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M4 12l8 4.2 8-4.2M4 16.1l8 4.2 8-4.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </template>
    <template v-else-if="icon === 'modelscope'">
      <path d="M12 3 20 7.2v9.6L12 21 4 16.8V7.2L12 3Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M8.3 12h7.4M12 8.3v7.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </template>
    <template v-else>
      <path d="M12 4v16M4 12h16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".45" />
    </template>
  </svg>
</template>
