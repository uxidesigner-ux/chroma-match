import type { Rng } from './rng.ts'
import { at } from './types.ts'
import type { Gem, Geom, Grid, Kind, Power } from './types.ts'

let nextId = 1

export function makeGem(kind: Kind, power: Power = 'none'): Gem {
  return { id: nextId++, kind, power, ox: 0, oy: 0, clearing: false, flash: 0 }
}

/**
 * A set of cells cleared together, plus the shape information that decides
 * which power gem (if any) the player earns for it.
 */
export interface MatchGroup {
  kind: Kind
  cells: number[]
  /** Longest single straight run inside the group. */
  longest: number
  hasHorizontal: boolean
  hasVertical: boolean
  /** Orientation of the longest run — decides rowClear vs colClear. */
  longestIsHorizontal: boolean
}

interface Run {
  cells: number[]
  horizontal: boolean
}

function collectRuns(geom: Geom, grid: Grid): Run[] {
  const runs: Run[] = []

  const scan = (
    length: number,
    cross: number,
    cellAt: (a: number, b: number) => number,
    horizontal: boolean,
  ) => {
    for (let b = 0; b < cross; b++) {
      let start = 0
      for (let a = 1; a <= length; a++) {
        const prev = at(grid, cellAt(a - 1, b))
        const curr = a < length ? at(grid, cellAt(a, b)) : null
        const same = prev !== null && curr !== null && prev.kind === curr.kind
        if (same) continue
        if (a - start >= 3) {
          const cells: number[] = []
          for (let k = start; k < a; k++) cells.push(cellAt(k, b))
          runs.push({ cells, horizontal })
        }
        start = a
      }
    }
  }

  scan(geom.cols, geom.rows, (c, r) => geom.idx(c, r), true)
  scan(geom.rows, geom.cols, (r, c) => geom.idx(c, r), false)
  return runs
}

/**
 * Finds every match on the board, merging runs that share a cell so an L or T
 * shape is reported as one group rather than two.
 */
export function findMatches(geom: Geom, grid: Grid): MatchGroup[] {
  const runs = collectRuns(geom, grid)
  if (runs.length === 0) return []

  // Union-find over runs, joined whenever two runs share a cell.
  const parent = runs.map((_, i) => i)
  const find = (i: number): number => {
    let root = i
    while (parent[root] !== root) root = parent[root] as number
    while (parent[i] !== root) {
      const up = parent[i] as number
      parent[i] = root
      i = up
    }
    return root
  }
  const owner = new Map<number, number>()
  runs.forEach((run, i) => {
    for (const cell of run.cells) {
      const other = owner.get(cell)
      if (other === undefined) owner.set(cell, i)
      else {
        const a = find(i)
        const b = find(other)
        if (a !== b) parent[a] = b
      }
    }
  })

  const byRoot = new Map<number, Run[]>()
  runs.forEach((run, i) => {
    const root = find(i)
    const bucket = byRoot.get(root)
    if (bucket) bucket.push(run)
    else byRoot.set(root, [run])
  })

  const groups: MatchGroup[] = []
  for (const bucket of byRoot.values()) {
    const cells = new Set<number>()
    let longest = 0
    let longestIsHorizontal = true
    let hasHorizontal = false
    let hasVertical = false
    for (const run of bucket) {
      for (const cell of run.cells) cells.add(cell)
      if (run.horizontal) hasHorizontal = true
      else hasVertical = true
      if (run.cells.length > longest) {
        longest = run.cells.length
        longestIsHorizontal = run.horizontal
      }
    }
    const first = bucket[0]?.cells[0]
    const gem = first === undefined ? null : at(grid, first)
    if (!gem) continue
    groups.push({
      kind: gem.kind,
      cells: [...cells],
      longest,
      hasHorizontal,
      hasVertical,
      longestIsHorizontal,
    })
  }
  return groups
}

/** The power a group earns, or 'none' for a plain three. */
export function powerFor(group: MatchGroup): Power {
  if (group.longest >= 5) return 'rainbow'
  if (group.hasHorizontal && group.hasVertical) return 'bomb'
  if (group.longest === 4) return group.longestIsHorizontal ? 'rowClear' : 'colClear'
  return 'none'
}

