import {
  applyGravity,
  areNeighbours,
  blastRadius,
  createBoard,
  expandClears,
  findMatches,
  findMoves,
  isLegalSwap,
  powerFor,
  shuffleBoard,
} from './board.ts'
import type { Blast, Move } from './board.ts'
import { goalForLevel, scoreTargetForLevel } from './goals.ts'
import type { Goal } from './goals.ts'
import { CHAIN_REWARD_AT, MAX_HELD, blastCells, emptyInventory, itemForLevel } from './items.ts'
import type { Inventory, Item } from './items.ts'
import { makeRng, randomSeed, type Rng } from './rng.ts'
import { at, BOARD } from './types.ts'
import type { Geom, Grid, Kind, Power } from './types.ts'
import { CURRENT_RULES, canFuse } from './rules.ts'
import type { RulesVersion } from './rules.ts'
import { fusionClear } from './fusion.ts'
import type { Fusion } from './fusion.ts'
import { areaCells, bonusForLevel, emptyUpgrades, FEVER_CHARGE, FEVER_TURNS, stageGoal, UPGRADE_CAP, UPGRADES } from './variety.ts'
import type { Upgrade, Upgrades } from './variety.ts'

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
/**
 * How long a detonation is telegraphed before anything is removed.
 *
 * A power gem used to take its row with it on the same frame it went off, which
 * reads as the board losing a row rather than as the player firing something.
 * The strike is the shot leaving the gun: short enough that a chain of them
 * does not become a cutscene, long enough to be seen as a cause.
 *
 * Only detonations get one. A plain three already pops well, and a wind-up on
 * every match would slow the whole game down to dress up its most ordinary
 * event.
 */
const STRIKE_TIME = 0.15
const CLEAR_TIME = 0.26
const FALL_PER_ROW = 0.055
const FALL_MIN = 0.18
const FALL_MAX = 0.46
const SHUFFLE_TIME = 0.5
/** Seconds of inactivity before the board points out a move. */
const HINT_DELAY = 4

export type PhaseKind = 'idle' | 'swap' | 'revert' | 'fusion' | 'strike' | 'clear' | 'fall' | 'shuffle'
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
  | { kind: 'fever' }
  | { kind: 'upgrade'; upgrade: Upgrade }
  | { kind: 'advance' }

export interface GameHooks {
  /** A group of gems just started clearing. `cells` are grid indices. */
  onClear(cells: number[], kind: Kind, combo: number, points: number): void
  onPowerCreated(cell: number, power: Power): void
  /** Power gems have gone off and are about to take the board with them. */
  onStrike(blasts: readonly Blast[]): void
  onFusion(fusion: Fusion): void
  onInvalidSwap(a: number, b: number): void
  onSwapAccepted(): void
  onShuffle(): void
  onLevelComplete(level: number): void
  onGameOver(score: number): void
  /** An item was earned. `reason` is what paid for it. */
  onItemEarned(item: Item, reason: 'level' | 'chain'): void
  /** An item was spent on a cell. */
  onItemUsed(item: Item, cell: number): void
  onFever(): void
  onCascadeCapped(): void
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
  rules: RulesVersion
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
  feverCharge = 0
  feverTurns = 0
  upgrades: Upgrades = emptyUpgrades()
  private lastUpgradeLevel = 0
  private actionCharge = 0
  private feverSwap = false
  private acceptedSwap = false
  private relayFusion = false
  private echoUsed = false
  private actionCell = 0

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
  /**
   * The clear that a strike is currently being played for. Held rather than
   * applied so the gems are still on the board while the beam crosses them —
   * shrinking them first would throw the shot at an empty row.
   */
  private pendingClear: { cells: number[]; kind: Kind; points: number } | null = null
  /** What is firing right now, for the renderer. Empty outside a strike. */
  strikes: readonly Blast[] = []
  fusion: Fusion | null = null
  private pendingFusion: ReturnType<typeof fusionClear> = null
  private idleTime = 0
  private hooks: Partial<GameHooks>

