<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { SessionSnapshot } from '@/api/types'
import { messageOf } from '@/api/errors'
import { RELATION_LABELS } from '@/api/normalize'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'
import AppAvatar from '@/components/AppAvatar.vue'
import SessionEditModal from '@/components/SessionEditModal.vue'

const router = useRouter()
const sessions = useSessionsStore()
const ui = useUiStore()

const selectedId = ref('')
const editOpen = ref(false)

const session = computed(() => sessions.active)
const cast = computed(() => sessions.cast)
const selected = computed(() => cast.value.find((card) => card.id === selectedId.value) ?? cast.value[0] ?? null)

watch(
  cast,
  (list) => {
    if (!list.some((card) => card.id === selectedId.value)) selectedId.value = list[0]?.id ?? ''
  },
  { immediate: true },
)

onMounted(async () => {
  if (sessions.sessions.length) return
  try {
    await sessions.load()
  } catch (reason) {
    ui.toast(messageOf(reason))
  }
})

function backToStory(): void {
  if (sessions.activeId) void router.push(`/story/${sessions.activeId}`)
  else void router.push('/sessions')
}

async function denyMoment(index: number): Promise<void> {
  const card = selected.value
  const current = session.value
  if (!card || !current) return
  const moment = card.moments[index]
  if (!moment || moment.denied) return
  const snapshot = JSON.parse(JSON.stringify(current.snapshot)) as SessionSnapshot
  const target = snapshot.cast.find((item) => item.id === card.id)
  const stored = target?.moments[index]
  if (!target || !stored) return
  stored.denied = true
  try {
    await sessions.update(current.id, { snapshot })
    ui.toast('已否定该性格时刻 · 置信度将下调（原型）')
  } catch (reason) {
    ui.toast(messageOf(reason))
  }
}

async function saveModels(patch: { title: string; snapshot: SessionSnapshot }): Promise<void> {
  const current = session.value
  if (!current) return
  try {
    await sessions.update(current.id, patch)
    editOpen.value = false
    ui.toast('会话模型已更新')
  } catch (reason) {
    ui.toast(messageOf(reason))
  }
}
</script>

<template>
  <section class="view">
    <div class="page-head">
      <button class="back-link" type="button" @click="backToStory">← 返回会话</button>
      <h1>在场的人</h1>
      <p>本会话的角色快照。世界角色卡在对应世界书内维护，这里只记录本会话的在场角色、关系与见证。</p>
    </div>

    <div v-if="!session" class="empty-state">
      <strong>还没有打开会话</strong>
      <p>先打开一个进行中的会话，再查看在场角色。</p>
      <button class="primary-btn" type="button" @click="router.push('/sessions')">回到会话列表</button>
    </div>

    <div v-else-if="!cast.length" class="empty-state">
      <strong>当前会话还没有参与角色</strong>
      <p>角色卡决定谁在场、谁掌握秘密、使用哪个模型。至少添加一张后，角色账才会开始记录。</p>
      <button class="primary-btn" type="button" @click="router.push('/worlds')">去创建角色卡</button>
    </div>

    <div v-else class="char-layout">
      <div class="char-list" role="tablist" aria-label="角色列表">
        <button
          v-for="card in cast"
          :key="card.id"
          :class="['char-tab', { active: selected?.id === card.id }]"
          type="button"
          role="tab"
          :aria-selected="selected?.id === card.id"
          @click="selectedId = card.id"
        >
          <AppAvatar :name="card.name" :avatar="card.avatar" :avatar-class="card.avatarClass" />
          <span>
            <strong>{{ card.name }}</strong>
            <small>{{ card.role || '身份未定' }}</small>
          </span>
        </button>
      </div>

      <div v-if="selected" class="char-detail">
        <div class="char-hero">
          <AppAvatar :name="selected.name" :avatar="selected.avatar" :avatar-class="selected.avatarClass" size="lg" />
          <div class="char-hero-text">
            <span class="page-kicker">{{ selected.role }}</span>
            <h2>{{ selected.name }}</h2>
            <p>{{ selected.state || `目标：${selected.goal || '未定'} · 位置：${selected.role}` }}</p>
          </div>
          <span class="status-pill">{{ selected.badge || '在场' }}</span>
        </div>

        <div class="detail-grid">
          <section class="card">
            <div class="card-head"><h3>关系</h3><span>单次变化 ≤ 0.15</span></div>
            <div class="rel-list">
              <div v-for="[key, label] in RELATION_LABELS" :key="key" class="rel-row" :data-rel="key">
                <span>{{ label }}</span>
                <div class="rel-track"><i :style="{ width: `${Math.round(selected.relations[key] * 100)}%` }"></i></div>
                <b>{{ selected.relations[key].toFixed(2) }}</b>
              </div>
            </div>
            <p class="card-note">关系变化必须附事件 id 与叙述理由。</p>
          </section>

          <section class="card">
            <div class="card-head"><h3>模型绑定</h3><span>随角色卡版本化</span></div>
            <div class="binding">
              <div><span>首选</span><strong>{{ selected.model }}</strong></div>
              <div><span>备选</span><strong>{{ selected.fallback }}</strong></div>
            </div>
            <p class="card-note">主模型限流或超时时按备选降级，并在对话中提示。</p>
            <button class="link-btn" type="button" @click="editOpen = true">调整本会话模型 →</button>
          </section>
        </div>

        <section class="card">
          <div class="card-head"><h3>性格三层</h3><span>core 不参与日常更新</span></div>
          <div class="trait-groups">
            <div v-for="group in selected.traits" :key="group.key" :class="['trait-group', group.key]">
              <div class="trait-label">
                <strong>{{ group.label }}</strong><span>{{ group.hint }}</span>
              </div>
              <div class="trait-chips">
                <span v-for="[name, value] in group.items" :key="name" class="chip">
                  {{ name }}<b>{{ Number(value).toFixed(2) }}</b>
                </span>
              </div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h3>最近 3 个性格时刻</h3><span>可否定，否定后置信度下降</span></div>
          <div class="moment-list">
            <div v-for="(moment, index) in selected.moments" :key="`${moment.event}-${index}`" :class="['moment', { denied: moment.denied }]">
              <p class="moment-quote">{{ moment.quote }}</p>
              <p class="moment-meta">{{ moment.meta }}</p>
              <div class="moment-foot">
                <span class="event-id">{{ moment.event }}</span>
                <button class="deny-btn" type="button" :disabled="moment.denied" @click="denyMoment(index)">
                  {{ moment.denied ? '已否定' : '否定' }}
                </button>
              </div>
            </div>
            <div v-if="!selected.moments.length" class="empty-inline">还没有记录到性格时刻。</div>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h3>他知道什么</h3><span>来源 · 见证人 · 秘密标记</span></div>
          <div class="knowledge-list">
            <div v-for="(fact, index) in selected.knowledge" :key="index" class="knowledge">
              <div>
                <p>{{ fact.text }}</p>
                <small>{{ fact.source }}</small>
              </div>
              <span :class="['secret', { open: !fact.secret }]">{{ fact.secret ? '秘密' : '见证' }}</span>
            </div>
            <div v-if="!selected.knowledge.length" class="empty-inline">还没有记录到已知信息。</div>
          </div>
        </section>
      </div>
    </div>

    <SessionEditModal v-if="editOpen && session" :key="session.id" :session="session" @close="editOpen = false" @save="saveModels" />
  </section>
</template>
