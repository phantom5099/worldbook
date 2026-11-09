<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { messageOf } from '@/api/errors'
import { useProvidersStore } from '@/stores/providers'
import { useUiStore } from '@/stores/ui'
import BaseModal from '@/components/BaseModal.vue'
import ProviderIcon from '@/components/ProviderIcon.vue'

const providers = useProvidersStore()
const ui = useUiStore()

const modalOpen = ref(false)
const saving = ref(false)
const form = reactive({ id: '', name: '', base: '' })
const errors = reactive({ id: '', name: '', base: '' })

function clearErrors(): void {
  errors.id = ''
  errors.name = ''
  errors.base = ''
}

function openModal(): void {
  form.id = ''
  form.name = ''
  form.base = ''
  clearErrors()
  modalOpen.value = true
}

onMounted(async () => {
  try {
    await providers.load()
  } catch (reason) {
    ui.toast(messageOf(reason))
  }
})

function validate(): boolean {
  clearErrors()
  const id = form.id.trim()
  if (!id) errors.id = '请填写提供商 ID'
  else if (!/^[a-z0-9_-]+$/.test(id)) errors.id = '只能使用小写字母、数字、连字符或下划线'
  else if (providers.providers.some((provider) => provider.id === id)) errors.id = '这个提供商 ID 已被使用'

  if (!form.name.trim()) errors.name = '请填写显示名称'

  const base = form.base.trim()
  if (!base) errors.base = '请填写基础 URL'
  else if (!/^https?:\/\/[^\s]+$/i.test(base)) errors.base = '需要以 http:// 或 https:// 开头'

  return !errors.id && !errors.name && !errors.base
}

async function submit(): Promise<void> {
  if (!validate()) return
  saving.value = true
  try {
    const provider = await providers.create({ id: form.id.trim(), name: form.name.trim(), base: form.base.trim() })
    modalOpen.value = false
    ui.toast(`已连接 ${provider.name}`)
  } catch (reason) {
    ui.toast(messageOf(reason))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="view">
    <div class="page-head provider-page-head">
      <h1>提供商</h1>
    </div>

    <div class="provider-panel">
      <div class="provider-panel-head">
        <h2>已连接的提供商</h2>
        <button type="button" class="primary-btn provider-new" @click="openModal">＋ 新建</button>
      </div>
      <p v-if="providers.loading" class="empty-inline">正在读取提供商…</p>
      <div class="provider-list" aria-label="已连接的提供商">
        <div v-for="provider in providers.providers" :key="provider.id" class="provider-row">
          <span class="provider-icon"><ProviderIcon :icon="provider.icon" /></span>
          <span class="provider-row-main">
            <strong>{{ provider.name }}</strong>
            <small>{{ provider.base }}</small>
          </span>
          <span class="provider-env">{{ provider.custom ? '自定义' : '环境' }}</span>
        </div>
      </div>
    </div>

    <section class="card">
      <div class="card-head"><h3>近期用量</h3><span>按供应商与模型聚合</span></div>
      <div class="usage-grid">
        <div><span>Tokens</span><strong>—</strong></div>
        <div><span>估算费用</span><strong>—</strong></div>
        <div><span>降级</span><strong>0 次</strong></div>
      </div>
      <p class="card-note">用量统计尚未接入后端，接入后按会话聚合。</p>
    </section>

    <section class="card">
      <div class="card-head"><h3>数据去向</h3><span>发送前明确告知</span></div>
      <p class="body-text">你的输入、世界状态摘要与角色上下文将发送至所选供应商。跨境传输按适用法规提示并取得同意。</p>
      <div class="inline-actions">
        <button class="ghost-btn" type="button" @click="ui.toast('已打开供应商清单（原型）')">查看供应商清单</button>
        <button class="ghost-btn danger" type="button" @click="ui.toast('凭据已撤销（原型）')">撤销凭据</button>
      </div>
    </section>

    <section class="card compliance">
      <div class="card-head"><h3>内容标识与安全</h3><span>首屏与设置页常驻</span></div>
      <div class="compliance-row"><span class="ai-chip">AI 生成</span><p>叙事内容由 AI 生成，可能包含不准确或不合预期的内容。</p></div>
      <div class="compliance-row"><span class="status-pill">举报</span><p>举报入口在正文末尾与设置页同时可见，24 小时内处理。</p></div>
    </section>

    <BaseModal v-if="modalOpen" card-class="provider-modal" @close="modalOpen = false">
      <form novalidate @submit.prevent="submit">
        <div class="provider-modal-top">
          <button type="button" class="provider-icon-btn" aria-label="返回" @click="modalOpen = false">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
          <button type="button" class="provider-icon-btn" aria-label="关闭" @click="modalOpen = false">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /></svg>
          </button>
        </div>

        <div class="provider-modal-title">
          <ProviderIcon icon="custom" />
          <h3>自定义提供商</h3>
        </div>
        <p class="provider-modal-desc">
          配置与 OpenAI 兼容的提供商。请查看
          <button type="button" class="doc-link" @click="ui.toast('提供商配置文档（原型）')">提供商配置文档</button>。
        </p>

        <div class="provider-form">
          <label :class="['field', { invalid: errors.id }]">
            <span>提供商 ID</span>
            <input v-model="form.id" autocomplete="off" spellcheck="false" placeholder="myprovider" :aria-invalid="Boolean(errors.id)" @input="errors.id = ''">
            <small class="field-hint">使用小写字母、数字、连字符或下划线</small>
            <small v-if="errors.id" class="field-error">{{ errors.id }}</small>
          </label>
          <label :class="['field', { invalid: errors.name }]">
            <span>显示名称</span>
            <input v-model="form.name" maxlength="40" autocomplete="off" placeholder="我的 AI 提供商" :aria-invalid="Boolean(errors.name)" @input="errors.name = ''">
            <small v-if="errors.name" class="field-error">{{ errors.name }}</small>
          </label>
          <label :class="['field', { invalid: errors.base }]">
            <span>基础 URL</span>
            <input v-model="form.base" type="url" autocomplete="off" spellcheck="false" placeholder="https://api.myprovider.com/v1" :aria-invalid="Boolean(errors.base)" @input="errors.base = ''">
            <small v-if="errors.base" class="field-error">{{ errors.base }}</small>
          </label>
        </div>

        <div class="wizard-actions">
          <button type="button" class="ghost-btn" @click="modalOpen = false">取消</button>
          <button type="submit" class="primary-btn" :disabled="saving">{{ saving ? '连接中…' : '保存并连接' }}</button>
        </div>
      </form>
    </BaseModal>
  </section>
</template>
