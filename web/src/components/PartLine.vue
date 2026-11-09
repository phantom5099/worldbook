<script setup lang="ts">
import type { NarrativePart } from '@/api/types'

defineProps<{ part: NarrativePart }>()
</script>

<template>
  <p v-if="part.type === 'speech'" class="speech">
    <span class="speaker">{{ part.speaker }}</span>“{{ part.text }}”
  </p>
  <p v-else>{{ part.text }}</p>
</template>
