<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { Card, CreateCardInput } from '@/api/types'
import { messageOf } from '@/api/errors'
import { splitList } from '@/api/normalize'
import { useContentStore } from '@/stores/content'
import { useUiStore } from '@/stores/ui'
import AppAvatar from '@/components/AppAvatar.vue'
import CardFormModal, { type CardFormValue } from '@/components/CardFormModal.vue'

const content = useContentStore()
const ui = useUiStore()

const cards = ref<Card[]>([])
const loading = ref(true)
const creatorOpen = ref(false)
const editing = ref<Card | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

async function load(): Promise<void> {
  await content.loadCards({ worldId: null })
  cards.value = content.cards
}

onMounted(async () => {
  loading.value = true
  try {
    await load()
  } catch (reason) {
    ui.toast(messageOf(reason))
  } finally {
    loading.value = false
  }
})

function openCreate(): void {
  editing.value = null
  creatorOpen.value = true
}

function openEdit(card: Card): void {
  editing.value = card
  creatorOpen.value = true
}

async function submit(value: CardFormValue): Promise<void> {
  if (!value.name.trim()) {
    ui.toast('给角色起一个名字')
    return
  }
  try {
    if (editing.value) {
      await content.updateCard(editing.value.id, { ...value })
      ui.toast(`通用角色卡「${value.name}」已更新`)
    } else {
      await content.createCard({ worldId: null, ...value })
      ui.toast(`通用角色卡「${value.name}」已保存`)
    }
    creatorOpen.value = false
    editing.value = null
    await load()
  } catch (reason) {
    ui.toast(messageOf(reason))
  }
}

async function remove(card: Card): Promise<void> {
  if (!window.confirm(`删除通用角色卡「${card.name}」？`)) return
  try {
    await content.removeCard(card.id)
    await load()
    ui.toast(`已删除通用角色卡「${card.name}」`)
  } catch (reason) {
    ui.toast(messageOf(reason))
  }
}

interface ImportedCard {
  name?: unknown
  role?: unknown
  goal?: unknown
  secret?: unknown
  traits?: unknown
  traitsText?: unknown
  relation?: unknown
  model?: unknown
  fallback?: unknown
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function importInputOf(item: ImportedCard): CreateCardInput | null {
  const name = textOf(item.name)
  if (!name) return null
  const traits = Array.isArray(item.traits)
    ? item.traits.map(textOf).filter(Boolean).join('、')
    : textOf(item.traitsText)
  return {
    worldId: null,
    name,
    role: textOf(item.role),
    goal: textOf(item.goal),
    secret: textOf(item.secret),
    traitsText: traits,
    relation: textOf(item.relation),
    model: textOf(item.model) || undefined,
    fallback: textOf(item.fallback) || undefined,
    badge: '通用',
    desc: '不属于任何世界，可在新建会话时选为主角原型。',
  }
}

async function onImport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const parsed: unknown = JSON.parse(await file.text())
    const list = Array.isArray(parsed) ? parsed : [parsed]
    let added = 0
    for (const item of list as ImportedCard[]) {
      if (!item || typeof item !== 'object') continue
      const card = importInputOf(item)
      if (!card) continue
      await content.createCard(card)
      added += 1
    }
    if (!added) {
      ui.toast('没有找到带 name 的角色卡')
      return
    }
    await load()
    ui.toast(`已导入 ${added} 张通用角色卡`)
  } catch {
    ui.toast('JSON 解析失败，请检查格式')
  } finally {
    input.value = ''
  }
}
</script>

<template>
  <section class="view">
    <div class="page-head cards-head">
      <div class="cards-head-copy">
        <h1>不依附世界的角色</h1>
        <p>通用角色卡不属于任何世界书，可在新建会话时选为主角原型。世界角色卡在对应世界书内管理，会话角色卡在打开会话后管理。</p>
      </div>
      <div class="inline-actions">
        <button type="button" class="ghost-btn" @click="fileInput?.click()">导入 JSON</button>
        <button type="button" class="primary-btn" @click="openCreate">＋ 新建角色卡</button>
      </div>
    </div>
    <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="onImport">

    <p v-if="loading" class="empty-inline">正在读取角色卡…</p>

    <div class="card-grid">
      <article v-for="card in cards" :key="card.id" class="character-card">
        <div class="character-card-top">
          <AppAvatar :name="card.name" :avatar="card.avatar" :avatar-class="card.avatarClass" />
          <div class="character-card-name">
            <strong>{{ card.name }}</strong>
            <small>{{ card.role || '身份未定' }}</small>
          </div>
          <span class="status-pill">{{ card.badge || '通用' }}</span>
        </div>
        <p class="character-card-goal"><span>公开目标 · </span>{{ card.goal || '未填写' }}</p>
        <div class="character-card-model">
          首选 <b>{{ card.model }}</b><br>
          备选 <b>{{ card.fallback }}</b>
        </div>
        <div class="character-card-actions">
          <span>{{ splitList(card.traitsText).join(' · ') || '未填写特质' }}</span>
          <div class="inline-actions">
            <button class="ghost-btn" type="button" @click="openEdit(card)">编辑</button>
            <button class="ghost-btn" type="button" @click="remove(card)">删除</button>
          </div>
        </div>
      </article>
    </div>
    <div v-if="!loading && !cards.length" class="empty-inline">还没有通用角色卡。新建一张后，可在任意世界的新会话里选为主角。</div>

    <CardFormModal
      v-if="creatorOpen"
      :key="editing?.id ?? 'new'"
      :title="editing ? '编辑角色卡' : '新建角色卡'"
      lead="主界面通用角色卡，不属于任何世界。"
      :initial="editing"
      submit-label="保存通用角色卡"
      @close="creatorOpen = false; editing = null"
      @submit="submit"
    />
  </section>
</template>
