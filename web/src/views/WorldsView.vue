<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { CreateWorldInput } from '@/api/types'
import { messageOf } from '@/api/errors'
import { useContentStore } from '@/stores/content'
import { useUiStore } from '@/stores/ui'
import BookCover from '@/components/BookCover.vue'
import WorldCreatorModal from '@/components/WorldCreatorModal.vue'

const router = useRouter()
const content = useContentStore()
const ui = useUiStore()
const creating = ref(false)

onMounted(async () => {
  try {
    await content.loadWorlds()
  } catch (reason) {
    ui.toast(messageOf(reason))
  }
})

async function createWorld(input: CreateWorldInput): Promise<void> {
  if (!input.name.trim()) {
    ui.toast('给世界书起一个名字')
    return
  }
  if (!input.hook.trim()) {
    ui.toast('写下一句话内核')
    return
  }
  try {
    const world = await content.createWorld(input)
    creating.value = false
    ui.toast(`世界书「${world.name}」已保存`)
    await router.push(`/worlds/${world.id}`)
  } catch (reason) {
    ui.toast(messageOf(reason))
  }
}
</script>

<template>
  <section class="view">
    <div class="page-head cards-head">
      <div class="cards-head-copy">
        <h1>世界书</h1>
        <p>一本封面对应一个世界书，只做模板；会话从这里衍生，保留自己的进度与角色快照。</p>
      </div>
      <div class="inline-actions">
        <button class="primary-btn" type="button" @click="creating = true">＋ 新建世界书</button>
      </div>
    </div>

    <div class="book-grid">
      <button
        v-for="world in content.worlds"
        :key="world.id"
        type="button"
        class="book-card"
        @click="router.push(`/worlds/${world.id}`)"
      >
        <BookCover :world="world" />
        <div class="book-meta">
          <span>{{ world.cardCount }} 张角色卡</span>
          <span>{{ world.sessionCount }} 个会话</span>
        </div>
      </button>
      <div v-if="!content.worlds.length && !content.loading" class="empty-inline">
        还没有世界书。新建一本，开始写设定。
      </div>
    </div>

    <WorldCreatorModal v-if="creating" @close="creating = false" @submit="createWorld" />
  </section>
</template>