/** Cells a power gem takes out when it goes off. */
export function blastRadius(geom: Geom, grid: Grid, i: number): number[] {
  const gem = at(grid, i)
  if (!gem) return []
  const c = geom.colOf(i)
  const r = geom.rowOf(i)
  const out: number[] = []
  switch (gem.power) {
    case 'rowClear':
      for (let x = 0; x < geom.cols; x++) out.push(geom.idx(x, r))
      break
    case 'colClear':
      for (let y = 0; y < geom.rows; y++) out.push(geom.idx(c, y))
      break
    case 'bomb':
      for (let y = r - 1; y <= r + 1; y++)
        for (let x = c - 1; x <= c + 1; x++) if (geom.inBounds(x, y)) out.push(geom.idx(x, y))
      break
    case 'rainbow': {
      // Caught in someone else's blast: takes its own colour with it.
      for (let k = 0; k < geom.cells; k++) {
        const other = at(grid, k)
        if (other && other.kind === gem.kind) out.push(k)
      }
      break
    }
    case 'none':
      break
  }
  return out
}

/**
 * What a detonation looks like, for the renderer to telegraph.
 *
 * The rules already know which gem went off and what shape it threw; without
 * this they knew it privately, and the board simply stopped containing a row.
 * A player who cannot see the shot leave the gun has no reason to feel they
 * fired it.
 */
export type BlastKind = 'row' | 'col' | 'square' | 'colour' | 'point'

export interface Blast {
  /** Where it went off. */
  cell: number
  kind: BlastKind
  /** For a prism: the colour it is taking with it. */
  colour?: Kind
}

export interface ClearExpansion {
  cleared: Set<number>
  /** Every power gem that fired, in the order it went off. */
  blasts: Blast[]
}

const BLAST_KINDS: Partial<Record<Power, BlastKind>> = {
  rowClear: 'row',
  colClear: 'col',
  bomb: 'square',
  rainbow: 'colour',
}

/**
 * Expands a set of seed cells into everything that actually clears, chaining
 * through any power gems caught in the blast, and reports which ones fired.
 */
export function expandClears(geom: Geom, grid: Grid, seeds: Iterable<number>): ClearExpansion {
  const cleared = new Set<number>()
  const blasts: Blast[] = []
  const queue: number[] = []
  for (const seed of seeds) {
    if (at(grid, seed) && !cleared.has(seed)) {
      cleared.add(seed)
      queue.push(seed)
    }
  }
  while (queue.length > 0) {
    const i = queue.pop() as number
    const gem = at(grid, i)
    const kind = gem ? BLAST_KINDS[gem.power] : undefined
    if (gem && kind) {
      blasts.push(kind === 'colour' ? { cell: i, kind, colour: gem.kind } : { cell: i, kind })
    }
    for (const hit of blastRadius(geom, grid, i)) {
      if (!cleared.has(hit) && at(grid, hit)) {
        cleared.add(hit)
        queue.push(hit)
      }
    }
  }
  return { cleared, blasts }
}

export interface FallResult {
  /** How far the furthest gem fell, in cells — used to time the animation. */
  maxDrop: number
}

/**
 * Drops every gem into the holes below it and tops each column up with new
 * gems, recording how far each one travelled so the renderer can animate it.
 */
export function applyGravity(geom: Geom, grid: Grid, rng: Rng): FallResult {
  for (const gem of grid) {
    if (gem) {
      gem.ox = 0
      gem.oy = 0
    }
  }

  let maxDrop = 0
  for (let c = 0; c < geom.cols; c++) {
    let write = geom.rows - 1
    for (let r = geom.rows - 1; r >= 0; r--) {
      const gem = at(grid, geom.idx(c, r))
      if (!gem) continue
      if (write !== r) {
        grid[geom.idx(c, write)] = gem
        grid[geom.idx(c, r)] = null
        gem.oy = r - write // negative: it starts drawn above where it landed
        maxDrop = Math.max(maxDrop, write - r)
      }
      write--
    }
    // Rows 0..write are now empty. The replacements queue up off the top of the
    // board and fall as one stack, so they all share the same starting offset.
    if (write >= 0) {
      const drop = write + 1
      for (let r = write; r >= 0; r--) {
        const gem = makeGem(rng.int(geom.kinds))
        gem.oy = -drop
        grid[geom.idx(c, r)] = gem
      }
      maxDrop = Math.max(maxDrop, drop)
    }
  }
  return { maxDrop }
}

