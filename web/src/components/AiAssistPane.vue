<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CreateCardInput, CreateWorldInput } from '@/api/types'
import { messageOf } from '@/api/errors'
import { services } from '@/services/services'

type AssistKind = 'world' | 'card'
type Draft = Record<string, string | undefined>

const props = defineProps<{
  kind: AssistKind
  previous?: Draft
}>()

const emit = defineEmits<{
  apply: [draft: Draft]
  close: []
}>()

const WORLD_FIELDS: Array<[string, string]> = [
  ['name', '世界名'],
  ['genre', '类型与基调'],
  ['hook', '一句话内核'],
  ['rules', '世界规则'],
  ['bans', '禁用项'],
]

const CARD_FIELDS: Array<[string, string]> = [
  ['name', '姓名'],
  ['role', '身份 / 位置'],
  ['goal', '公开目标'],
  ['secret', '私有目标'],
  ['traitsText', '核心特质'],
  ['relation', '初始关系'],
]

const fields = computed(() => (props.kind === 'world' ? WORLD_FIELDS : CARD_FIELDS))
const intro = computed(() =>
  props.kind === 'world'
    ? '描述你想要的世界：时代、地点、基调，以及希望出现或避免的元素。'
    : '描述这个角色：身份、想要什么、藏着什么秘密，以及和谁有什么关系。',
)
const placeholder = computed(() =>
  props.kind === 'world'
    ? '例如：一座每天退潮后都会多出一条街的港口城市，航海、悬疑、低魔。'
    : '例如：一个在雾港查失踪案的外乡账房，谨慎、怕冷、算得清。',
)

const history = ref<string[]>([])
const messages = ref<Array<{ role: 'user' | 'assistant'; text: string; draft?: Draft }>>([])
const input = ref('')
const busy = ref(false)
const draft = ref<Draft | null>(null)
const error = ref('')

const canSend = computed(() => Boolean(input.value.trim() && !busy.value))

async function send(): Promise<void> {
  const text = input.value.trim()
  if (!text || busy.value) return
  history.value.push(text)
  messages.value.push({ role: 'user', text })
  input.value = ''
  busy.value = true
  error.value = ''
  try {
    const messagesForApi = history.value.map((item) => ({ role: 'user' as const, text: item }))
    const next =
      props.kind === 'world'
        ? await services.assist.worldDraft(messagesForApi, props.previous as Partial<CreateWorldInput> | undefined)
        : await services.assist.cardDraft(messagesForApi, props.previous as Partial<CreateCardInput> | undefined)
    draft.value = next as unknown as Draft
    messages.value.push({
      role: 'assistant',
      text: '已按你的描述整理出一版草稿，可以直接填入表单，再逐项修改。',
      draft: next as Draft,
    })
  } catch (reason) {
    error.value = messageOf(reason)
  } finally {
    busy.value = false
  }
}

function apply(): void {
  if (!draft.value) return
  emit('apply', { ...draft.value })
}
</script>

<template>
  <div class="ai-assist-pane">
    <div class="card-head ai-assist-head">
      <div>
        <h3>AI 帮忙生成</h3>
        <span>描述需求，生成可编辑的草稿</span>
      </div>
      <button type="button" class="modal-close" aria-label="关闭" @click="$emit('close')">关闭</button>
    </div>

    <div class="ai-assist-log" role="log" aria-live="polite">
      <div class="ai-assist-msg ai">
        <span class="ai-assist-avatar">AI</span>
        <div class="ai-assist-bubble"><p>{{ intro }}</p></div>
      </div>
      <div v-for="(message, index) in messages" :key="index" :class="['ai-assist-msg', message.role === 'user' ? 'user' : 'ai']">
        <span class="ai-assist-avatar">{{ message.role === 'user' ? '你' : 'AI' }}</span>
        <div class="ai-assist-bubble">
          <p>{{ message.text }}</p>
          <div v-if="message.draft" class="ai-assist-params">
            <div v-for="field in fields" :key="field[0]" class="ai-assist-param">
              <template v-if="message.draft?.[field[0]]">
                <span>{{ field[1] }}</span>
                <strong>{{ message.draft[field[0]] }}</strong>
              </template>
            </div>
          </div>
        </div>
      </div>
      <div v-if="busy" class="ai-assist-msg ai">
        <span class="ai-assist-avatar">AI</span>
        <div class="ai-assist-bubble ai-assist-typing"><span>正在整理参数</span><i></i><i></i><i></i></div>
      </div>
    </div>

    <p v-if="error" class="auth-error">{{ error }}</p>

    <div class="ai-assist-compose">
      <textarea
        v-model="input"
        rows="2"
        aria-label="描述你的需求"
        :placeholder="placeholder"
        @keydown.enter.exact.prevent="send"
      ></textarea>
      <button type="button" class="primary-btn ai-assist-send" :disabled="!canSend" @click="send">发送</button>
    </div>
    <p class="ai-assist-note">生成结果是草稿，填入表单后仍可逐项修改；不会自动保存。</p>
    <div class="wizard-actions">
      <button type="button" class="ghost-btn" @click="$emit('close')">返回表单</button>
      <button type="button" class="primary-btn ai-assist-apply" :disabled="!draft" @click="apply">
        填入表单
      </button>
    </div>
  </div>
</template>
