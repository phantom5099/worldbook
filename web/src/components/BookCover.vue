<script setup lang="ts">
defineProps<{
  world: { name: string; genre?: string; coverClass: string }
  badge?: string
}>()
</script>

<template>
  <div :class="['book-cover', world.coverClass || 'cover-generic']">
    <span class="book-kicker">世界书</span>
    <span class="book-title">{{ world.name }}</span>
    <span class="book-genre">{{ world.genre }}</span>
    <span class="book-seal">{{ Array.from(world.name)[0] }}</span>
    <span class="book-badge">{{ badge || '世界' }}</span>
  </div>
</template>
