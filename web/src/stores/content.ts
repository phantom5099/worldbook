import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Card, CreateCardInput, CreateWorldInput, WorldDetail, WorldSummary } from '@/api/types'
import { messageOf } from '@/api/errors'
import type { CardPatch } from '@/api/endpoints/types'
import { api } from '@/api/endpoints'

export const useContentStore = defineStore('content', () => {
  const worlds = ref<WorldSummary[]>([])
  const cards = ref<Card[]>([])
  const loading = ref(false)
  const error = ref('')

  async function loadWorlds(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      worlds.value = await api.worlds.list()
    } catch (reason) {
      error.value = messageOf(reason)
      throw reason
    } finally {
      loading.value = false
    }
  }

  async function getWorld(id: string): Promise<WorldDetail | undefined> {
    return api.worlds.get(id)
  }

  async function createWorld(input: CreateWorldInput): Promise<WorldDetail> {
    const world = await api.worlds.create(input)
    await loadWorlds()
    return world
  }

  async function updateWorld(id: string, patch: Partial<CreateWorldInput>): Promise<WorldDetail> {
    const world = await api.worlds.update(id, patch)
    await loadWorlds()
    return world
  }

  async function removeWorld(id: string): Promise<void> {
    await api.worlds.remove(id)
    await loadWorlds()
  }

  async function loadCards(filter?: { worldId?: string | null }): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      cards.value = await api.cards.list(filter)
    } catch (reason) {
      error.value = messageOf(reason)
      throw reason
    } finally {
      loading.value = false
    }
  }

  async function createCard(input: CreateCardInput): Promise<Card> {
    const card = await api.cards.create(input)
    await loadCards()
    return card
  }

  async function updateCard(id: string, patch: CardPatch): Promise<Card> {
    const card = await api.cards.update(id, patch)
    await loadCards()
    return card
  }

  async function removeCard(id: string): Promise<void> {
    await api.cards.remove(id)
    await loadCards()
  }

  return {
    worlds,
    cards,
    loading,
    error,
    loadWorlds,
    getWorld,
    createWorld,
    updateWorld,
    removeWorld,
    loadCards,
    createCard,
    updateCard,
    removeCard,
  }
})
