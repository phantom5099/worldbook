let fallbackSeed = 0

export function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  fallbackSeed += 1
  return `${prefix}-${Date.now().toString(36)}-${fallbackSeed}`
}

export function todayStamp(): string {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function shortDate(value: string): string {
  return value.slice(0, 10).replace(/-/g, '.')
}
