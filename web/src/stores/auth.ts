import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Account } from '@/api/types'
import { messageOf } from '@/api/errors'
import { api } from '@/api/endpoints'

export const useAuthStore = defineStore('auth', () => {
  const account = ref<Account | null>(null)
  const ready = ref(false)
  const busy = ref(false)
  const error = ref('')

  const signedIn = computed(() => account.value !== null)
  const displayName = computed(() => account.value?.name ?? '未登录')
  const initial = computed(() => Array.from(displayName.value)[0] ?? '—')

  async function init(): Promise<void> {
    if (ready.value) return
    account.value = await api.auth.restore()
    ready.value = true
  }

  async function login(handle: string, password: string): Promise<void> {
    busy.value = true
    error.value = ''
    try {
      account.value = await api.auth.login(handle, password)
    } catch (reason) {
      error.value = messageOf(reason)
      throw reason
    } finally {
      busy.value = false
    }
  }

  async function register(input: { name: string; handle: string; password: string }): Promise<void> {
    busy.value = true
    error.value = ''
    try {
      account.value = await api.auth.register(input)
    } catch (reason) {
      error.value = messageOf(reason)
      throw reason
    } finally {
      busy.value = false
    }
  }

  async function logout(): Promise<void> {
    await api.auth.logout()
    account.value = null
    error.value = ''
  }

  return { account, ready, busy, error, signedIn, displayName, initial, init, login, register, logout }
})
