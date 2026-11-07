<script setup lang="ts">
import type { StateNote } from '@/api/types'

defineProps<{ note: StateNote }>()
</script>

<template>
  <div class="state-note">
    <span class="state-mark">◈</span>
    <div>
      <strong>{{ note.who }}</strong> 对你的印象：<em>{{ note.impression }}</em>
      <span
        v-for="delta in note.deltas"
        :key="`${delta[0]}-${delta[1]}`"
        :class="['delta', delta[2]]"
      >
        {{ delta[0] }} {{ delta[1] }}
      </span>
    </div>
  </div>
</template>