  /** Rebuilding history must not pay missions, play effects or open past dialogs. */
  withHooksMuted<T>(run: () => T): T {
    const hooks = this.hooks
    this.hooks = {}
    try { return run() } finally { this.hooks = hooks }
  }

  constructor(
    hooks: Partial<GameHooks> = {},
    seed: number = randomSeed(),
    geom: Geom = BOARD,
    rules: RulesVersion = CURRENT_RULES,
  ) {
    this.hooks = hooks
    this.seed = seed
    this.geom = geom
    this.rules = rules
    this.rng = makeRng(seed)
    this.hintRng = makeRng((seed ^ 0x9e3779b9) >>> 0)
    this.goal = goalForLevel(1, geom.kinds)
    this.grid = createBoard(geom, this.rng, rules)
  }

  // ---- read-only view helpers used by the renderer -------------------------

  get phaseKind(): PhaseKind {
    return this.phase.kind
  }

  /** How much of each gem's stored offset is still showing, 1 -> 0 over a move. */
  get offsetFactor(): number {
    const { kind, t, d } = this.phase
    if (kind === 'idle' || kind === 'clear' || kind === 'fusion') return 0
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

  get bonusRound() { return bonusForLevel(this.level, this.rules) }
  get upgradeOptions(): Upgrade[] { return UPGRADES.filter(u => this.upgrades[u] < UPGRADE_CAP) }
  get upgradeDue(): boolean {
    return this.rules >= 4 && this.status === 'levelComplete' && this.level % 3 === 0
      && this.lastUpgradeLevel !== this.level && this.upgradeOptions.length > 0
  }
  private get boosts(): Upgrades | undefined { return this.rules >= 4 ? this.upgrades : undefined }
  private get refillGeom(): Geom {
    return this.bonusRound === 'festival' ? { ...this.geom, kinds: 3 } : this.geom
  }
  activateFever(): boolean {
    if (this.rules < 4 || this.busy || this.feverTurns > 0 || this.feverCharge < FEVER_CHARGE) return false
    this.feverCharge = 0
    this.feverTurns = FEVER_TURNS
    this.log.push({ kind: 'fever' })
    this.selected = null; this.held = null; this.hint = null; this.idleTime = 0
    this.hooks.onFever?.()
    return true
  }
  chooseUpgrade(upgrade: Upgrade): boolean {
    if (!this.upgradeDue || this.phaseKind !== 'idle' || !this.upgradeOptions.includes(upgrade)) return false
    this.upgrades[upgrade] += 1
    this.lastUpgradeLevel = this.level
    this.log.push({ kind: 'upgrade', upgrade })
    return true
  }

  private beginAction(cell: number, swap: boolean): void {
    this.actionCharge = 0
    this.echoUsed = false
    this.actionCell = cell
    this.acceptedSwap = swap
    this.feverSwap = swap && this.feverTurns > 0
    this.relayFusion = false
  }

  /** Only adjacent partners of the current selection, never decorative suggestions. */
  get fusionPartners(): number[] {
    if (this.busy || this.selected === null || this.rules < 2) return []
    const chosen = at(this.grid, this.selected)
    if (!chosen || chosen.power === 'none') return []
    const c = this.geom.colOf(this.selected)
    const r = this.geom.rowOf(this.selected)
    return [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]]
      .filter(([x, y]) => this.geom.inBounds(x!, y!))
      .map(([x, y]) => this.geom.idx(x!, y!))
      .filter(cell => {
        const gem = at(this.grid, cell)
        return gem !== null && canFuse(chosen.power, gem.power, this.rules)
      })
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
    this.beginAction(cell, false)
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
    const seeds = item === 'bomb' && this.boosts?.blast
      ? areaCells(this.geom, cell, 1 + this.boosts.blast) : blastCells(item, cell, this.geom)
    // Routed through the same expansion a match uses, so a power gem caught in
    // a blast goes off instead of being quietly deleted.
    const { cleared, blasts } = expandClears(this.geom, this.grid, seeds, new Set(), this.boosts)
    // An item is aimed by hand, so it is the most deliberate thing a player
    // does on this board and the one that most deserves to be seen leaving.
    const shape = item === 'rocket' ? 'row' : item === 'bomb' ? 'square' : 'point'
    const aimed = seeds.filter((target) => target !== cell)
    this.commitClear(cleared, [], cell, [{ cell, kind: shape, targets: aimed }, ...blasts])
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
    const legal = isLegalSwap(this.geom, this.grid, a, b, this.rules)
    this.swapCells(a, b)
    this.startPhase('swap', SWAP_TIME, { a, b, doomed: !legal })
    if (legal) {
      this.beginAction(b, true)
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
          const moves = findMoves(this.geom, this.grid, this.rules)
          this.hint = moves.length > 0 ? (moves[this.hintRng.int(moves.length)] ?? null) : null
        }
      }
      return
    }

    this.phase.t += dt
    if (this.phase.t < this.phase.d) return

    /*
     * A gem's offset belongs to the phase that put it there.
     *
     * `offsetFactor` is one multiplier over the whole board, and it is zero
     * only while idle, clearing or fusing — so a gem still carrying an offset
     * from a finished phase is drawn a full cell away the instant any other
     * phase begins, and slides home again. A rejected swap is where it showed:
     * the pair keeps the offset its revert leg used, nothing clears it (only
     * gravity and a shuffle do, and neither runs), and the player's next swap
     * anywhere on the board drags those two along with it.
     *
     * Clearing here rather than in `startPhase` is deliberate: `swapCells` and
     * `applyGravity` set their offsets before starting a phase, so this is the
     * one point where no phase owns an offset.
     */
    for (const gem of this.grid) {
      if (gem) {
        gem.ox = 0
        gem.oy = 0
      }
    }

    switch (this.phase.kind) {
      case 'swap':
        this.finishSwap()
        break
      case 'revert':
        this.startPhase('idle', 0)
        this.idleTime = 0
        break
      case 'strike':
        this.beginClearPhase()
        break
      case 'fusion': {
        const result = this.pendingFusion
        this.pendingFusion = null
        if (result) this.commitClear(result.cleared, [], result.b, result.blasts)
        else this.settle()
        break
      }
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
    const ga = at(this.grid, a)
    const gb = at(this.grid, b)
    if (ga && gb && canFuse(ga.power, gb.power, this.rules)) {
      const result = fusionClear(this.geom, this.grid, a, b, this.boosts)
      if (result) {
        this.combo = 1
        this.bestCombo = Math.max(1, this.bestCombo)
        this.pendingFusion = result
        this.relayFusion = this.bonusRound === 'relay'
        this.fusion = { kind: result.kind, a, b }
        this.startPhase('fusion', 0.3)
        this.hooks.onFusion?.(this.fusion)
        return
      }
    }
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
    const origin = seeds[0] ?? 0
    const { cleared, blasts } = expandClears(this.geom, this.grid, seeds, new Set(), this.boosts)
    // The prism that was swapped is the origin of the sweep. Its own blast is
    // reported by the expansion only when it is caught in someone else's, so
    // firing it by hand has to say so here.
    // Its reach is every gem of the colour it just took on, which is exactly
    // what blastRadius already answers for the gem sitting there.
    const targets = blastRadius(this.geom, this.grid, origin).filter((cell) => cell !== origin)
    const colour = at(this.grid, origin)?.kind
    const opening: Blast =
      colour === undefined
        ? { cell: origin, kind: 'colour', targets }
        : { cell: origin, kind: 'colour', targets, colour }
    this.commitClear(cleared, [], origin, [opening, ...blasts])
    return true
  }

  /** Finds matches, reserves power gems, and starts the clear animation. */
  private beginClear(): boolean {
    const groups = findMatches(this.geom, this.grid, this.rules)
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

    const { cleared, blasts } = expandClears(this.geom, this.grid, seeds, new Set(), this.boosts)
    for (const p of powers) cleared.delete(p.cell)

    const first = groups[0]
    this.commitClear(cleared, powers, first?.cells[0] ?? 0, blasts)
    return true
  }

  private commitClear(
    cleared: Set<number>,
    powers: PendingPower[],
    originCell: number,
    blasts: readonly Blast[] = [],
  ): void {
    if (this.boosts?.echo && !this.echoUsed && blasts.length > 0) {
      this.echoUsed = true
      const colour = this.goal.kind === 'colour' ? this.goal.colour : at(this.grid, originCell)?.kind
      const reserved = new Set(powers.map(p => p.cell))
      const extra = this.grid.flatMap((gem, cell) => gem?.kind === colour && !cleared.has(cell) && !reserved.has(cell) ? [cell] : [])
        .slice(0, this.boosts.echo * 2)
      if (extra.length && colour !== undefined) {
        const echo = expandClears(this.geom, this.grid, [...cleared, ...extra], new Set(cleared), this.boosts)
        reserved.forEach(cell => echo.cleared.delete(cell))
        cleared = echo.cleared
        blasts = [...blasts, { cell: originCell, kind: 'colour', targets: extra, colour }, ...echo.blasts]
      }
    }
    if (cleared.size === 0) {
      this.settle()
      return
    }
    let points = cleared.size * POINTS_PER_GEM * this.combo
    for (const p of powers) points += POWER_BONUS[p.power]
    this.score += points
    if (this.rules >= 4 && this.feverTurns === 0 && !this.feverSwap) {
      const earned = Math.min(35 - this.actionCharge, 4 + Math.ceil(cleared.size / 2) + this.combo * 2 + blasts.length * 3)
      this.actionCharge += earned
      this.feverCharge = Math.min(FEVER_CHARGE, this.feverCharge + earned)
    }

    this.pendingPowers = powers
    this.pendingClear = {
      cells: [...cleared],
      kind: at(this.grid, originCell)?.kind ?? 0,
      points,
    }

    if (blasts.length === 0) {
      this.beginClearPhase()
      return
    }
    // Something fired. The board is left exactly as it is for the length of the
    // strike so the beam has gems to cross, and only then do they go.
    this.strikes = blasts
    this.hooks.onStrike?.(blasts)
    this.startPhase('strike', STRIKE_TIME)
  }

  /** Marks the pending clear on the board and starts the pop. */
  private beginClearPhase(): void {
    const pending = this.pendingClear
    this.pendingClear = null
    this.strikes = []
    this.fusion = null
    if (!pending) {
      this.settle()
      return
    }

    for (const cell of pending.cells) {
      const gem = at(this.grid, cell)
      if (!gem) continue
      gem.clearing = true
      // Counted as they are marked, not as they are removed: a gem caught in a
      // blast is cleared by this level whether or not it was part of a match.
      if (this.goal.kind === 'colour' && gem.kind === this.goal.colour) this.goalDone += 1
    }
    this.clearing = pending.cells

    this.hooks.onClear?.(pending.cells, pending.kind, this.combo, pending.points)
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

    const { maxDrop } = applyGravity(this.refillGeom, this.grid, this.rng)
    const d = Math.min(FALL_MAX, Math.max(FALL_MIN, maxDrop * FALL_PER_ROW))
    this.startPhase('fall', d)
  }

  private finishFall(): void {
    // Three-colour bonus boards can otherwise cascade for tens of seconds.
    // v4 has a declared eight-link budget, not a hidden change in refill odds.
    // Keep every surviving power at its cell and prepare a match-free deal.
    if (this.rules >= 4 && this.combo >= MAX_COMBO && findMatches(this.geom, this.grid, this.rules).length > 0) {
      const deal = createBoard(this.refillGeom, this.rng, this.rules)
      for (let cell = 0; cell < this.geom.cells; cell++) {
        const previous = at(this.grid, cell), next = at(deal, cell)
        if (previous && next) next.power = previous.power
      }
      this.grid = deal
      this.hooks.onCascadeCapped?.()
      this.startPhase('shuffle', SHUFFLE_TIME)
      return
    }
    if (this.beginClear()) return
    this.settle()
  }

  /** The board has stopped moving: check the level, then hand control back. */
  private settle(): void {
    if (this.rules >= 4 && this.acceptedSwap) {
      // Earned fever stacks with a bonus round; activating it in the factory
      // must not replace its promised bomb or spend three turns for no benefit.
      if (this.feverSwap) this.supplyPower(this.feverTurns === 2 ? 'rowClear' : 'bomb')
      if (this.bonusRound === 'factory') this.supplyPower('bomb')
      if (this.relayFusion) this.supplyPair()
      if (this.feverSwap) this.feverTurns = Math.max(0, this.feverTurns - 1)
    }
    this.acceptedSwap = false; this.feverSwap = false; this.relayFusion = false
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
    if (findMoves(this.geom, this.grid, this.rules).length === 0) {
      for (const gem of this.grid) {
        if (gem) {
          gem.ox = 0
          gem.oy = 0
        }
      }
      shuffleBoard(this.refillGeom, this.grid, this.rng, this.rules)
      this.hooks.onShuffle?.()
      this.startPhase('shuffle', SHUFFLE_TIME)
    }
  }

  // ---- progression ---------------------------------------------------------

  private supplyPower(power: Power): boolean {
    for (let offset = 0; offset < this.geom.cells; offset++) {
      const cell = (this.actionCell + offset) % this.geom.cells
      const gem = at(this.grid, cell)
      if (!gem || gem.power !== 'none') continue
      gem.power = power; gem.flash = .45
      if (this.goal.kind === 'power') this.goalDone += 1
      this.hooks.onPowerCreated?.(cell, power)
      this.actionCell = (cell + 1) % this.geom.cells
      return true
    }
    return false
  }
  private supplyPair(): void {
    for (let offset = 0; offset < this.geom.cells; offset++) {
      const a = (this.actionCell + offset) % this.geom.cells, b = a + 1
      if (this.geom.colOf(a) === this.geom.cols - 1) continue
      if (at(this.grid, a)?.power !== 'none' || at(this.grid, b)?.power !== 'none') continue
      this.actionCell = a; this.supplyPower('rowClear')
      this.actionCell = b; this.supplyPower('bomb')
      return
    }
  }

  nextLevel(): boolean {
    if (this.rules >= 4 && (this.status !== 'levelComplete' || this.upgradeDue)) return false
    if (this.rules >= 4) this.log.push({ kind: 'advance' })
    const previousBonus = this.bonusRound
    this.level += 1
    this.levelStartScore = this.score
    this.goal = stageGoal(this.level, this.geom.kinds, this.rules)
    this.goalDone = 0
    this.target = targetForLevel(this.level)
    this.moves = movesForLevel(this.level) + (this.bonusRound ? 5 : 0)
    this.status = 'playing'
    this.selected = null
    this.held = null
    this.idleTime = 0
    this.hint = null
    if (this.bonusRound || previousBonus) {
      this.grid = createBoard(this.refillGeom, this.rng, this.rules)
      this.actionCell = 0
      if (this.bonusRound === 'factory') for (let i = 0; i < 3; i++) this.supplyPower('bomb')
      if (this.bonusRound === 'relay') for (let i = 0; i < 3; i++) this.supplyPair()
    }
    return true
  }

  restart(seed: number = randomSeed(), rules: RulesVersion = CURRENT_RULES): void {
    this.rules = rules
    this.seed = seed
    this.rng = makeRng(seed)
    this.hintRng = makeRng((seed ^ 0x9e3779b9) >>> 0)
    this.log.length = 0
    this.items = emptyInventory()
    this.feverCharge = 0; this.feverTurns = 0; this.upgrades = emptyUpgrades()
    this.lastUpgradeLevel = 0; this.actionCharge = 0; this.echoUsed = false; this.actionCell = 0
    this.feverSwap = false; this.acceptedSwap = false; this.relayFusion = false
    this.grid = createBoard(this.geom, this.rng, rules)
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
    this.pendingClear = null
    this.pendingFusion = null
    this.fusion = null
    this.strikes = []
    this.idleTime = 0
    this.startPhase('idle', 0)
  }
}

/** The cell nearest the middle of a match, where a power gem looks at home. */
function middleOf(cells: number[]): number {
  return cells[Math.floor(cells.length / 2)] ?? (cells[0] as number)
}
