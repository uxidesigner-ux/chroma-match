import { makeRng } from '../game/rng.ts'

export const CAMPAIGN_MAX_COLS = 8
export const CAMPAIGN_MAX_ROWS = 9
export interface CampaignGeometry { family: string; cols: number; rows: number; mask: string[] }
const families = ['garden', 'rounded', 'hourglass', 'courtyard', 'stairs', 'cross', 'wings', 'windows', 'arch', 'diamond', 'alcove', 'terrace'] as const

export function neighbours(cell: number, cols: number, rows: number): number[] {
  return [cell % cols ? cell - 1 : -1, cell % cols < cols - 1 ? cell + 1 : -1, cell >= cols ? cell - cols : -1, cell + cols < cols * rows ? cell + cols : -1].filter(n => n >= 0)
}
export function connected(cells: Set<number>, cols: number, rows: number): boolean {
  const first = cells.values().next().value
  if (first === undefined) return false
  const seen = new Set([first]), queue = [first]
  for (let i = 0; i < queue.length; i++) for (const n of neighbours(queue[i]!, cols, rows)) if (cells.has(n) && !seen.has(n)) { seen.add(n); queue.push(n) }
  return seen.size === cells.size
}
export function openSquares(cells: Set<number>, cols: number, rows: number): number[][] {
  const squares: number[][] = []
  for (let r = 0; r <= rows - 3; r++) for (let c = 0; c <= cols - 3; c++) {
    const square = Array.from({ length: 9 }, (_, i) => (r + Math.floor(i / 3)) * cols + c + i % 3)
    if (square.every(n => cells.has(n))) squares.push(square)
  }
  return squares
}
export function playableCells(geometry: Pick<CampaignGeometry, 'cols' | 'mask'>): Set<number> {
  return new Set(geometry.mask.join('').split('').flatMap((v, i) => v === '1' ? [i] : []))
}
/** Cells with a real straight-three or square matching venue, ignoring colour. */
export function matchableCells(free: Set<number>, cols: number, rows: number): Set<number> {
  const result = new Set<number>()
  for (const cell of free) {
    const c = cell % cols, r = Math.floor(cell / cols)
    const groups = [c + 2 < cols ? [cell, cell + 1, cell + 2] : [], r + 2 < rows ? [cell, cell + cols, cell + cols * 2] : [], c + 1 < cols && r + 1 < rows ? [cell, cell + 1, cell + cols, cell + cols + 1] : []]
    for (const group of groups) if (group.length && group.every(n => free.has(n))) group.forEach(n => result.add(n))
  }
  return result
}

function baseMask(family: typeof families[number], cols: number, rows: number): string[] {
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
    const edgeR = Math.min(r, rows - 1 - r), edgeC = Math.min(c, cols - 1 - c)
    let hole = false
    if (family === 'rounded') hole = edgeR === 0 && edgeC === 0
    if (family === 'hourglass') hole = r >= 2 && r < rows - 2 && edgeC === 0
    if (family === 'courtyard') hole = r >= 3 && r <= rows - 4 && c >= 2 && c <= cols - 3
    if (family === 'stairs') hole = r >= rows - 3 && c < r - rows + 4
    if (family === 'cross') hole = edgeR < 2 && edgeC === 0
    if (family === 'wings') hole = (r < 2 || r >= rows - 2) && c >= 3 && c <= cols - 4
    if (family === 'windows') hole = (r === 2 || r === rows - 3) && (c === 2 || c === cols - 3)
    if (family === 'arch') hole = r < 2 && c >= 2 && c <= cols - 3
    if (family === 'diamond') hole = edgeC < Math.max(0, 2 - edgeR)
    if (family === 'alcove') hole = r >= rows - 3 && c >= 3 && c <= cols - 4
    if (family === 'terrace') hole = r >= rows - 2 && (c < 2 || c >= cols - 2)
    return hole ? '0' : '1'
  }).join(''))
}
function acceptable(mask: string[], cols: number, rows: number): boolean {
  const cells = playableCells({ cols, mask })
  return cells.size >= 42 && connected(cells, cols, rows) && openSquares(cells, cols, rows).length > 0
    && [...cells].every(cell => neighbours(cell, cols, rows).filter(n => cells.has(n)).length >= 2)
}

function buildCatalog(): CampaignGeometry[] {
  const used = new Set<string>(), buckets: CampaignGeometry[][] = []
  for (const family of families) {
    const bucket: CampaignGeometry[] = []
    for (const cols of [7, 8]) for (const rows of [8, 9]) for (const flip of [0, 1, 2, 3]) {
      let base = baseMask(family, cols, rows)
      if (flip & 1) base = base.map(row => [...row].reverse().join(''))
      if (flip & 2) base.reverse()
      // Carve only shallow outside notches; never crop a completed board.
      const notches: number[][] = [[]]
      for (let c = 1; c < cols - 1; c++) notches.push([c], [(rows - 1) * cols + c])
      for (let r = 2; r < rows - 2; r++) notches.push([r * cols], [r * cols + cols - 1])
      for (const notch of notches) {
        const cells = base.join('').split('')
        notch.forEach(cell => { cells[cell] = '0' })
        const mask = Array.from({ length: rows }, (_, r) => cells.slice(r * cols, (r + 1) * cols).join(''))
        const key = `${cols}:${mask.join('/')}`
        if (used.has(key) || !acceptable(mask, cols, rows)) continue
        used.add(key); bucket.push({ family, cols, rows, mask })
      }
    }
    const rng = makeRng(0x3d829a17 + buckets.length * 104729)
    for (let i = bucket.length - 1; i > 0; i--) { const j = rng.int(i + 1); [bucket[i], bucket[j]] = [bucket[j]!, bucket[i]!] }
    buckets.push(bucket)
  }
  const result: CampaignGeometry[] = []
  // Interleave independently shuffled families. Every actual mask occurs once,
  // including at the wrap boundary, so adjacent levels cannot repeat a mask.
  for (let i = 0; buckets.some(bucket => i < bucket.length); i++) for (const bucket of buckets) if (bucket[i]) result.push(bucket[i]!)
  return result
}
let cachedCatalog: CampaignGeometry[] | undefined
const geometryCatalog = (): CampaignGeometry[] => cachedCatalog ??= buildCatalog()
export function campaignGeometryCount(): number { return geometryCatalog().length }
export function campaignGeometry(level: number): CampaignGeometry {
  const catalog = geometryCatalog()
  const entry = catalog[(level - 33) % catalog.length]!
  return { ...entry, mask: [...entry.mask] }
}
