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
import { goalForLevel, scoreTargetForLevel } from './goals.ts'
import type { Goal } from './goals.ts'
import { CHAIN_REWARD_AT, MAX_HELD, blastCells, emptyInventory, itemForLevel } from './items.ts'
import type { Inventory, Item } from './items.ts'
import { makeRng, randomSeed, type Rng } from './rng.ts'
import { at, BOARD } from './types.ts'
import type { Geom, Grid, Kind, Power } from './types.ts'

export const MOVES_PER_LEVEL = 25
/**
 * The curve this game shipped with started at 1200 and climbed by 900 a level
 * against a fixed 25 moves, which ended runs early — `npm run tune` measures a
 * mean death at level 4.3 with the bottom decile dead by level 3.
 *
 * That was steepness, not impossibility: the first level even a strong run
 * genuinely could not clear sat at 9. (An earlier version of the sweep claimed
 * level 4 was arithmetically unreachable. It was deriving that from a MEAN
 * points-per-move and treating it as a ceiling, which half of all runs beat.)
 *
 * Starting lower and climbing gently roughly doubles a typical run, and handing
 * out a couple of extra moves every few levels keeps the target from outrunning
 * the move budget at all — the sweep now reports no arithmetic wall at any
 * level it simulates.
 */
const MOVES_BONUS_EVERY = 3
const MOVES_BONUS = 2
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

/**
 * One thing the player did, in the order they did it.
 *
 * The run record is a list of these rather than a list of swaps, because an
 * item changes the board and so has to replay in its place — a record that left
 * items out would not reproduce the run it came from.
 */
export type Action =
  | { kind: 'swap'; a: number; b: number }
  | { kind: 'item'; item: Item; cell: number }
  /** A booster the run began holding. Only ever at the head of the record. */
  | { kind: 'booster'; item: Item }

export interface GameHooks {
  /** A group of gems just started clearing. `cells` are grid indices. */
  onClear(cells: number[], kind: Kind, combo: number, points: number): void
  onPowerCreated(cell: number, power: Power): void
  onInvalidSwap(a: number, b: number): void
  onSwapAccepted(): void
  onShuffle(): void
  onLevelComplete(level: number): void
  onGameOver(score: number): void
  /** An item was earned. `reason` is what paid for it. */
  onItemEarned(item: Item, reason: 'level' | 'chain'): void
  /** An item was spent on a cell. */
  onItemUsed(item: Item, cell: number): void
}

interface PendingPower {
  cell: number
  power: Power
}

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)

/** The score a score-goal level asks for. Kept here so callers need not know
 *  which module the curve lives in. */
export function targetForLevel(level: number): number {
  return scoreTargetForLevel(level)
}

export function movesForLevel(level: number): number {
  return MOVES_PER_LEVEL + Math.floor((level - 1) / MOVES_BONUS_EVERY) * MOVES_BONUS
}

export class Game {
  readonly geom: Geom
  grid: Grid
  rng: Rng
  /**
   * Hints fire on wall-clock idle time, so drawing one from the gameplay RNG
   * would make the refilled board depend on how long the player spent thinking
   * — two people playing the same seed with the same moves would diverge. A
   * separate stream keeps a run reproducible from (seed, moves) alone, which is
   * what makes server-side replay verification possible at all.
   */
  private hintRng: Rng
  seed: number
  /**
   * Everything the board accepted, in order: swaps, and items spent. Together
   * with the seed this is a complete, replayable record of the run — which is
   * why an item use has to be in here rather than beside it.
   */
  readonly log: Action[] = []

  /**
   * Items in hand: earned during the run, plus whatever boosters it started
   * with. See items.ts for what earning them costs and why.
   */
  items: Inventory = emptyInventory()

  /**
   * The boosters this run began with.
   *
   * Read out of the log rather than stored beside it: they are part of the run
   * record, and a second copy of the same fact is a second copy to keep in
   * step. A booster is bought with coins the server cannot see, so the record
   * carries the claim — which is why the verifier caps it: the cap is the
   * security boundary, and it is the one every honest player plays under.
   */
  get boosters(): Item[] {
    const out: Item[] = []
    for (const action of this.log) {
      if (action.kind !== 'booster') break
      out.push(action.item)
    }
    return out
  }

  score = 0
  level = 1
  levelStartScore = 0
  /** What this level asks for, and how far along it is. */
  goal: Goal
  goalDone = 0
  /**
   * The score curve's value for this level.
   *
   * Not the same thing as `need`, and deliberately kept apart from it: `need`
   * is whatever this level actually asks for, which on a colour level is a
   * count of gems. This is the points figure the difficulty sweep reasons
   * about, and what a score level happens to use as its goal.
   */
  target = targetForLevel(1)
  moves = movesForLevel(1)
  combo = 0
  bestCombo = 0
  status: Status = 'playing'

