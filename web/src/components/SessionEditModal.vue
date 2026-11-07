<script setup lang="ts">
import { ref } from 'vue'
import type { SessionSnapshot, SessionSummary } from '@/api/types'
import AppAvatar from './AppAvatar.vue'
import BaseModal from './BaseModal.vue'

const props = defineProps<{ session: SessionSummary }>()

const emit = defineEmits<{
  close: []
  save: [patch: { title: string; snapshot: SessionSnapshot }]
}>()

const title = ref(props.session.title)
const protagonist = ref({
  model: props.session.snapshot.protagonist.model,
  fallback: props.session.snapshot.protagonist.fallback,
})
const castModels = ref(
  props.session.snapshot.cast.map((card) => ({
    id: card.id,
    name: card.name,
    role: card.role,
    avatar: card.avatar,
    avatarClass: card.avatarClass,
    model: card.model,
    fallback: card.fallback,
  })),
)

function save(): void {
  const snapshot = JSON.parse(JSON.stringify(props.session.snapshot)) as SessionSnapshot
  snapshot.protagonist.model = protagonist.value.model.trim() || snapshot.protagonist.model
  snapshot.protagonist.fallback = protagonist.value.fallback.trim() || snapshot.protagonist.fallback
  for (const entry of castModels.value) {
    const card = snapshot.cast.find((item) => item.id === entry.id)
    if (!card) continue
    card.model = entry.model.trim() || card.model
    card.fallback = entry.fallback.trim() || card.fallback
  }
  emit('save', { title: title.value, snapshot })
}
</script>

<template>
  <BaseModal card-class="session-edit-modal" @close="$emit('close')">
    <form novalidate @submit.prevent="save">
      <div class="card-head">
        <h3>编辑会话</h3>
        <button type="button" class="modal-close" aria-label="关闭" @click="$emit('close')">关闭</button>
      </div>
      <p class="modal-lead">{{ session.title }} · 世界书、主角与参与角色内容锁定，仅可调整模型。</p>
      <div class="form-grid">
        <label class="field">
          <span>会话名</span>
          <input v-model="title" maxlength="40" required>
        </label>
        <div class="field">
          <span>世界书<em>不可更改</em></span>
          <div class="field-locked">{{ session.snapshot.world.name }}</div>
        </div>
      </div>

      <div class="section-head compact session-edit-section">
        <h3>主角</h3>
        <span>内容锁定 · 可调整模型</span>
      </div>
      <div class="model-edit-list">
        <div class="model-edit-row">
          <div class="model-edit-name">
            <AppAvatar
              :name="session.snapshot.protagonist.name"
              :avatar="session.snapshot.protagonist.avatar"
              :avatar-class="session.snapshot.protagonist.avatarClass"
            />
            <div>
              <strong>{{ session.snapshot.protagonist.name }}</strong>
              <small>主角</small>
            </div>
          </div>
          <input v-model="protagonist.model" aria-label="主角首选模型">
          <input v-model="protagonist.fallback" aria-label="主角备选模型">
        </div>
      </div>

      <div class="section-head compact session-edit-section">
        <h3>参与角色</h3>
        <span>{{ castModels.length }} 位 · 可调整模型</span>
      </div>
      <div v-if="!castModels.length" class="empty-inline session-edit-empty">
        这个会话暂时没有参与角色，保存后仍不会包含其他角色。
      </div>
      <div v-else class="model-edit-list">
        <div v-for="card in castModels" :key="card.id" class="model-edit-row">
          <div class="model-edit-name">
            <AppAvatar :name="card.name" :avatar="card.avatar" :avatar-class="card.avatarClass" />
            <div>
              <strong>{{ card.name }}</strong>
              <small>参与角色</small>
            </div>
          </div>
          <input v-model="card.model" :aria-label="`${card.name} 首选模型`">
          <input v-model="card.fallback" :aria-label="`${card.name} 备选模型`">
        </div>
      </div>

      <div class="wizard-actions">
        <button type="button" class="ghost-btn" @click="$emit('close')">取消</button>
        <button type="submit" class="primary-btn">保存</button>
      </div>
    </form>
  </BaseModal>
</template>
