import {
  applyGravity,
  areNeighbours,
  createBoard,
  expandClears,
  findMatches,
  findMoves,
  isLegalSwap,
  powerFor,
  shuffleBoard,
} from './board.ts'
import type { Move } from './board.ts'
import { makeRng, randomSeed, type Rng } from './rng.ts'
import { at, CELLS, colOf, rowOf } from './types.ts'
import type { Grid, Kind, Power } from './types.ts'

export const MOVES_PER_LEVEL = 25
const BASE_TARGET = 1200
const TARGET_STEP = 900
/** Beyond this the multiplier stops growing, so a lucky cascade can't end a level alone. */
const MAX_COMBO = 8
const POINTS_PER_GEM = 10
const POWER_BONUS: Record<Power, number> = {
  none: 0,
  rowClear: 60,
  colClear: 60,
  bomb: 100,
  rainbow: 200,
}

const SWAP_TIME = 0.16
const CLEAR_TIME = 0.26
const FALL_PER_ROW = 0.055
const FALL_MIN = 0.18
const FALL_MAX = 0.46
const SHUFFLE_TIME = 0.5
/** Seconds of inactivity before the board points out a move. */
const HINT_DELAY = 4

export type PhaseKind = 'idle' | 'swap' | 'revert' | 'clear' | 'fall' | 'shuffle'
export type Status = 'playing' | 'levelComplete' | 'gameOver'

interface Phase {
  kind: PhaseKind
  t: number
  d: number
  /** For 'swap'/'revert': the pair being animated. */
  a: number
  b: number
  /** True when this swap is known to be illegal and will be undone. */
  doomed: boolean
}

export interface GameHooks {
  /** A group of gems just started clearing. `cells` are grid indices. */
  onClear(cells: number[], kind: Kind, combo: number, points: number): void
  onPowerCreated(cell: number, power: Power): void
  onInvalidSwap(a: number, b: number): void
  onSwapAccepted(): void
  onShuffle(): void
  onLevelComplete(level: number): void
  onGameOver(score: number): void
}

interface PendingPower {
  cell: number
  power: Power
}

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)

export function targetForLevel(level: number): number {
  return BASE_TARGET + (level - 1) * TARGET_STEP
}

export class Game {
  grid: Grid
  rng: Rng
  seed: number

  score = 0
  level = 1
  levelStartScore = 0
  target = targetForLevel(1)
  moves = MOVES_PER_LEVEL
  combo = 0
  bestCombo = 0
  status: Status = 'playing'

  selected: number | null = null
  hint: Move | null = null

  private phase: Phase = { kind: 'idle', t: 0, d: 0, a: -1, b: -1, doomed: false }
  private clearing: number[] = []
  private pendingPowers: PendingPower[] = []
  private idleTime = 0
  private hooks: Partial<GameHooks>

  constructor(hooks: Partial<GameHooks> = {}, seed: number = randomSeed()) {
    this.hooks = hooks
    this.seed = seed
    this.rng = makeRng(seed)
    this.grid = createBoard(this.rng)
  }

  // ---- read-only view helpers used by the renderer -------------------------

  get phaseKind(): PhaseKind {
    return this.phase.kind
  }

  /** How much of each gem's stored offset is still showing, 1 -> 0 over a move. */
  get offsetFactor(): number {
    const { kind, t, d } = this.phase
    if (kind === 'idle' || kind === 'clear') return 0
    return 1 - easeOutCubic(Math.min(1, d === 0 ? 1 : t / d))
  }

  /** Raw 0 -> 1 progress through the current phase, unsmoothed. */
  get phaseProgress(): number {
    const { t, d } = this.phase
    return d === 0 ? 1 : Math.min(1, t / d)
  }

  /** 0 -> 1 across the clear animation; drives the shrink-and-fade. */
  get clearProgress(): number {
    if (this.phase.kind !== 'clear') return 0
    return Math.min(1, this.phase.d === 0 ? 1 : this.phase.t / this.phase.d)
  }

  get busy(): boolean {
    return this.phase.kind !== 'idle' || this.status !== 'playing'
  }

  get progress(): number {
    return this.score - this.levelStartScore
  }

  // ---- input ---------------------------------------------------------------

  /** Handles a tap on a cell: select it, deselect it, or attempt a swap. */
  tap(cell: number): void {
    if (this.busy) return
    this.idleTime = 0
    this.hint = null
    const gem = at(this.grid, cell)
    if (!gem) return

    if (this.selected === null) {
      this.selected = cell
      return
    }
    if (this.selected === cell) {
      this.selected = null
      return
    }
    if (areNeighbours(this.selected, cell)) {
      this.attemptSwap(this.selected, cell)
      this.selected = null
      return
    }
    this.selected = cell
  }