  /** The gem committed by a completed tap, waiting for a partner. */
  selected: number | null = null
  /**
   * The gem the pointer is currently down on. Separate from `selected` so the
   * press reads back immediately, while a first tap's selection survives the
   * player pressing a second gem to swap with.
   */
  held: number | null = null
  hint: Move | null = null

  private phase: Phase = { kind: 'idle', t: 0, d: 0, a: -1, b: -1, doomed: false }
  private clearing: number[] = []
  private pendingPowers: PendingPower[] = []
  private idleTime = 0
  private hooks: Partial<GameHooks>

  constructor(
    hooks: Partial<GameHooks> = {},
    seed: number = randomSeed(),
    geom: Geom = BOARD,
  ) {
    this.hooks = hooks
    this.seed = seed
    this.geom = geom
    this.rng = makeRng(seed)
    this.hintRng = makeRng((seed ^ 0x9e3779b9) >>> 0)
    this.goal = goalForLevel(1, geom.kinds)
    this.grid = createBoard(geom, this.rng)
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

  /**
   * How far into this level's goal the player is, in the goal's own units:
   * points for a score level, gems for a colour level, gems made for a power
   * level. The HUD reads this against `goal.need` without caring which it is.
   */
  get progress(): number {
    return this.goal.kind === 'score' ? this.score - this.levelStartScore : this.goalDone
  }

  /** What this level is asking for, in the same units as `progress`. */
  get need(): number {
    return this.goal.need
  }

  // ---- input ---------------------------------------------------------------

  /**
   * The pointer went down on a cell. This only lights the gem up — nothing is
   * committed until the pointer is released or dragged, so a press can still be
   * taken back by sliding off the board.
   */
  press(cell: number): void {
    if (this.busy) return
    if (!at(this.grid, cell)) return
    this.held = cell
    this.idleTime = 0
    this.hint = null
  }

  /** The press ended without committing to anything. */
  cancelPress(): void {
    this.held = null
  }

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
    if (areNeighbours(this.geom, this.selected, cell)) {
      this.attemptSwap(this.selected, cell)
      this.selected = null
      return
    }
    this.selected = cell
  }

  /** Drag-to-swap: the player pulled `from` toward `to`. */
  drag(from: number, to: number): void {
    this.held = null
    if (this.busy) return
    if (!areNeighbours(this.geom, from, to)) return
    this.idleTime = 0
    this.hint = null
    this.selected = null
    this.attemptSwap(from, to)
  }

  /**
   * Spends an item on a cell.
   *
   * Returns false rather than throwing when the move is not allowed, because
   * the replay verifier calls this with submitted data: a run claiming an item
   * it never earned has to fail the same way a swap that makes no match does,
   * and the inventory the verifier checks against is the one this class rebuilt
   * from the run's own history.
   *
   * An item costs no move. That is what makes it worth holding — and it is
   * bounded anyway, because the only way to get another is to earn it.
   */
  useItem(item: Item, cell: number): boolean {
    if (this.status !== 'playing' || this.busy) return false
    if ((this.items[item] ?? 0) <= 0) return false
    if (cell < 0 || cell >= this.geom.cells) return false
    if (!at(this.grid, cell)) return false

    this.items[item] -= 1
    this.log.push({ kind: 'item', item, cell })
    this.selected = null
    this.held = null
    this.hint = null
    this.idleTime = 0
    this.hooks.onItemUsed?.(item, cell)

    // The blast is the first link of a chain, not a free-standing event: the
    // cascade it sets off multiplies from here exactly as a match would.
    this.combo = 1
    this.bestCombo = Math.max(this.bestCombo, this.combo)
    const seeds = blastCells(item, cell, this.geom)
    // Routed through the same expansion a match uses, so a power gem caught in
    // a blast goes off instead of being quietly deleted.
    const cleared = expandClears(this.geom, this.grid, seeds)
    this.commitClear(cleared, [], cell)
    return true
  }

  /**
   * Starts the run holding an item. Only legal before the first action, so a
   * booster cannot be conjured mid-run by a record that puts one there.
   */
  addBooster(item: Item, limit: number): boolean {
    // Only at the head of the record: anything else in the log means the run
    // has started, and a booster arriving mid-run is a forged record.
    if (this.log.some((action) => action.kind !== 'booster')) return false
    if (this.boosters.length >= limit) return false
    if (this.items[item] >= MAX_HELD) return false
    this.log.push({ kind: 'booster', item })
    this.items[item] += 1
    return true
  }

  /**
   * Ends the run where it stands, as though the moves had run out.
   *
   * A player leaving mid-run used to simply walk away from the board: the score
   * was never banked, no coins were paid and nothing could be posted. Stopping
   * deliberately should settle up exactly as running out of moves does, so it
   * goes through the same hook and the same status rather than a second path
   * that would drift from it.
   */
  endRun(): void {
    if (this.status === 'gameOver') return
    this.status = 'gameOver'
    this.selected = null
    this.held = null
    this.hint = null
    this.hooks.onGameOver?.(this.score)
  }

