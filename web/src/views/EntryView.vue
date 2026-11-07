<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Card, SessionSnapshot, WorldDetail } from '@/api/types'
import { messageOf } from '@/api/errors'
import { newId } from '@/api/ids'
import { toCast, toProtagonist } from '@/api/normalize'
import { useContentStore } from '@/stores/content'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'
import AppAvatar from '@/components/AppAvatar.vue'
import CardFormModal, { type CardFormValue } from '@/components/CardFormModal.vue'
import BaseModal from '@/components/BaseModal.vue'

const route = useRoute()
const router = useRouter()
const content = useContentStore()
const sessions = useSessionsStore()
const ui = useUiStore()

const worldId = ref('')
const world = ref<WorldDetail | null>(null)
const allCards = ref<Card[]>([])
const protagonistKey = ref('default')
const protagonist = ref<Card | null>(null)
const castKeys = ref<string[]>([])
const sessionName = ref('')
const loading = ref(true)
const pickerOpen = ref(false)
const editOpen = ref(false)

const CAST_LIMIT = 6

const worldCards = computed(() => allCards.value.filter((card) => card.worldId === world.value?.id))
const genericCards = computed(() => allCards.value.filter((card) => card.worldId === null))

function blankCard(base: Card | undefined): Card {
  const now = new Date().toISOString()
  return {
    id: newId('card'),
    worldId: world.value?.id ?? null,
    name: '无名来客',
    role: '身份未定',
    goal: '',
    secret: '',
    relation: '对陌生人保持距离',
    traitsText: '谨慎、观察力强',
    avatar: '客',
    avatarClass: 'av-custom',
    model: base?.model ?? 'A · narrative-x-32k',
    fallback: base?.fallback ?? 'B · novel-z',
    badge: '本会话',
    desc: '只存在于本次会话，不会写入主界面「角色」。',
    createdAt: now,
    updatedAt: now,
  }
}

function sourceOf(key: string): Card | undefined {
  if (key === 'default') return worldCards.value.find((card) => card.id === world.value?.defaultCardId)
  if (key.startsWith('world:')) return worldCards.value.find((card) => card.id === key.slice(6))
  if (key.startsWith('generic:')) return genericCards.value.find((card) => card.id === key.slice(8))
  return undefined
}

function cloneCard(card: Card, overrides: Partial<Card> = {}): Card {
  return { ...JSON.parse(JSON.stringify(card)), ...overrides }
}

function pickProtagonist(key: string): void {
  const source = sourceOf(key)
  if (key !== 'custom' && !source) return
  protagonistKey.value = key
  if (key === 'custom') {
    protagonist.value = blankCard(sourceOf('default'))
  } else if (source) {
    const note =
      key === 'default'
        ? `来自《${world.value?.name}》的默认主角；修改只作用于本会话。`
        : key.startsWith('generic:')
          ? `来自通用角色卡「${source.name}」；修改只作用于本会话。`
          : `来自《${world.value?.name}》角色卡「${source.name}」；修改只作用于本会话。`
    protagonist.value = cloneCard(source, { desc: note })
  }
  const excluded = key === 'default' ? world.value?.defaultCardId : key.startsWith('world:') ? key.slice(6) : ''
  castKeys.value = castKeys.value.filter((castKey) => castKey !== key && !(excluded && castKey === `world:${excluded}`))
}

const protagonistOptions = computed(() => {
  const options: Array<{ key: string; tag: string; card: Card; note: string }> = []
  const defaultCard = worldCards.value.find((card) => card.id === world.value?.defaultCardId)
  if (defaultCard) {
    options.push({
      key: 'default',
      tag: '预设主角',
      card: defaultCard,
      note: defaultCard.desc || '这本世界书的默认主角。',
    })
  }
  for (const card of worldCards.value) {
    if (card.id === defaultCard?.id) continue
    options.push({
      key: `world:${card.id}`,
      tag: '本世界角色',
      card,
      note: `来自《${world.value?.name}》的角色卡，可在此会话中作为主角。`,
    })
  }
  for (const card of genericCards.value) {
    options.push({
      key: `generic:${card.id}`,
      tag: '通用角色',
      card,
      note: '来自主界面「角色」，可跨世界复用。',
    })
  }
  options.push({
    key: 'custom',
    tag: '自定义主角',
    card: blankCard(defaultCard),
    note: '从空白开始填写姓名与设定，不写入角色列表。',
  })
  return options
})

