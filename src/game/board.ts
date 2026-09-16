import type { Rng } from './rng.ts'
import { at, CELLS, colOf, COLS, idx, inBounds, KINDS, ROWS, rowOf } from './types.ts'
import type { Gem, Grid, Kind, Power } from './types.ts'

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

function collectRuns(grid: Grid): Run[] {
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

  scan(COLS, ROWS, (c, r) => idx(c, r), true)
  scan(ROWS, COLS, (r, c) => idx(c, r), false)
  return runs
}

/**
 * Finds every match on the board, merging runs that share a cell so an L or T
 * shape is reported as one group rather than two.
 */
export function findMatches(grid: Grid): MatchGroup[] {
  const runs = collectRuns(grid)
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
export function blastRadius(grid: Grid, i: number): number[] {
  const gem = at(grid, i)
  if (!gem) return []
  const c = colOf(i)
  const r = rowOf(i)
  const out: number[] = []
  switch (gem.power) {
    case 'rowClear':
      for (let x = 0; x < COLS; x++) out.push(idx(x, r))
      break
    case 'colClear':
      for (let y = 0; y < ROWS; y++) out.push(idx(c, y))
      break
    case 'bomb':
      for (let y = r - 1; y <= r + 1; y++)
        for (let x = c - 1; x <= c + 1; x++) if (inBounds(x, y)) out.push(idx(x, y))
      break
    case 'rainbow': {
      // Caught in someone else's blast: takes its own colour with it.
      for (let k = 0; k < CELLS; k++) {
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
 * Expands a set of seed cells into everything that actually clears, chaining
 * through any power gems caught in the blast.
 */
export function expandClears(grid: Grid, seeds: Iterable<number>): Set<number> {
  const cleared = new Set<number>()
  const queue: number[] = []
  for (const seed of seeds) {
    if (at(grid, seed) && !cleared.has(seed)) {
      cleared.add(seed)
      queue.push(seed)
    }
  }
  while (queue.length > 0) {
    const i = queue.pop() as number
    for (const hit of blastRadius(grid, i)) {
      if (!cleared.has(hit) && at(grid, hit)) {
        cleared.add(hit)
        queue.push(hit)
      }
    }
  }
  return cleared
}

export interface FallResult {
  /** How far the furthest gem fell, in cells — used to time the animation. */
  maxDrop: number
}

/**
 * Drops every gem into the holes below it and tops each column up with new
 * gems, recording how far each one travelled so the renderer can animate it.
 */
export function applyGravity(grid: Grid, rng: Rng): FallResult {
  for (const gem of grid) {
    if (gem) {
      gem.ox = 0
      gem.oy = 0
    }
  }

  let maxDrop = 0
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1
    for (let r = ROWS - 1; r >= 0; r--) {
      const gem = at(grid, idx(c, r))
      if (!gem) continue
      if (write !== r) {
        grid[idx(c, write)] = gem
        grid[idx(c, r)] = null
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
        const gem = makeGem(rng.int(KINDS))
        gem.oy = -drop
        grid[idx(c, r)] = gem
      }
      maxDrop = Math.max(maxDrop, drop)
    }
  }
  return { maxDrop }
}

/** True if swapping these two neighbours would produce at least one match. */
function swapMakesMatch(grid: Grid, a: number, b: number): boolean {
  const ga = at(grid, a)
  const gb = at(grid, b)
  if (!ga || !gb) return false
  if (ga.power === 'rainbow' || gb.power === 'rainbow') return true
  grid[a] = gb
  grid[b] = ga
  const matched = findMatches(grid).length > 0
  grid[a] = ga
  grid[b] = gb
  return matched
}

export interface Move {
  a: number
  b: number
}

export function areNeighbours(a: number, b: number): boolean {
  const dc = Math.abs(colOf(a) - colOf(b))
  const dr = Math.abs(rowOf(a) - rowOf(b))
  return dc + dr === 1
}

export function isLegalSwap(grid: Grid, a: number, b: number): boolean {
  return areNeighbours(a, b) && swapMakesMatch(grid, a, b)
}

/** Every swap currently available to the player. */
export function findMoves(grid: Grid): Move[] {
  const moves: Move[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const a = idx(c, r)
      if (c + 1 < COLS) {
        const b = idx(c + 1, r)
        if (swapMakesMatch(grid, a, b)) moves.push({ a, b })
      }
      if (r + 1 < ROWS) {
        const b = idx(c, r + 1)
        if (swapMakesMatch(grid, a, b)) moves.push({ a, b })
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
export function shuffleBoard(grid: Grid, rng: Rng): void {
  for (let attempt = 0; attempt < 200; attempt++) {
    for (let i = grid.length - 1; i > 0; i--) {
      const j = rng.int(i + 1)
      const a = grid[i] ?? null
      grid[i] = grid[j] ?? null
      grid[j] = a
    }
    if (findMatches(grid).length === 0 && findMoves(grid).length > 0) return
  }
  fillFresh(grid, rng)
}

/**
 * Fills the grid gem by gem, never choosing a colour that would complete a run
 * with the two cells already placed to the left or above. That guarantees a
 * board with no free matches in one pass; the retry loop only exists to reject
 * the rare layout that has no legal move.
 */
export function fillFresh(grid: Grid, rng: Rng): void {
  const choices: Kind[] = []
  for (let attempt = 0; attempt < 100; attempt++) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const left = c >= 2 ? at(grid, idx(c - 1, r)) : null
        const left2 = c >= 2 ? at(grid, idx(c - 2, r)) : null
        const up = r >= 2 ? at(grid, idx(c, r - 1)) : null
        const up2 = r >= 2 ? at(grid, idx(c, r - 2)) : null
        const banH = left && left2 && left.kind === left2.kind ? left.kind : -1
        const banV = up && up2 && up.kind === up2.kind ? up.kind : -1
        choices.length = 0
        for (let k = 0; k < KINDS; k++) if (k !== banH && k !== banV) choices.push(k)
        grid[idx(c, r)] = makeGem(rng.pick(choices))
      }
    }
    if (findMoves(grid).length > 0) return
  }
}

export function createBoard(rng: Rng): Grid {
  const grid: Grid = new Array<Gem | null>(CELLS).fill(null)
  fillFresh(grid, rng)
  return grid
}
