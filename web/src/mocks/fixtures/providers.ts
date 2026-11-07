import type { Provider } from '@/api/types'

export const BUILTIN_PROVIDERS: Provider[] = [
  { id: 'deepseek', name: 'DeepSeek', base: 'https://api.deepseek.com/v1', icon: 'deepseek' },
  { id: 'minimax-token-io', name: 'MiniMax Token Plan (minimax.io)', base: 'https://api.minimax.io/v1', icon: 'minimax' },
  { id: 'minimax-token-cn', name: 'MiniMax Token Plan (minimax.cn)', base: 'https://api.minimax.cn/v1', icon: 'minimax' },
  { id: 'qiniu', name: 'Qiniu', base: 'https://api.qnaigc.com/v1', icon: 'qiniu' },
  { id: 'modelscope', name: 'ModelScope', base: 'https://api-inference.modelscope.cn/v1', icon: 'modelscope' },
  { id: 'minimax', name: 'MiniMax (minimax.cn)', base: 'https://api.minimax.cn/v1', icon: 'minimax' },
]
