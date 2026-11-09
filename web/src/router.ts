import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  { path: '/', redirect: '/sessions' },
  {
    path: '/sessions',
    name: 'sessions',
    component: () => import('@/views/SessionsView.vue'),
    meta: { nav: 'sessions' },
  },
  {
    path: '/story/:id?',
    name: 'story',
    component: () => import('@/views/StoryView.vue'),
    meta: { nav: 'sessions', scoped: true },
  },
  {
    path: '/entry',
    name: 'entry',
    component: () => import('@/views/EntryView.vue'),
    meta: { nav: 'sessions' },
  },
  {
    path: '/worlds',
    name: 'worlds',
    component: () => import('@/views/WorldsView.vue'),
    meta: { nav: 'worlds' },
  },
  {
    path: '/worlds/:id',
    name: 'world',
    component: () => import('@/views/WorldDetailView.vue'),
    meta: { nav: 'worlds' },
  },
  {
    path: '/cards',
    name: 'cards',
    component: () => import('@/views/CardsView.vue'),
    meta: { nav: 'cards' },
  },
  {
    path: '/cast',
    name: 'cast',
    component: () => import('@/views/CastView.vue'),
    meta: { nav: 'sessions', scoped: true },
  },
  {
    path: '/recap',
    name: 'recap',
    component: () => import('@/views/RecapView.vue'),
    meta: { nav: 'sessions', scoped: true },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { nav: 'settings' },
  },
  { path: '/:pathMatch(.*)*', redirect: '/sessions' },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach(async () => {
  const auth = useAuthStore()
  await auth.init()
  return true
})
