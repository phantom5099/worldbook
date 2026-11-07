<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'
import AppAvatar from './AppAvatar.vue'

const router = useRouter()
const sessions = useSessionsStore()
const ui = useUiStore()

const active = computed(() => sessions.active)
const scene = computed(() => sessions.cast.slice(0, 2))
const threads = computed(() => active.value?.snapshot.threads ?? [])
const recent = computed(() => sessions.changes.slice(-2))
const status = computed(() => (sessions.error ? '连接异常' : sessions.streaming ? '生成中' : '正常'))

function go(to: string): void {
  ui.closeDrawers()
  void router.push(to)
}
</script>

<template>
  <aside :class="['context-rail', { open: ui.contextOpen }]" aria-label="当前状态">
    <button class="panel-close" type="button" aria-label="收起状态侧栏" @click="ui.closeDrawers">收起</button>

    <div class="panel">
      <div class="panel-title"><span>在场角色</span><span>{{ scene.length }} 人</span></div>
      <div v-if="!scene.length" class="empty-inline">还没有会话角色。</div>
      <div v-for="card in scene" :key="card.id" class="actor">
        <AppAvatar :name="card.name" :avatar="card.avatar" :avatar-class="card.avatarClass" />
        <div class="actor-body">
          <div class="actor-line">
            <strong>{{ card.name }}</strong>
            <span class="mood">{{ card.badge || '在场' }}</span>
          </div>
          <p>{{ card.goal || card.role }}</p>
          <div class="mini-rel">
            <span>信任</span>
            <div class="mini-track"><i :style="{ width: `${Math.round(card.relations.trust * 100)}%` }"></i></div>
            <b>{{ card.relations.trust.toFixed(2) }}</b>
          </div>
        </div>
      </div>
      <button class="panel-link" @click="go('/cast')">查看本会话角色 →</button>
    </div>

    <div class="panel">
      <div class="panel-title"><span>未闭线程</span><span>{{ threads.length }}</span></div>
      <div v-if="!threads.length" class="empty-inline">还没有线程。</div>
      <div v-for="thread in threads" :key="thread.title" class="thread">
        <span :class="['thread-dot', { new: thread.state === '新', done: thread.state === '已闭合' }]"></span>
        <div>
          <strong>{{ thread.title }}</strong>
          <p>{{ thread.note }}</p>
        </div>
      </div>
      <button class="panel-link" @click="go('/recap')">查看单元复盘 →</button>
    </div>

    <div class="panel">
      <div class="panel-title"><span>最近变化</span><span>本轮</span></div>
      <div v-if="!recent.length" class="empty-inline">本轮暂无变化。</div>
      <div v-for="(change, index) in recent" :key="`${change.who}-${change.label}-${index}`">
        <div class="change-row">
          <span class="change-name">{{ change.who }} · {{ change.label }}</span>
          <span :class="['delta', change.direction]">{{ change.value }}</span>
        </div>
        <p class="change-reason">{{ change.reason }}</p>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title"><span>本轮运行</span><span>{{ status }}</span></div>
      <div class="runtime">
        <div><span>模型</span><strong>{{ active?.snapshot.protagonist.model ?? '—' }}</strong></div>
        <div><span>轮次</span><strong>{{ sessions.turnCount }}</strong></div>
        <div><span>流</span><strong>{{ sessions.connected ? '已连接' : '未连接' }}</strong></div>
        <div><span>降级</span><strong>0 次</strong></div>
      </div>
      <button class="panel-link" @click="go('/sessions')">调整本会话模型 →</button>
    </div>
  </aside>
</template>
