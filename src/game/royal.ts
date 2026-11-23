import { BOARD, type Geom } from './types.ts'
import { makeRng } from './rng.ts'
import type { Terrain } from './terrain.ts'
import type { Goal } from './goals.ts'

export type RoyalDifficulty = 'easy' | 'normal' | 'hard'
export type RoyalShape = 'auto' | 'rectangle' | 'courtyard' | 'bridge'
export type RoyalObstacleKind = 'ribbon' | 'crate' | 'ice'
export interface RoyalOptions {
  level?: number
  difficulty?: RoyalDifficulty
  shape?: RoyalShape
  /** Fraction of playable cells, clamped to 0–0.40. Omit for level progression. */
  obstacleDensity?: number
  /** Omit or use 0 for the automatic move budget. */
  moves?: number
  seed?: number
}
export interface RoyalObstacle { cell: number; kind: RoyalObstacleKind; durability: number }
export interface RoyalMission {
  readonly options: Readonly<RoyalOptions>
  readonly level: number
  readonly seed: number
  readonly moves: number
  readonly goal: Readonly<Goal>
  readonly shape: Exclude<RoyalShape, 'auto'>
  readonly terrain: Terrain
  readonly obstacles: readonly RoyalObstacle[]
}

function bounded(value: number | undefined, fallback: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value!)) : fallback
}

/** Private, deterministic stages. Authored public campaign identities remain immutable. */
export function royalMission(input: RoyalOptions = {}, geom: Geom = BOARD): RoyalMission {
  const level = Math.round(bounded(input.level, 1, 1, 999))
  const difficulty: RoyalDifficulty = input.difficulty === 'easy' || input.difficulty === 'hard' ? input.difficulty : 'normal'
  const requestedShape: RoyalShape = ['rectangle', 'courtyard', 'bridge'].includes(input.shape ?? '') ? input.shape! : 'auto'
  const shape: Exclude<RoyalShape, 'auto'> = requestedShape === 'auto'
    ? level < 4 ? 'rectangle' : (['courtyard', 'bridge', 'rectangle'] as const)[Math.floor((level - 4) / 3) % 3]!
    : requestedShape
  const seed = Math.round(bounded(input.seed, (0x6c8e9cf5 + level * 7919) >>> 0, 0, 0xffffffff)) >>> 0
  const rng = makeRng(seed ^ 0xa74bf021)
  const voidCells = new Set<number>()
  const side = Math.max(2, Math.floor(geom.cols / 3))
  const top = Math.max(2, Math.floor(geom.rows / 3))
  // Each lobe retains at least two columns and three rows. The bridge remains
  // three rows tall, so ordinary horizontal matches can connect both wings.
  for (let r = 0; r < geom.rows; r++) for (let c = 0; c < geom.cols; c++) {
    const inMiddleColumns = c >= side && c < geom.cols - side
    if (shape === 'courtyard' && inMiddleColumns && r >= top && r < geom.rows - top) voidCells.add(geom.idx(c, r))
    if (shape === 'bridge' && inMiddleColumns && Math.abs(r - (geom.rows - 1) / 2) > 1.5) voidCells.add(geom.idx(c, r))
  }
  const density = bounded(input.obstacleDensity, Math.min(.25, .10 + (level - 1) * .008), 0, .40)
  const candidates: number[] = []
  const middleRow = Math.floor(geom.rows / 2)
  // The complete middle row and the upper-left 3×3 stay free to guarantee
  // space for moves and power construction, even at the densest setting.
  for (let r = 0; r < geom.rows; r++) for (let c = 0; c < geom.cols; c++) {
    const cell = geom.idx(c, r)
    if (!voidCells.has(cell) && r !== middleRow && !(c < 3 && r < 3)) candidates.push(cell)
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = rng.int(i + 1); [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!]
  }
  const count = Math.min(candidates.length, Math.round((geom.cells - voidCells.size) * density))
  const obstacles: RoyalObstacle[] = candidates.slice(0, count).map((cell, i) => {
    const kind: RoyalObstacleKind = level >= 7 && i % 5 === 4 ? 'ice' : level >= 3 && i % 3 === 1 ? 'crate' : 'ribbon'
    const durability = kind === 'ribbon' ? 1 : kind === 'ice' ? 2 : level >= 15 && difficulty !== 'easy' ? 3 : 2
    return { cell, kind, durability }
  })
  const factor = difficulty === 'easy' ? .72 : difficulty === 'hard' ? 1.25 : 1
  // Chapter finales ask more; the following stage is a deliberate breather.
  const finale = level % 5 === 0 ? 1.15 : 1
  const need = Math.round((850 + Math.min(level - 1, 60) * 85 + Math.floor((level - 1) / 60) * 120) * factor * finale / 50) * 50
  const automaticMoves = Math.max(18, 30 - Math.floor(Math.min(level, 40) / 8)) + (difficulty === 'easy' ? 7 : difficulty === 'hard' ? -4 : 0)
  const moves = input.moves && Number.isFinite(input.moves) ? Math.round(bounded(input.moves, automaticMoves, 5, 99)) : automaticMoves
  const options: RoyalOptions = { level, difficulty, shape: requestedShape }
  if (Number.isFinite(input.obstacleDensity)) options.obstacleDensity = density
  if (input.moves && Number.isFinite(input.moves)) options.moves = moves
  if (Number.isFinite(input.seed)) options.seed = seed
  return {
    options: Object.freeze(options), level, seed, moves, goal: Object.freeze({ kind: 'score', need }), shape,
    terrain: { shape, voidCells, crates: obstacles.map(o => o.cell), durability: 1 },
    obstacles,
  }
}
