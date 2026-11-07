import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AppAvatar from '@/components/AppAvatar.vue'
import BookCover from '@/components/BookCover.vue'
import PartLine from '@/components/PartLine.vue'
import StateNoteBox from '@/components/StateNoteBox.vue'

describe('StateNoteBox', () => {
  it('展示印象与关系增量', () => {
    const wrapper = mount(StateNoteBox, {
      props: {
        note: {
          who: '沈砚',
          impression: '谨慎 · 来历不明',
          deltas: [
            ['信任', '+0.02', 'up'],
            ['恐惧', '-0.01', 'down'],
          ],
        },
      },
    })
    expect(wrapper.text()).toContain('沈砚')
    expect(wrapper.text()).toContain('谨慎 · 来历不明')
    const deltas = wrapper.findAll('.delta')
    expect(deltas).toHaveLength(2)
    expect(deltas[0]?.classes()).toContain('up')
    expect(deltas[1]?.classes()).toContain('down')
  })
})

describe('PartLine', () => {
  it('说话部分带说话人', () => {
    const wrapper = mount(PartLine, {
      props: { part: { type: 'speech', speaker: '沈砚', text: '码头今晚不接客。' } },
    })
    expect(wrapper.find('p').classes()).toContain('speech')
    expect(wrapper.find('.speaker').text()).toBe('沈砚')
    expect(wrapper.text()).toContain('码头今晚不接客。')
  })

  it('普通叙述渲染为段落', () => {
    const wrapper = mount(PartLine, { props: { part: { type: 'p', text: '雾更浓了。' } } })
    expect(wrapper.find('p').classes()).not.toContain('speech')
    expect(wrapper.text()).toBe('雾更浓了。')
  })
})

describe('AppAvatar', () => {
  it('优先使用显式头像字，其次取名字首字', () => {
    expect(mount(AppAvatar, { props: { name: '沈砚', avatar: '砚' } }).text()).toBe('砚')
    expect(mount(AppAvatar, { props: { name: '沈砚' } }).text()).toBe('沈')
  })

  it('支持大号样式', () => {
    const wrapper = mount(AppAvatar, { props: { name: '沈砚', size: 'lg' } })
    expect(wrapper.classes()).toContain('avatar-lg')
  })
})

describe('BookCover', () => {
  it('渲染世界封面信息', () => {
    const wrapper = mount(BookCover, {
      props: { world: { name: '雾港纪事', genre: '悬疑', coverClass: 'cover-fog' } },
    })
    expect(wrapper.classes()).toContain('cover-fog')
    expect(wrapper.text()).toContain('雾港纪事')
    expect(wrapper.text()).toContain('悬疑')
  })
})
