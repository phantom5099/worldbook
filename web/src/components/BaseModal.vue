<script setup lang="ts">
defineProps<{ cardClass?: string; labelledBy?: string }>()
defineEmits<{ close: [] }>()
</script>

<template>
  <div class="modal">
    <div class="modal-backdrop" @click="$emit('close')"></div>
    <div :class="['modal-card', cardClass]" role="dialog" aria-modal="true" :aria-labelledby="labelledBy">
      <slot />
    </div>
  </div>
</template>
