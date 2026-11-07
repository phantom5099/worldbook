import { Context } from '@cordisjs/core'
import { ToolService } from '../src/tool.js'

/** 不启动 cordis 生命周期的 ToolService，供与装配无关的测试使用。 */
export function createTestToolService(): ToolService {
  return new ToolService(new Context())
}