const castPool = computed(() => {
  const excluded = protagonistKey.value === 'default'
    ? world.value?.defaultCardId
    : protagonistKey.value.startsWith('world:')
      ? protagonistKey.value.slice(6)
      : ''
  const options = [
    ...worldCards.value.map((card) => ({ key: `world:${card.id}`, card, label: '本世界', source: world.value?.name ?? '' })),
    ...genericCards.value.map((card) => ({ key: `generic:${card.id}`, card, label: '通用', source: '通用角色' })),
  ]
  return options.filter((option) => option.card.id !== excluded && option.key !== protagonistKey.value)
})

const castCards = computed(() =>
  castKeys.value
    .map((key) => castPool.value.find((option) => option.key === key)?.card)
    .filter((card): card is Card => Boolean(card)),
)

onMounted(async () => {
  loading.value = true
  try {
    await content.loadWorlds()
    await content.loadCards()
    allCards.value = content.cards
    const requested = String(route.query.world ?? '')
    const target = content.worlds.find((item) => item.id === requested) ?? content.worlds[0]
    if (target) await selectWorld(target.id)
  } catch (reason) {
    ui.toast(messageOf(reason))
  } finally {
    loading.value = false
  }
})

async function selectWorld(id: string): Promise<void> {
  const detail = await content.getWorld(id)
  if (!detail) return
  worldId.value = id
  world.value = detail
  protagonistKey.value = 'default'
  pickProtagonist('default')
  castKeys.value = worldCards.value
    .filter((card) => card.id !== detail.defaultCardId)
    .slice(0, CAST_LIMIT)
    .map((card) => `world:${card.id}`)
}

function toggleCast(key: string): void {
  const index = castKeys.value.indexOf(key)
  if (index >= 0) {
    castKeys.value.splice(index, 1)
    return
  }
  if (castKeys.value.length >= CAST_LIMIT) {
    ui.toast(`最多选择 ${CAST_LIMIT} 位参与角色`)
    return
  }
  castKeys.value.push(key)
}

function chooseProtagonist(key: string): void {
  pickerOpen.value = false
  pickProtagonist(key)
  if (key === 'custom') editOpen.value = true
}

function applyProtagonist(value: CardFormValue): void {
  if (!protagonist.value) return
  if (!value.name.trim()) {
    ui.toast('给主角起一个名字')
    return
  }
  protagonist.value = {
    ...protagonist.value,
    ...value,
    avatar: protagonist.value.avatar || value.name.trim().slice(0, 1),
  }
  editOpen.value = false
  ui.toast(protagonistKey.value === 'custom' ? '自定义主角已应用到本会话' : '主角副本已更新 · 不写回原卡')
}

function snapshotOf(): SessionSnapshot {
  if (!world.value || !protagonist.value) throw new Error('还没有选择世界书与主角')
  return {
    world: {
      id: world.value.id,
      name: world.value.name,
      coverClass: world.value.coverClass,
      ...(world.value.scene ? { scene: world.value.scene } : {}),
    },
    protagonist: toProtagonist(protagonist.value),
    cast: castCards.value.map((card) => toCast(card)),
    threads: world.value.threads.map((thread) => ({ ...thread })),
    opening: JSON.parse(JSON.stringify(world.value.opening)),
    intents: world.value.intents.map((intent) => ({ ...intent })),
    unit: { ...world.value.unit },
  }
}

