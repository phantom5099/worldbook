<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { CreateWorldInput } from '@/api/types'
import AiAssistPane from './AiAssistPane.vue'
import BaseModal from './BaseModal.vue'

const emit = defineEmits<{
  close: []
  submit: [input: CreateWorldInput]
}>()

const form = reactive({
  name: '',
  genre: '',
  hook: '',
  rules: '',
  bans: '',
})

const assistOpen = ref(false)

function applyDraft(draft: Record<string, string | undefined>): void {
  form.name = draft.name ?? form.name
  form.genre = draft.genre ?? form.genre
  form.hook = draft.hook ?? form.hook
  form.rules = draft.rules ?? form.rules
  form.bans = draft.bans ?? form.bans
  assistOpen.value = false
}

function submit(): void {
  emit('submit', {
    name: form.name,
    genre: form.genre,
    hook: form.hook,
    rules: form.rules,
    bans: form.bans,
  })
}
</script>

<template>
  <BaseModal @close="$emit('close')">
    <form v-if="!assistOpen" novalidate @submit.prevent="submit">
      <div class="card-head">
        <h3>新建世界书</h3>
        <button type="button" class="modal-close" aria-label="关闭" @click="$emit('close')">关闭</button>
      </div>
      <div class="form-grid">
        <label class="field">
          <span>世界名</span>
          <input v-model="form.name" maxlength="24" placeholder="例如：落潮城" required>
        </label>
        <label class="field">
          <span>类型与基调</span>
          <input v-model="form.genre" maxlength="30" placeholder="例如：航海 · 悬疑 · 低魔">
        </label>
        <label class="field span-2">
          <span>一句话内核</span>
          <input v-model="form.hook" maxlength="90" placeholder="例如：一座每天退潮后都会多出一条街的港口城市。" required>
        </label>
        <label class="field span-2">
          <span>世界规则</span>
          <textarea v-model="form.rules" rows="3" placeholder="什么可能，什么不可能；力量、技术或超自然的边界。"></textarea>
        </label>
        <label class="field span-2">
          <span>禁用项</span>
          <input v-model="form.bans" placeholder="例如：不出现真实宗教，不写未成年人恋爱。">
        </label>
      </div>
      <div class="wizard-actions">
        <button type="button" class="ghost-btn ai-assist-trigger" @click="assistOpen = true">✦ AI 帮忙生成</button>
        <button type="button" class="ghost-btn" @click="$emit('close')">取消</button>
        <button type="submit" class="primary-btn">保存世界</button>
      </div>
    </form>
    <AiAssistPane
      v-else
      kind="world"
      :previous="{ ...form }"
      @apply="applyDraft"
      @close="assistOpen = false"
    />
  </BaseModal>
</template>