  /** Adds to the inventory, capped. A payout over the cap is simply lost. */
  private earn(item: Item, reason: 'level' | 'chain'): void {
    if ((this.items[item] ?? 0) >= MAX_HELD) return
    this.items[item] += 1
    this.hooks.onItemEarned?.(item, reason)
  }

  private attemptSwap(a: number, b: number): void {
    const legal = isLegalSwap(this.geom, this.grid, a, b)
    this.swapCells(a, b)
    this.startPhase('swap', SWAP_TIME, { a, b, doomed: !legal })
    if (legal) {
      this.moves = Math.max(0, this.moves - 1)
      this.log.push({ kind: 'swap', a, b })
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
    return this.geom.colOf(from) - this.geom.colOf(to)
  }

  private rowDelta(from: number, to: number): number {
    return this.geom.rowOf(from) - this.geom.rowOf(to)
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
          const moves = findMoves(this.geom, this.grid)
          this.hint = moves.length > 0 ? (moves[this.hintRng.int(moves.length)] ?? null) : null
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
      for (let i = 0; i < this.geom.cells; i++) if (at(this.grid, i)) seeds.push(i)
    } else {
      const rainbow = aIsRainbow ? (ga as NonNullable<typeof ga>) : (gb as NonNullable<typeof gb>)
      const partner = aIsRainbow ? gb : ga
      // Retargeting the rainbow's colour makes its own blast do the work.
      if (partner) rainbow.kind = partner.kind
      seeds = [aIsRainbow ? a : b]
    }
    this.commitClear(expandClears(this.geom, this.grid, seeds), [], seeds[0] ?? 0)
    return true
  }

  /** Finds matches, reserves power gems, and starts the clear animation. */
  private beginClear(): boolean {
    const groups = findMatches(this.geom, this.grid)
    if (groups.length === 0) return false

    this.combo = Math.min(MAX_COMBO, this.combo + 1)
    this.bestCombo = Math.max(this.bestCombo, this.combo)
    // Paid once per chain, on the clear that reaches the rung — not on every
    // clear past it, or a long cascade would mint a whole inventory.
    if (this.combo === CHAIN_REWARD_AT) this.earn('bomb', 'chain')

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

    const cleared = expandClears(this.geom, this.grid, seeds)
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
      if (!gem) continue
      gem.clearing = true
      // Counted as they are marked, not as they are removed: a gem caught in a
      // blast is cleared by this level whether or not it was part of a match.
      if (this.goal.kind === 'colour' && gem.kind === this.goal.colour) this.goalDone += 1
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
      if (this.goal.kind === 'power') this.goalDone += 1
      this.hooks.onPowerCreated?.(cell, power)
    }
    this.pendingPowers = []

    const { maxDrop } = applyGravity(this.geom, this.grid, this.rng)
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

    if (this.progress >= this.goal.need) {
      this.status = 'levelComplete'
      // Earned here rather than in nextLevel(), so the payout is part of
      // finishing the level and lands before the card that announces it.
      this.earn(itemForLevel(this.level), 'level')
      this.hooks.onLevelComplete?.(this.level)
      return
    }
    if (this.moves <= 0) {
      this.status = 'gameOver'
      this.hooks.onGameOver?.(this.score)
      return
    }
    if (findMoves(this.geom, this.grid).length === 0) {
      for (const gem of this.grid) {
        if (gem) {
          gem.ox = 0
          gem.oy = 0
        }
      }
      shuffleBoard(this.geom, this.grid, this.rng)
      this.hooks.onShuffle?.()
      this.startPhase('shuffle', SHUFFLE_TIME)
    }
  }

  // ---- progression ---------------------------------------------------------

  nextLevel(): void {
    this.level += 1
    this.levelStartScore = this.score
    this.goal = goalForLevel(this.level, this.geom.kinds)
    this.goalDone = 0
    this.target = targetForLevel(this.level)
    this.moves = movesForLevel(this.level)
    this.status = 'playing'
    this.selected = null
    this.held = null
    this.idleTime = 0
  }

  restart(seed: number = randomSeed()): void {
    this.seed = seed
    this.rng = makeRng(seed)
    this.hintRng = makeRng((seed ^ 0x9e3779b9) >>> 0)
    this.log.length = 0
    this.items = emptyInventory()
    this.grid = createBoard(this.geom, this.rng)
    this.score = 0
    this.level = 1
    this.levelStartScore = 0
    this.goal = goalForLevel(1, this.geom.kinds)
    this.goalDone = 0
    this.target = targetForLevel(1)
    this.moves = movesForLevel(1)
    this.combo = 0
    this.bestCombo = 0
    this.status = 'playing'
    this.selected = null
    this.held = null
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