  /** Drag-to-swap: the player pulled `from` toward `to`. */
  drag(from: number, to: number): void {
    if (this.busy) return
    if (!areNeighbours(from, to)) return
    this.idleTime = 0
    this.hint = null
    this.selected = null
    this.attemptSwap(from, to)
  }

  private attemptSwap(a: number, b: number): void {
    const legal = isLegalSwap(this.grid, a, b)
    this.swapCells(a, b)
    this.startPhase('swap', SWAP_TIME, { a, b, doomed: !legal })
    if (legal) {
      this.moves = Math.max(0, this.moves - 1)
      this.hooks.onSwapAccepted?.()
    } else {
      this.hooks.onInvalidSwap?.(a, b)
    }
  }

  private swapCells(a: number, b: number): void {
    const ga = at(this.grid, a)
    const gb = at(this.grid, b)
    this.grid[a] = gb
    this.grid[b] = ga
    if (gb) {
      gb.ox = this.colDelta(b, a)
      gb.oy = this.rowDelta(b, a)
    }
    if (ga) {
      ga.ox = this.colDelta(a, b)
      ga.oy = this.rowDelta(a, b)
    }
  }

  private colDelta(from: number, to: number): number {
    return colOf(from) - colOf(to)
  }

  private rowDelta(from: number, to: number): number {
    return rowOf(from) - rowOf(to)
  }

  // ---- phase machine -------------------------------------------------------

  private startPhase(
    kind: PhaseKind,
    d: number,
    extra: { a?: number; b?: number; doomed?: boolean } = {},
  ): void {
    this.phase = {
      kind,
      t: 0,
      d,
      a: extra.a ?? -1,
      b: extra.b ?? -1,
      doomed: extra.doomed ?? false,
    }
  }

  update(dt: number): void {
    for (const gem of this.grid) if (gem && gem.flash > 0) gem.flash = Math.max(0, gem.flash - dt)

    if (this.phase.kind === 'idle') {
      if (this.status === 'playing') {
        this.idleTime += dt
        if (this.idleTime > HINT_DELAY && this.hint === null) {
          const moves = findMoves(this.grid)
          this.hint = moves.length > 0 ? (moves[this.rng.int(moves.length)] ?? null) : null
        }
      }
      return
    }

    this.phase.t += dt
    if (this.phase.t < this.phase.d) return

    switch (this.phase.kind) {
      case 'swap':
        this.finishSwap()
        break
      case 'revert':
        this.startPhase('idle', 0)
        this.idleTime = 0
        break
      case 'clear':
        this.finishClear()
        break
      case 'fall':
        this.finishFall()
        break
      case 'shuffle':
        this.settle()
        break
    }
  }

  private finishSwap(): void {
    const { a, b, doomed } = this.phase
    if (doomed) {
      // Nothing matched, so slide the pair back. The revert leg animates and
      // then hands control straight back to the player.
      this.swapCells(a, b)
      this.startPhase('revert', SWAP_TIME, { a, b })
      return
    }
    this.combo = 0
    if (!this.resolveRainbow(a, b)) this.beginClear()
  }

  /**
   * A rainbow gem detonates on contact rather than by forming a line: swapping
   * it onto a colour wipes that colour off the board. Two rainbows clear
   * everything. Returns true if a rainbow handled the swap.
   */
  private resolveRainbow(a: number, b: number): boolean {
    const ga = at(this.grid, a)
    const gb = at(this.grid, b)
    const aIsRainbow = ga?.power === 'rainbow'
    const bIsRainbow = gb?.power === 'rainbow'
    if (!aIsRainbow && !bIsRainbow) return false

    this.combo = 1
    let seeds: number[]
    if (aIsRainbow && bIsRainbow) {
      seeds = []
      for (let i = 0; i < CELLS; i++) if (at(this.grid, i)) seeds.push(i)
    } else {
      const rainbow = aIsRainbow ? (ga as NonNullable<typeof ga>) : (gb as NonNullable<typeof gb>)
      const partner = aIsRainbow ? gb : ga
      // Retargeting the rainbow's colour makes its own blast do the work.
      if (partner) rainbow.kind = partner.kind
      seeds = [aIsRainbow ? a : b]
    }
    this.commitClear(expandClears(this.grid, seeds), [], seeds[0] ?? 0)
    return true
  }

