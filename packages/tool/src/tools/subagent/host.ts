/** 工具执行时按需解析；subagent 依赖 ToolService 构造，故延迟到执行期取。 */
export interface SubagentToolHost {
  spawn(
    parentSessionId: string,
    spec: { systemPrompt: string; task: string },
    opts?: { sessionId?: string },
  ): Promise<string>
  send(fromSessionId: string, toSessionId: string, message: string): Promise<void>
  wait(childSessionId: string, opts?: { timeoutMs?: number }): Promise<unknown>
}
