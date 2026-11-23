/** Level identifiers stay exact in JSON and JavaScript; boards are generated on demand. */
export const MAX_LEVEL = Number.MAX_SAFE_INTEGER
export const LEVEL_PAGE_SIZE = 30
export const isLevelId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
export function normalizeLevelId(value: unknown, fallback = 1): number {
  return isLevelId(value) ? value : isLevelId(fallback) ? fallback : 1
}
export function nextLevelId(level: number): number {
  const current = normalizeLevelId(level)
  return current < MAX_LEVEL ? current + 1 : MAX_LEVEL
}
export function levelPageRange(requested: number, size = LEVEL_PAGE_SIZE): { page: number; first: number; last: number; count: number; lastPage: number } {
  size = Number.isSafeInteger(size) && size >= 1 && size <= 100 ? size : LEVEL_PAGE_SIZE
  // Integer division avoids rounding the last page upward near the safe limit.
  const lastPage = Number((BigInt(MAX_LEVEL) - 1n) / BigInt(size))
  const page = Number.isSafeInteger(requested) ? Math.max(0, Math.min(lastPage, requested)) : 0
  const first = page * size + 1
  const count = Math.min(size, MAX_LEVEL - first + 1)
  return { page, first, last: first + count - 1, count, lastPage }
}
