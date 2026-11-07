import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', () => {
  const toastText = ref('')
  const railOpen = ref(false)
  const contextOpen = ref(false)
  const fontLarge = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  function toast(message: string): void {
    toastText.value = message
    clearTimeout(timer)
    timer = setTimeout(() => {
      toastText.value = ''
    }, 2800)
  }

  function toggleRail(): void {
    railOpen.value = !railOpen.value
    if (railOpen.value) contextOpen.value = false
  }

  function toggleContext(): void {
    contextOpen.value = !contextOpen.value
    if (contextOpen.value) railOpen.value = false
  }

  function closeDrawers(): void {
    railOpen.value = false
    contextOpen.value = false
  }

  function toggleFont(): void {
    fontLarge.value = !fontLarge.value
    const size = fontLarge.value ? '20px' : '18px'
    document.documentElement.style.setProperty('--reading-size', size)
  }

  return {
    toastText,
    railOpen,
    contextOpen,
    fontLarge,
    toast,
    toggleRail,
    toggleContext,
    closeDrawers,
    toggleFont,
  }
})