/** True if swapping these two neighbours would produce at least one match. */
function swapMakesMatch(geom: Geom, grid: Grid, a: number, b: number): boolean {
  const ga = at(grid, a)
  const gb = at(grid, b)
  if (!ga || !gb) return false
  if (ga.power === 'rainbow' || gb.power === 'rainbow') return true
  grid[a] = gb
  grid[b] = ga
  const matched = findMatches(geom, grid).length > 0
  grid[a] = ga
  grid[b] = gb
  return matched
}

export interface Move {
  a: number
  b: number
}

export function areNeighbours(geom: Geom, a: number, b: number): boolean {
  const dc = Math.abs(geom.colOf(a) - geom.colOf(b))
  const dr = Math.abs(geom.rowOf(a) - geom.rowOf(b))
  return dc + dr === 1
}

export function isLegalSwap(geom: Geom, grid: Grid, a: number, b: number): boolean {
  return areNeighbours(geom, a, b) && swapMakesMatch(geom, grid, a, b)
}

/** Every swap currently available to the player. */
export function findMoves(geom: Geom, grid: Grid): Move[] {
  const moves: Move[] = []
  for (let r = 0; r < geom.rows; r++) {
    for (let c = 0; c < geom.cols; c++) {
      const a = geom.idx(c, r)
      if (c + 1 < geom.cols) {
        const b = geom.idx(c + 1, r)
        if (swapMakesMatch(geom, grid, a, b)) moves.push({ a, b })
      }
      if (r + 1 < geom.rows) {
        const b = geom.idx(c, r + 1)
        if (swapMakesMatch(geom, grid, a, b)) moves.push({ a, b })
      }
    }
  }
  return moves
}

/**
 * Reshuffles the gems already on the board until the result has no free
 * matches and at least one legal move. Gives up after a bounded number of
 * attempts and rebuilds the board from scratch instead of spinning.
 */
export function shuffleBoard(geom: Geom, grid: Grid, rng: Rng): void {
  for (let attempt = 0; attempt < 200; attempt++) {
    for (let i = grid.length - 1; i > 0; i--) {
      const j = rng.int(i + 1)
      const a = grid[i] ?? null
      grid[i] = grid[j] ?? null
      grid[j] = a
    }
    if (findMatches(geom, grid).length === 0 && findMoves(geom, grid).length > 0) return
  }
  fillFresh(geom, grid, rng)
}

/**
 * Fills the grid gem by gem, never choosing a colour that would complete a run
 * with the two cells already placed to the left or above. That guarantees a
 * board with no free matches in one pass; the retry loop only exists to reject
 * the rare layout that has no legal move.
 */
export function fillFresh(geom: Geom, grid: Grid, rng: Rng): void {
  const choices: Kind[] = []
  for (let attempt = 0; attempt < 100; attempt++) {
    for (let r = 0; r < geom.rows; r++) {
      for (let c = 0; c < geom.cols; c++) {
        const left = c >= 2 ? at(grid, geom.idx(c - 1, r)) : null
        const left2 = c >= 2 ? at(grid, geom.idx(c - 2, r)) : null
        const up = r >= 2 ? at(grid, geom.idx(c, r - 1)) : null
        const up2 = r >= 2 ? at(grid, geom.idx(c, r - 2)) : null
        const banH = left && left2 && left.kind === left2.kind ? left.kind : -1
        const banV = up && up2 && up.kind === up2.kind ? up.kind : -1
        choices.length = 0
        for (let k = 0; k < geom.kinds; k++) if (k !== banH && k !== banV) choices.push(k)
        grid[geom.idx(c, r)] = makeGem(rng.pick(choices))
      }
    }
    if (findMoves(geom, grid).length > 0) return
  }
}

export function createBoard(geom: Geom, rng: Rng): Grid {
  const grid: Grid = new Array<Gem | null>(geom.cells).fill(null)
  fillFresh(geom, grid, rng)
  return grid
}
