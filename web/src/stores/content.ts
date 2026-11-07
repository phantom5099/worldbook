import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Card, CreateCardInput, CreateWorldInput, WorldDetail, WorldSummary } from '@/api/types'
import { messageOf } from '@/api/errors'
import type { CardPatch } from '@/repositories/types'
import { services } from '@/services/services'

export const useContentStore = defineStore('content', () => {
  const worlds = ref<WorldSummary[]>([])
  const cards = ref<Card[]>([])
  const loading = ref(false)
  const error = ref('')

  async function loadWorlds(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      worlds.value = await services.worlds.list()
    } catch (reason) {
      error.value = messageOf(reason)
      throw reason
    } finally {
      loading.value = false
    }
  }

  async function getWorld(id: string): Promise<WorldDetail | undefined> {
    return services.worlds.get(id)
  }

  async function createWorld(input: CreateWorldInput): Promise<WorldDetail> {
    const world = await services.worlds.create(input)
    await loadWorlds()
    return world
  }

  async function updateWorld(id: string, patch: Partial<CreateWorldInput>): Promise<WorldDetail> {
    const world = await services.worlds.update(id, patch)
    await loadWorlds()
    return world
  }

  async function removeWorld(id: string): Promise<void> {
    await services.worlds.remove(id)
    await loadWorlds()
  }

  async function loadCards(filter?: { worldId?: string | null }): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      cards.value = await services.cards.list(filter)
    } catch (reason) {
      error.value = messageOf(reason)
      throw reason
    } finally {
      loading.value = false
    }
  }

  async function createCard(input: CreateCardInput): Promise<Card> {
    const card = await services.cards.create(input)
    await loadCards()
    return card
  }

  async function updateCard(id: string, patch: CardPatch): Promise<Card> {
    const card = await services.cards.update(id, patch)
    await loadCards()
    return card
  }

  async function removeCard(id: string): Promise<void> {
    await services.cards.remove(id)
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
