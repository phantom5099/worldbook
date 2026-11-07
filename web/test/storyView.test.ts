import { beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('@/services/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/services')>()
  const { MemoryStorage, MockStore } = await import('@/mocks/store')
  const { MockSessionTransport } = await import('@/mocks/transport')
  const store = new MockStore(new MemoryStorage())
  const transport = new MockSessionTransport(store, { delayMs: 1 })
  return { ...actual, services: actual.createServices({ store, transport }) }
})

import StoryView from '@/views/StoryView.vue'
import { useSessionsStore } from '@/stores/sessions'
import { services } from '@/services/services'
import type { MockSessionTransport } from '@/mocks/transport'

const pinia = createPinia()
setActivePinia(pinia)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/story/:id?', name: 'story', component: StoryView },
    { path: '/sessions', name: 'sessions', component: { template: '<div />' } },
    { path: '/entry', name: 'entry', component: { template: '<div />' } },
    { path: '/cast', name: 'cast', component: { template: '<div />' } },
    { path: '/recap', name: 'recap', component: { template: '<div />' } },
  ],
})

let sessionId = ''
let serverId = ''
let openingText = ''

beforeAll(async () => {
  const [draft] = await services.sessions.list()
  const active = await services.sessions.activate(draft!.id)
  sessionId = active.id
  serverId = active.serverId!
  openingText = active.snapshot.opening.parts[0]?.text ?? ''
  await router.push(`/story/${active.id}`)
  await router.isReady()
})

function mountStory() {
  return mount(StoryView, { global: { plugins: [pinia, router] } })
}

describe('StoryView', () => {
  it('展示开场与意图', async () => {
    const wrapper = mountStory()
    await flushPromises()

    expect(wrapper.find('.unit-kicker').text()).toBe('第一单元')
    expect(wrapper.text()).toContain(openingText)
    expect(wrapper.findAll('.intent-card')).toHaveLength(3)
    expect(wrapper.find('.state-note').text()).toContain('沈砚')

    wrapper.unmount()
  })

  it('回到会话时用历史回填进度', async () => {
    await services.transport.startTurn(serverId, '离线期间完成的行动')
    await (services.transport as MockSessionTransport).whenIdle(serverId)

    const sessions = useSessionsStore()
    expect(sessions.turnCount).toBe(0)

    const wrapper = mountStory()
    await flushPromises()
    await vi.waitFor(() => expect(useSessionsStore().turnCount).toBe(1), { timeout: 5000 })

    expect(wrapper.find('.turn').text()).toContain('离线期间完成的行动')
    wrapper.unmount()
  })

  it('点击意图推进一轮并记录关系变化', async () => {
    const wrapper = mountStory()
    await flushPromises()
    await vi.waitFor(() => expect(useSessionsStore().turns).toHaveLength(1), { timeout: 5000 })

    await wrapper.findAll('.intent-card')[0]!.trigger('click')
    await vi.waitFor(
      () => {
        const sessions = useSessionsStore()
        expect(sessions.turns).toHaveLength(2)
        expect(sessions.streaming).toBe(false)
        expect(sessions.turnCount).toBe(2)
      },
      { timeout: 5000 },
    )
    await flushPromises()

    const last = wrapper.findAll('.turn')[1]!
    expect(last.find('.player-action').text()).toContain('把信收进内袋')
    expect(last.find('.state-note').text()).toContain('信任 +0.03')
    expect(wrapper.text()).toContain('信纸贴着胸口')

    wrapper.unmount()
    expect(useSessionsStore().connected).toBe(false)
  })
})
