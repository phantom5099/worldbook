<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Card, WorldDetail } from '@/api/types'
import { messageOf } from '@/api/errors'
import { splitList } from '@/api/normalize'
import { useContentStore } from '@/stores/content'
import { useUiStore } from '@/stores/ui'
import AppAvatar from '@/components/AppAvatar.vue'
import CardFormModal, { type CardFormValue } from '@/components/CardFormModal.vue'

const route = useRoute()
const router = useRouter()
const content = useContentStore()
const ui = useUiStore()

const world = ref<WorldDetail | null>(null)
const cards = ref<Card[]>([])
const defaultEditing = ref(false)
const cardCreatorOpen = ref(false)
const editingCard = ref<Card | null>(null)

const defaultCard = computed(() => cards.value.find((card) => card.id === world.value?.defaultCardId) ?? null)
const defaultTraits = computed(() => splitList(defaultCard.value?.traitsText ?? ''))

const defaultForm = reactive({
  name: '',
  role: '',
  goal: '',
  secret: '',
  traitsText: '',
  relation: '',
  model: '',
  fallback: '',
})

async function load(): Promise<void> {
  const id = String(route.params.id ?? '')
  const detail = await content.getWorld(id)
  if (!detail) {
    ui.toast('世界书不存在')
    await router.replace('/worlds')
    return
  }
  world.value = detail
  await content.loadCards({ worldId: id })
  cards.value = content.cards
}

onMounted(async () => {
  try {
    await load()
  } catch (reason) {
    ui.toast(messageOf(reason))
  }
})

function startDefaultEdit(): void {
  const card = defaultCard.value
  if (!card) return
  Object.assign(defaultForm, {
    name: card.name,
    role: card.role,
    goal: card.goal,
    secret: card.secret,
    traitsText: card.traitsText,
    relation: card.relation,
    model: card.model,
    fallback: card.fallback,
  })
  defaultEditing.value = true
}

async function saveDefault(): Promise<void> {
  const card = defaultCard.value
  if (!card) return
  if (!defaultForm.name.trim()) {
    ui.toast('给主角起一个名字')
    return
  }
  try {
    await content.updateCard(card.id, { ...defaultForm })
    await load()
    defaultEditing.value = false
    ui.toast('默认主角卡已更新 · 只影响之后的新会话')
  } catch (reason) {
    ui.toast(messageOf(reason))
  }
}

async function submitCard(value: CardFormValue): Promise<void> {
  if (!world.value) return
  if (!value.name.trim()) {
    ui.toast('给角色起一个名字')
    return
  }
  try {
    if (editingCard.value) {
      await content.updateCard(editingCard.value.id, { ...value })
      ui.toast('角色卡已更新')
    } else {
      await content.createCard({ worldId: world.value.id, ...value })
      ui.toast('角色卡已保存')
    }
    cardCreatorOpen.value = false
    editingCard.value = null
    await load()
  } catch (reason) {
    ui.toast(messageOf(reason))
  }
}

function openEdit(card: Card): void {
  editingCard.value = card
  cardCreatorOpen.value = true
}

async function removeCard(card: Card): Promise<void> {
  if (!window.confirm(`删除角色卡「${card.name}」？`)) return
  try {
    await content.removeCard(card.id)
    await load()
    ui.toast('角色卡已删除')
  } catch (reason) {
    ui.toast(messageOf(reason))
  }
}
</script>

