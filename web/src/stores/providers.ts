import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Provider } from '@/api/types'
import { messageOf } from '@/api/errors'
import { api } from '@/api/endpoints'

export const useProvidersStore = defineStore('providers', () => {
  const providers = ref<Provider[]>([])
  const loading = ref(false)
  const error = ref('')

  async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      providers.value = await api.providers.list()
    } catch (reason) {
      error.value = messageOf(reason)
      throw reason
    } finally {
      loading.value = false
    }
  }

  async function create(input: { id: string; name: string; base: string }): Promise<Provider> {
    const provider = await api.providers.create(input)
    await load()
    return provider
  }

  return { providers, loading, error, load, create }
})
