let fallbackSeed = 0

export function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  fallbackSeed += 1
  return `${prefix}-${Date.now().toString(36)}-${fallbackSeed}`
}

export function shortDate(value: string): string {
  return value.slice(0, 10).replace(/-/g, '.')
}
