<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  name: string
  avatar?: string
  avatarClass?: string
  size?: 'lg'
}>()

const label = computed(() => props.avatar || Array.from(props.name || '?')[0] || '?')
const className = computed(() => ['avatar', props.avatarClass || 'av-custom', props.size === 'lg' ? 'avatar-lg' : ''])
</script>

<template>
  <span :class="className">{{ label }}</span>
</template>