async function save(status: 'draft' | 'active'): Promise<void> {
  if (!world.value || !protagonist.value) return
  if (!protagonist.value.name.trim()) {
    ui.toast('给主角起一个名字')
    editOpen.value = true
    return
  }
  if (status === 'active' && !castCards.value.length) {
    ui.toast('至少选择一位参与角色')
    return
  }
  const title = (sessionName.value.trim() || `${world.value.name} · 未命名会话`).slice(0, 40)
  try {
    const session = await sessions.create({ title, status, snapshot: snapshotOf() })
    if (status === 'active') {
      ui.toast(`已开始「${session.title}」`)
      await router.push(`/story/${session.id}`)
    } else {
      ui.toast(`草稿「${session.title}」已保存`)
      await router.push('/sessions')
    }
  } catch (reason) {
    ui.toast(messageOf(reason))
  }
}
</script>

<template>
  <section class="view">
    <div class="page-head">
      <h1>{{ world ? `从《${world.name}》开始` : '从一本世界书开始' }}</h1>
      <p v-if="world">{{ world.hook }} 主角与参与角色都以副本进入本会话，修改不会写回原角色卡。</p>
      <p v-else>世界观只是模板。主角与参与角色都以副本进入本会话，修改不会写回原角色卡。</p>
    </div>

    <p v-if="loading" class="empty-inline">正在读取世界书…</p>

    <template v-if="world">
      <div class="section-head compact"><h2>01 · 选择世界书</h2></div>
      <div class="world-picker" role="radiogroup" aria-label="选择世界书">
        <button
          v-for="item in content.worlds"
          :key="item.id"
          type="button"
          :class="['world-chip', { active: item.id === worldId }]"
          :aria-pressed="item.id === worldId"
          @click="selectWorld(item.id)"
        >
          <span>{{ item.name }}</span><small>{{ item.cardCount }} 角色</small>
        </button>
      </div>

      <div class="world-card">
        <div class="world-card-top">
          <div><h2>{{ world.name }}</h2></div>
          <span class="status-pill">{{ world.genre }}</span>
        </div>
        <div class="tag-row">
          <span v-for="tag in world.tags" :key="tag" class="tag">{{ tag }}</span>
        </div>
        <button class="world-manage" type="button" @click="router.push(`/worlds/${world.id}`)">查看世界书与角色卡 →</button>
      </div>

      <div class="section-head"><h2>02 · 命名会话</h2></div>
      <label class="field entry-field">
        <span>会话名</span>
        <input v-model="sessionName" type="text" maxlength="40" :placeholder="`例如：${world.unit.title}`">
      </label>

      <div class="section-head">
        <h2>03 · 主角选择</h2>
        <span>内容可编辑 · 仅作用于本会话</span>
      </div>
      <p class="entry-section-lead">直接选择一张角色卡，或从空白开始自定义主角。修改只保存在本次会话，不会写回原角色卡。</p>

      <div v-if="protagonist" class="protagonist-current">
        <div class="protagonist-current-card">
          <AppAvatar :name="protagonist.name" :avatar="protagonist.avatar" :avatar-class="protagonist.avatarClass" />
          <div class="protagonist-current-copy">
            <span class="proto-tag">{{ protagonistOptions.find((option) => option.key === protagonistKey)?.tag }}</span>
            <strong>{{ protagonist.name }}</strong>
            <span class="proto-role">{{ protagonist.role || '身份未定' }}</span>
            <p class="proto-desc">{{ protagonist.desc }}</p>
          </div>
          <div class="protagonist-current-actions">
            <button class="ghost-btn" type="button" @click="editOpen = true">编辑</button>
            <button class="ghost-btn pick-btn" type="button" @click="pickerOpen = true">选择</button>
          </div>
        </div>
      </div>

      <div class="fact-panel">
        <div class="section-head compact">
          <h2>世界给主角的三个事实</h2>
          <span>{{ protagonist?.name }} · 三条事实带入本会话</span>
        </div>
        <div class="fact-list">
          <div v-for="(fact, index) in world.facts ?? []" :key="fact" class="fact">
            <span class="fact-num">事实 0{{ index + 1 }}</span>
            <p>{{ fact }}</p>
          </div>
        </div>
      </div>

      <div class="section-head">
        <h2>04 · 参与角色</h2>
        <span :class="['entry-cast-count', { full: castKeys.length >= CAST_LIMIT }]">{{ castKeys.length }} / {{ CAST_LIMIT }}</span>
      </div>
      <p class="entry-section-lead">本世界角色默认在场，也可以加入通用角色卡。最多选择 {{ CAST_LIMIT }} 位参与角色。</p>
      <div class="entry-cast-grid">
        <div v-if="!castPool.length" class="empty-inline entry-cast-empty">
          没有可加入的其他角色。可以先在世界书或主界面「角色」中创建。
        </div>
        <button
          v-for="option in castPool"
          :key="option.key"
          type="button"
          :class="['cast-card', { active: castKeys.includes(option.key) }]"
          :aria-pressed="castKeys.includes(option.key)"
          @click="toggleCast(option.key)"
        >
          <AppAvatar :name="option.card.name" :avatar="option.card.avatar" :avatar-class="option.card.avatarClass" />
          <span class="cast-copy">
            <strong>{{ option.card.name }}</strong>
            <small>{{ option.card.role || '身份未定' }} · {{ option.label === '通用' ? '通用角色' : option.source }}</small>
          </span>
          <span class="cast-check"></span>
        </button>
      </div>

      <div class="entry-foot">
        <div class="entry-actions">
          <button class="ghost-btn" type="button" @click="router.push('/sessions')">取消</button>
          <button class="ghost-btn" type="button" @click="save('draft')">保存草稿</button>
          <button class="primary-btn" type="button" @click="save('active')">开始会话 →</button>
        </div>
      </div>
    </template>

    <BaseModal v-if="pickerOpen" card-class="protagonist-picker" @close="pickerOpen = false">
      <div class="card-head">
        <h3>选择主角卡</h3>
        <button type="button" class="modal-close" aria-label="关闭" @click="pickerOpen = false">关闭</button>
      </div>
      <p class="modal-lead">选择一张角色卡作为本会话主角，也可以从空白开始自定义。修改只作用于本会话。</p>
      <div class="protagonist-picker-list">
        <button
          v-for="option in protagonistOptions"
          :key="option.key"
          type="button"
          :class="['protagonist-pick-row', { active: option.key === protagonistKey }]"
          :aria-pressed="option.key === protagonistKey"
          @click="chooseProtagonist(option.key)"
        >
          <AppAvatar :name="option.card.name" :avatar="option.card.avatar" :avatar-class="option.card.avatarClass" />
          <span class="pick-copy">
            <span class="proto-tag">{{ option.tag }}</span>
            <strong>{{ option.card.name }}</strong>
            <span class="proto-role">{{ option.card.role || '身份未定' }}</span>
            <span class="pick-note">{{ option.note }}</span>
          </span>
          <span class="pick-mark">{{ option.key === protagonistKey ? '已选择' : '选择' }}</span>
        </button>
      </div>
    </BaseModal>

    <CardFormModal
      v-if="editOpen && protagonist"
      :key="`${protagonistKey}-${protagonist.id}`"
      :title="protagonistKey === 'custom' ? '自定义主角' : '编辑主角副本'"
      :lead="protagonistKey === 'custom' ? '填写的主角资料只用于本次会话，不会写入主界面「角色」。' : '只修改本会话使用的主角副本，不会写回原角色卡。'"
      :initial="protagonist"
      submit-label="应用到本会话"
      @close="editOpen = false"
      @submit="applyProtagonist"
    />
  </section>
</template>