<template>
  <section v-if="world" class="view">
    <button class="back-link" type="button" @click="router.push('/worlds')">← 返回世界书</button>

    <div class="world-detail">
      <div class="world-detail-head">
        <div>
          <h1>{{ world.name }}</h1>
          <p>{{ world.hook }}</p>
        </div>
        <span class="status-pill">{{ world.genre }}</span>
      </div>

      <div class="lore-grid">
        <div class="lore-item"><span>世界规则</span><p>{{ world.rules || '未填写' }}</p></div>
        <div class="lore-item"><span>地理与势力</span><p>{{ world.factions || '未填写' }}</p></div>
        <div class="lore-item"><span>初始矛盾</span><p>{{ world.conflict || '未填写' }}</p></div>
        <div class="lore-item"><span>禁用项</span><p>{{ world.bans || '未填写' }}</p></div>
      </div>

      <div class="world-detail-actions">
        <button class="primary-btn" type="button" @click="router.push(`/entry?world=${world.id}`)">以此新建会话</button>
        <button class="ghost-btn" type="button" @click="defaultEditing ? (defaultEditing = false) : startDefaultEdit()">
          {{ defaultEditing ? '收起默认卡编辑' : '编辑默认主角卡' }}
        </button>
      </div>

      <div v-if="defaultCard" class="default-card-box">
        <div class="default-card-top">
          <AppAvatar :name="defaultCard.name" :avatar="defaultCard.avatar" :avatar-class="defaultCard.avatarClass" />
          <div class="default-card-copy">
            <strong>{{ defaultCard.name }}</strong>
            <small>{{ defaultCard.role }} · 世界默认主角</small>
          </div>
          <span class="status-pill">默认</span>
        </div>
        <p class="default-card-goal"><span>公开目标 · </span>{{ defaultCard.goal || '未填写' }}</p>
        <div class="tag-row">
          <span v-for="trait in defaultTraits" :key="trait" class="chip">{{ trait }}</span>
        </div>
      </div>

      <form v-if="defaultEditing" class="world-default-editor" @submit.prevent="saveDefault">
        <div class="card-head">
          <h3>编辑默认主角卡</h3>
          <span>只影响之后的新会话</span>
        </div>
        <div class="form-grid">
          <label class="field"><span>姓名</span><input v-model="defaultForm.name" maxlength="20"></label>
          <label class="field"><span>身份 / 位置</span><input v-model="defaultForm.role" maxlength="40"></label>
          <label class="field span-2"><span>公开目标</span><input v-model="defaultForm.goal" maxlength="80"></label>
          <label class="field span-2"><span>私有目标（秘密）</span><input v-model="defaultForm.secret" maxlength="80"></label>
          <label class="field"><span>核心特质</span><input v-model="defaultForm.traitsText" maxlength="60"></label>
          <label class="field"><span>初始关系</span><input v-model="defaultForm.relation" maxlength="60"></label>
          <label class="field"><span>首选模型</span><input v-model="defaultForm.model"></label>
          <label class="field"><span>备选模型</span><input v-model="defaultForm.fallback"></label>
        </div>
        <div class="wizard-actions">
          <button type="button" class="ghost-btn" @click="defaultEditing = false">取消</button>
          <button type="submit" class="primary-btn">保存默认卡</button>
        </div>
      </form>
    </div>

    <section class="world-cards">
      <div class="section-head compact">
        <h2>角色卡</h2>
        <div class="inline-actions">
          <button type="button" class="primary-btn" @click="editingCard = null; cardCreatorOpen = true">＋ 新建角色卡</button>
        </div>
      </div>
      <div class="card-grid">
        <div v-for="card in cards" :key="card.id" class="character-card">
          <div class="character-card-top">
            <AppAvatar :name="card.name" :avatar="card.avatar" :avatar-class="card.avatarClass" />
            <div class="character-card-name">
              <strong>{{ card.name }}</strong>
              <small>{{ card.role || '身份未定' }}</small>
            </div>
            <span class="status-pill">{{ card.badge || '模板' }}</span>
          </div>
          <p class="character-card-goal"><span>公开目标 · </span>{{ card.goal || '未填写' }}</p>
          <div class="character-card-model">
            首选 <b>{{ card.model }}</b><br>
            备选 <b>{{ card.fallback }}</b>
          </div>
          <div class="character-card-actions">
            <span>{{ card.initial?.moments?.length ?? 0 }} 个时刻</span>
            <div class="inline-actions">
              <button class="ghost-btn" type="button" @click="openEdit(card)">编辑</button>
              <button class="ghost-btn" type="button" @click="removeCard(card)">删除</button>
            </div>
          </div>
        </div>
        <div v-if="!cards.length" class="empty-inline">这本世界书还没有角色卡。</div>
      </div>
    </section>

    <CardFormModal
      v-if="cardCreatorOpen"
      :key="editingCard?.id ?? 'new'"
      :title="editingCard ? '编辑角色卡' : '新建角色卡'"
      :initial="editingCard"
      @close="cardCreatorOpen = false; editingCard = null"
      @submit="submitCard"
    />
  </section>
</template>
