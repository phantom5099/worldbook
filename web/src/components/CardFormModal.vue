<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { Card } from '@/api/types'
import AiAssistPane from './AiAssistPane.vue'
import BaseModal from './BaseModal.vue'

export interface CardFormValue {
  name: string
  role: string
  goal: string
  secret: string
  traitsText: string
  relation: string
  model: string
  fallback: string
}

const props = defineProps<{
  title: string
  lead?: string
  initial?: Partial<Card> | null
  submitLabel?: string
}>()

const emit = defineEmits<{
  close: []
  submit: [value: CardFormValue]
}>()

const form = reactive<CardFormValue>({
  name: props.initial?.name ?? '',
  role: props.initial?.role ?? '',
  goal: props.initial?.goal ?? '',
  secret: props.initial?.secret ?? '',
  traitsText: props.initial?.traitsText ?? '',
  relation: props.initial?.relation ?? '',
  model: props.initial?.model ?? 'A · narrative-x-32k',
  fallback: props.initial?.fallback ?? 'B · novel-z',
})

const assistOpen = ref(false)

function applyDraft(draft: Record<string, string | undefined>): void {
  if (draft.name) form.name = draft.name
  if (draft.role) form.role = draft.role
  if (draft.goal) form.goal = draft.goal
  if (draft.secret) form.secret = draft.secret
  if (draft.traitsText) form.traitsText = draft.traitsText
  if (draft.relation) form.relation = draft.relation
  assistOpen.value = false
}

function submit(): void {
  emit('submit', { ...form })
}
</script>

<template>
  <BaseModal :card-class="'card-form-modal'" @close="$emit('close')">
    <form v-if="!assistOpen" novalidate @submit.prevent="submit">
      <div class="card-head">
        <h3>{{ title }}</h3>
        <button type="button" class="modal-close" aria-label="关闭" @click="$emit('close')">关闭</button>
      </div>
      <p class="modal-lead">{{ lead || '字段将编译为角色运行时，只影响之后的新会话。' }}</p>
      <div class="form-grid">
        <label class="field">
          <span>姓名</span>
          <input v-model="form.name" maxlength="20" placeholder="例如：闻舟" required>
        </label>
        <label class="field">
          <span>身份 / 位置</span>
          <input v-model="form.role" maxlength="40" placeholder="例如：摆渡人 · 落潮渡口">
        </label>
        <label class="field span-2">
          <span>公开目标</span>
          <input v-model="form.goal" maxlength="80" placeholder="其他角色和玩家都能看到的目标。">
        </label>
        <label class="field span-2">
          <span>私有目标（秘密）</span>
          <input v-model="form.secret" maxlength="80" placeholder="只写进角色私有账本，不进入其他角色上下文。">
        </label>
        <label class="field">
          <span>核心特质</span>
          <input v-model="form.traitsText" maxlength="60" placeholder="用顿号分隔，例如：谨慎、记性极好、不轻易承诺">
        </label>
        <label class="field">
          <span>初始关系</span>
          <input v-model="form.relation" maxlength="60" placeholder="例如：对玩家保持警惕">
        </label>
        <label class="field">
          <span>首选模型</span>
          <input v-model="form.model">
        </label>
        <label class="field">
          <span>备选模型</span>
          <input v-model="form.fallback">
        </label>
      </div>
      <div class="wizard-actions">
        <button type="button" class="ghost-btn ai-assist-trigger" @click="assistOpen = true">✦ AI 帮忙生成</button>
        <button type="button" class="ghost-btn" @click="$emit('close')">取消</button>
        <button type="submit" class="primary-btn">{{ submitLabel || '保存角色卡' }}</button>
      </div>
    </form>
    <AiAssistPane
      v-else
      kind="card"
      :previous="{ ...form }"
      @apply="applyDraft"
      @close="assistOpen = false"
    />
  </BaseModal>
</template>