  /** Finds matches, reserves power gems, and starts the clear animation. */
  private beginClear(): boolean {
    const groups = findMatches(this.grid)
    if (groups.length === 0) return false

    this.combo = Math.min(MAX_COMBO, this.combo + 1)
    this.bestCombo = Math.max(this.bestCombo, this.combo)

    const seeds = new Set<number>()
    const powers: PendingPower[] = []
    const swapped = new Set<number>()
    if (this.phase.kind === 'swap') {
      swapped.add(this.phase.a)
      swapped.add(this.phase.b)
    }

    for (const group of groups) {
      for (const cell of group.cells) seeds.add(cell)
      const power = powerFor(group)
      if (power === 'none') continue
      // The power gem appears where the player acted, if they were part of it.
      const anchor = group.cells.find((c) => swapped.has(c)) ?? middleOf(group.cells)
      powers.push({ cell: anchor, power })
    }
    for (const p of powers) seeds.delete(p.cell)

    const cleared = expandClears(this.grid, seeds)
    for (const p of powers) cleared.delete(p.cell)

    const first = groups[0]
    this.commitClear(cleared, powers, first?.cells[0] ?? 0)
    return true
  }

  private commitClear(cleared: Set<number>, powers: PendingPower[], originCell: number): void {
    if (cleared.size === 0) {
      this.settle()
      return
    }
    let points = cleared.size * POINTS_PER_GEM * this.combo
    for (const p of powers) points += POWER_BONUS[p.power]
    this.score += points

    const cells = [...cleared]
    for (const cell of cells) {
      const gem = at(this.grid, cell)
      if (gem) gem.clearing = true
    }
    this.clearing = cells
    this.pendingPowers = powers

    const kind = at(this.grid, originCell)?.kind ?? 0
    this.hooks.onClear?.(cells, kind, this.combo, points)
    this.startPhase('clear', CLEAR_TIME)
  }

  private finishClear(): void {
    for (const cell of this.clearing) this.grid[cell] = null
    this.clearing = []

    for (const { cell, power } of this.pendingPowers) {
      const gem = at(this.grid, cell)
      if (!gem) continue
      gem.power = power
      gem.flash = 0.45
      this.hooks.onPowerCreated?.(cell, power)
    }
    this.pendingPowers = []

    const { maxDrop } = applyGravity(this.grid, this.rng)
    const d = Math.min(FALL_MAX, Math.max(FALL_MIN, maxDrop * FALL_PER_ROW))
    this.startPhase('fall', d)
  }

  private finishFall(): void {
    if (this.beginClear()) return
    this.settle()
  }

  /** The board has stopped moving: check the level, then hand control back. */
  private settle(): void {
    this.combo = 0
    this.startPhase('idle', 0)
    this.idleTime = 0
    this.hint = null

    if (this.progress >= this.target) {
      this.status = 'levelComplete'
      this.hooks.onLevelComplete?.(this.level)
      return
    }
    if (this.moves <= 0) {
      this.status = 'gameOver'
      this.hooks.onGameOver?.(this.score)
      return
    }
    if (findMoves(this.grid).length === 0) {
      for (const gem of this.grid) {
        if (gem) {
          gem.ox = 0
          gem.oy = 0
        }
      }
      shuffleBoard(this.grid, this.rng)
      this.hooks.onShuffle?.()
      this.startPhase('shuffle', SHUFFLE_TIME)
    }
  }

  // ---- progression ---------------------------------------------------------

  nextLevel(): void {
    this.level += 1
    this.levelStartScore = this.score
    this.target = targetForLevel(this.level)
    this.moves = MOVES_PER_LEVEL
    this.status = 'playing'
    this.selected = null
    this.idleTime = 0
  }

  restart(seed: number = randomSeed()): void {
    this.seed = seed
    this.rng = makeRng(seed)
    this.grid = createBoard(this.rng)
    this.score = 0
    this.level = 1
    this.levelStartScore = 0
    this.target = targetForLevel(1)
    this.moves = MOVES_PER_LEVEL
    this.combo = 0
    this.bestCombo = 0
    this.status = 'playing'
    this.selected = null
    this.hint = null
    this.clearing = []
    this.pendingPowers = []
    this.idleTime = 0
    this.startPhase('idle', 0)
  }
}

/** The cell nearest the middle of a match, where a power gem looks at home. */
function middleOf(cells: number[]): number {
  return cells[Math.floor(cells.length / 2)] ?? (cells[0] as number)
}
