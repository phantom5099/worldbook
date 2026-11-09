<script setup lang="ts">
import { onMounted, watchEffect } from 'vue'
import AppShell from './components/AppShell.vue'
import LoginView from './views/LoginView.vue'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()

onMounted(() => {
  void auth.init()
})

watchEffect(() => {
  document.body.classList.toggle('auth-locked', !auth.signedIn)
})
</script>

<template>
  <LoginView v-if="!auth.ready || !auth.signedIn" />
  <AppShell v-else />
</template>
