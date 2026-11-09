<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const mode = ref<'login' | 'register'>('login')
const name = ref('')
const handle = ref('')
const password = ref('')
const confirm = ref('')
const localError = ref('')

const registering = computed(() => mode.value === 'register')
const busyLabel = computed(() => (registering.value ? '创建中…' : '验证中…'))
const error = computed(() => localError.value || auth.error)

watch(mode, () => {
  localError.value = ''
  password.value = ''
  confirm.value = ''
})

function switchMode(): void {
  mode.value = registering.value ? 'login' : 'register'
}

function fillDemo(): void {
  mode.value = 'login'
  handle.value = 'admin'
  password.value = '123456'
  localError.value = ''
}

async function submit(): Promise<void> {
  if (auth.busy) return
  localError.value = ''
  if (!handle.value.trim() || /\s/.test(handle.value)) {
    localError.value = '请输入不包含空格的账号'
    return
  }
  if (!password.value) {
    localError.value = '请输入密码'
    return
  }
  if (registering.value) {
    if (handle.value.trim().length < 2) {
      localError.value = '账号至少 2 个字符'
      return
    }
    if (password.value.length < 6) {
      localError.value = '密码至少 6 位'
      return
    }
    if (password.value !== confirm.value) {
      localError.value = '两次输入的密码不一致'
      return
    }
    try {
      await auth.register({ name: name.value, handle: handle.value, password: password.value })
      await router.replace('/sessions')
    } catch {
      // 错误文案由 auth store 提供。
    }
    return
  }
  try {
    await auth.login(handle.value, password.value)
    await router.replace('/sessions')
  } catch {
    // 错误文案由 auth store 提供。
  }
}
</script>

<template>
  <div class="auth-screen">
    <div class="auth-shell">
      <aside class="auth-brand">
        <div class="auth-brand-row">
          <span class="brand-mark">W</span>
          <span class="brand-text">
            <strong>Worldbook</strong>
            <small>文字开放世界</small>
          </span>
        </div>
        <div class="auth-brand-copy">
          <h1>每个账号，<br>有自己的世界。</h1>
          <p>世界书、角色卡与会话按账号隔离，只保存在当前浏览器。</p>
        </div>
        <ul class="auth-points">
          <li><b>世界书</b><span>模板与默认主角卡</span></li>
          <li><b>角色卡</b><span>通用 / 世界 / 会话三层</span></li>
          <li><b>会话</b><span>从世界书生出的进度</span></li>
        </ul>
        <p class="auth-local">本地原型 · 账号与数据仅存储在这台设备的浏览器中</p>
      </aside>

      <section class="auth-panel" aria-labelledby="authTitle">
        <div class="auth-panel-head">
          <h2 id="authTitle">{{ registering ? '创建账号' : '登录' }}</h2>
          <p>{{ registering ? '账号之间的世界书、角色卡与会话互相隔离。' : '回到你的世界书与角色卡。' }}</p>
        </div>
        <form class="auth-form" novalidate @submit.prevent="submit">
          <label v-if="registering" class="field">
            <span>昵称</span>
            <input v-model="name" maxlength="20" autocomplete="nickname" placeholder="例如：闻舟">
          </label>
          <label class="field">
            <span>账号</span>
            <input v-model="handle" maxlength="24" autocomplete="username" placeholder="例如：wenzhou" required>
          </label>
          <label class="field">
            <span>密码</span>
            <input
              v-model="password"
              type="password"
              maxlength="64"
              :autocomplete="registering ? 'new-password' : 'current-password'"
              placeholder="至少 6 位"
              required
            >
          </label>
          <label v-if="registering" class="field">
            <span>确认密码</span>
            <input v-model="confirm" type="password" maxlength="64" autocomplete="new-password" placeholder="再输入一次">
          </label>
          <p v-if="error" class="auth-error">{{ error }}</p>
          <button type="submit" class="primary-btn auth-submit" :disabled="auth.busy">
            {{ auth.busy ? busyLabel : registering ? '创建账号' : '登录' }}
          </button>
        </form>
        <div class="auth-switch">
          <span>{{ registering ? '已经有账号？' : '还没有账号？' }}</span>
          <button type="button" class="auth-link" @click="switchMode">{{ registering ? '去登录' : '创建账号' }}</button>
        </div>
        <p v-if="!registering" class="auth-demo">
          内置演示账号
          <button type="button" class="auth-link" @click="fillDemo">admin / 123456</button>
        </p>
        <p class="auth-note">同一浏览器可退出后切换账号；各账号的自建世界书、角色卡与会话互不可见。</p>
      </section>
    </div>
  </div>
</template>
