/**
 * Measures candidate board shapes by playing them.
 *
 * Board size is the one tuning decision that cannot be made by eye: a narrower
 * board gives a bigger tap target but fewer places for a match to appear, and
 * whether that tips into "keeps deadlocking" or "trivially easy" depends on the
 * colour count and on the cascade rules in a way that is easier to measure than
 * to reason about. This plays every candidate with a middling-strength policy
 * and prints what actually happens.
 *
 * Run with: npm run tune
 */
import { findMoves } from '../src/game/board.ts'
import { bestMove } from '../src/game/autoplay.ts'
import { Game, MOVES_PER_LEVEL, movesForLevel } from '../src/game/game.ts'
import { goalForLevel } from '../src/game/goals.ts'
import { BOARD, makeGeom } from '../src/game/types.ts'
import type { Geom } from '../src/game/types.ts'

const FRAME = 1 / 60
const SEEDS = 60

/**
 * The portrait phone the board has to fit, measured in the browser at 375x812
 * against the stylesheet as it currently stands. These numbers drift whenever
 * the page chrome changes, so they are re-measured rather than assumed — the
 * board inset must track BOARD_PAD in src/render/renderer.ts.
 */
const VIEWPORT = { boardBoxW: 359, boardBoxH: 579, pad: 8 }
/** Apple and Google both put the minimum comfortable touch target here. */
const MIN_TOUCH = 44

function cellSizeOn(geom: Geom): number {
  const { boardBoxW, boardBoxH, pad } = VIEWPORT
  return Math.min((boardBoxW - pad * 2) / geom.cols, (boardBoxH - pad * 2) / geom.rows)
}

/** Fraction of the stage the board actually covers. */
function screenUse(geom: Geom): number {
  const cell = cellSizeOn(geom)
  return (cell * geom.cols * cell * geom.rows) / (VIEWPORT.boardBoxW * VIEWPORT.boardBoxH)
}

function settle(game: Game): boolean {
  for (let i = 0; i < 6000; i++) {
    if (game.phaseKind === 'idle') return true
    game.update(FRAME)
  }
  return false
}

interface Report {
  label: string
  cell: number
  blocks: number
  screenUse: number
  movesOffered: number
  pointsPerMove: number
  meanCombo: number
  maxCombo: number
  shufflesPer100: number
  /** What a full move budget scores: the middle run and a strong one. */
  medianRun: number
  p90Run: number
  stalled: number
}

function evaluate(geom: Geom, label: string): Report {
  let turns = 0
  let shuffles = 0
  let comboSum = 0
  let comboCount = 0
  let maxCombo = 0
  let offeredSum = 0
  let stalled = 0
  let pointsSum = 0
  /** Per-seed totals for a full move budget, so the spread is visible. */
  const totals: number[] = []

  for (let seed = 1; seed <= SEEDS; seed++) {
    const game = new Game(
      {
        onShuffle: () => {
          shuffles++
        },
        onClear: (_cells, _kind, combo) => {
          comboSum += combo
          comboCount++
          if (combo > maxCombo) maxCombo = combo
        },
      },
      seed,
      geom,
    )
    // Without this the run stops the moment it crosses level 1's goal, so the
    // board would be measured through the very curve the second table is meant
    // to evaluate — and every score would be a truncated level opening rather
    // than a full move budget.
    //
    // This sets the goal itself, not `target`: completion is decided by the
    // goal now, and the two were quietly allowed to disagree while this script
    // still moved only the old field.
    game.goal = { kind: 'score', need: Number.POSITIVE_INFINITY }
    game.target = Number.POSITIVE_INFINITY

    for (let turn = 0; turn < MOVES_PER_LEVEL && game.status === 'playing'; turn++) {
      offeredSum += findMoves(game.geom, game.grid).length
      const move = bestMove(game)
      if (!move) {
        stalled++
        break
      }
      game.drag(move.a, move.b)
      if (!settle(game)) {
        stalled++
        break
      }
      turns++
    }
    pointsSum += game.score
    totals.push(game.score)
  }
  totals.sort((x, y) => x - y)
  const at = (q: number) => totals[Math.min(totals.length - 1, Math.floor(totals.length * q))] ?? 0

  return {
    label,
    cell: cellSizeOn(geom),
    blocks: geom.cells,
    screenUse: screenUse(geom),
    movesOffered: offeredSum / Math.max(1, turns),
    pointsPerMove: pointsSum / Math.max(1, turns),
    meanCombo: comboSum / Math.max(1, comboCount),
    maxCombo,
    shufflesPer100: (shuffles / Math.max(1, turns)) * 100,
    medianRun: at(0.5),
    p90Run: at(0.9),
    stalled,
  }
}

const CANDIDATES: Array<[number, number, number]> = []
for (const cols of [6, 7, 8]) {
  for (const rows of [7, 8, 9, 10]) {
    for (const kinds of [5, 6]) CANDIDATES.push([cols, rows, kinds])
  }
}

const rows: Report[] = CANDIDATES.map(([c, r, k]) =>
  evaluate(makeGeom(c, r, k), `${c}x${r} / ${k}`),
)

const header = [
  'board'.padEnd(11),
  'cell'.padStart(6),
  'blocks'.padStart(7),
  'screen'.padStart(7),
  'moves'.padStart(7),
  'pts/mv'.padStart(8),
  'combo'.padStart(6),
  'max'.padStart(4),
  'shuf%'.padStart(6),
  'med run'.padStart(8),
  'p90 run'.padStart(8),
  'stall'.padStart(6),
].join(' ')
console.log(header)
console.log('-'.repeat(header.length))
for (const r of rows) {
  console.log(
    [
      r.label.padEnd(11),
      `${r.cell.toFixed(0)}px`.padStart(6),
      String(r.blocks).padStart(7),
      `${(r.screenUse * 100).toFixed(0)}%`.padStart(7),
      r.movesOffered.toFixed(1).padStart(7),
      r.pointsPerMove.toFixed(0).padStart(8),
      r.meanCombo.toFixed(2).padStart(6),
      String(r.maxCombo).padStart(4),
      r.shufflesPer100.toFixed(1).padStart(6),
      String(Math.round(r.medianRun)).padStart(8),
      String(Math.round(r.p90Run)).padStart(8),
      String(r.stalled).padStart(6),
    ].join(' '),
  )
}

console.log()
console.log(`A cell under ${MIN_TOUCH}px is below the minimum comfortable touch target.`)

// ---------------------------------------------------------------------------
// Second question: given the shipping board, what target curve keeps a run
// climbing instead of stalling out early?
//
// The honest evidence here is `runToEnd`, which plays whole runs and reports
// the level each one died on. An earlier version of this script derived a
// "wall" from the MEAN points per move and called any target above it
// unwinnable. A mean is not a bound — half of all runs beat it — so it labelled
// levels unreachable that a good share of seeds actually cleared. The only line
// worth calling a wall is one that even strong play falls short of, so it is
// taken from the p90 run instead, and the simulated distribution is what
// justifies the curve.
// ---------------------------------------------------------------------------

/**
 * Plays to game over and reports the level the run died on.
 *
 * `moveBonus` says whether the curve being tested also grants extra moves as
 * levels climb. The old curve did not, so simulating it with the new grant
 * would credit the target change with gains that came from the moves.
 */
function runToEnd(seed: number, base: number, step: number, moveBonus: boolean): number {
  const game = new Game({}, seed, BOARD)
  const target = (level: number) => base + (level - 1) * step

  // The curve under test replaces the score goal and nothing else. Writing it
  // into `target` is not enough — a level is finished when `goal.need` is met,
  // and `target` has not decided that since levels grew goals of their own. It
  // was still being set here, so every row of the table below played the
  // shipping goals and reported the same number, which looks like a stable
  // curve and is actually a sweep that stopped sweeping.
  const applyCurve = (): void => {
    if (game.goal.kind !== 'score') return
    game.goal = { kind: 'score', need: target(game.level) }
    game.target = game.goal.need
  }

  applyCurve()
  game.moves = MOVES_PER_LEVEL

  for (let guard = 0; guard < 400; guard++) {
    if (game.status === 'gameOver') break
    if (game.status === 'levelComplete') {
      game.nextLevel()
      applyCurve()
      game.moves = moveBonus ? movesForLevel(game.level) : MOVES_PER_LEVEL
      continue
    }
    const move = bestMove(game)
    if (!move) break
    game.drag(move.a, move.b)
    if (!settle(game)) break
  }
  return game.level
}

const shipping = rows.find(
  (r) => r.label === `${BOARD.cols}x${BOARD.rows} / ${BOARD.kinds}`,
)
if (!shipping) {
  throw new Error(
    `BOARD is ${BOARD.cols}x${BOARD.rows}/${BOARD.kinds}, which is not in the candidate grid — ` +
      'add it before reading the progression table, or the numbers below describe nothing.',
  )
}

console.log()
console.log(
  `Shipping board ${BOARD.cols}x${BOARD.rows}/${BOARD.kinds} over ${MOVES_PER_LEVEL} moves: ` +
    `the middle run scores ${Math.round(shipping.medianRun)}, a strong one ` +
    `${Math.round(shipping.p90Run)}. Half of all runs beat the median, so only the ` +
    'p90 line is worth calling a wall.',
)
console.log()
console.log(
  [
    'base'.padStart(6),
    'step'.padStart(6),
    '+moves'.padStart(7),
    'mean lvl'.padStart(9),
    'p10'.padStart(5),
    'p90'.padStart(5),
    'hard wall'.padStart(10),
  ].join(' '),
)
console.log('-'.repeat(53))

for (const [base, step, moveBonus] of [
  [1200, 900, false], // the curve this game shipped with, simulated as it shipped
  [1600, 200, true],
  [1800, 200, true],
  [1800, 250, true],
  [2000, 250, true],
  [2200, 250, true],
] as Array<[number, number, boolean]>) {
  const levels: number[] = []
  for (let seed = 1; seed <= 40; seed++) levels.push(runToEnd(seed, base, step, moveBonus))
  levels.sort((a, b) => a - b)
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length

  // The first level a p90 run still cannot clear, scaled for any extra moves.
  const perMoveStrong = shipping.p90Run / MOVES_PER_LEVEL
  let wall = 1
  while (
    wall < 99 &&
    base + (wall - 1) * step <= perMoveStrong * (moveBonus ? movesForLevel(wall) : MOVES_PER_LEVEL)
  ) {
    wall++
  }

  console.log(
    [
      String(base).padStart(6),
      String(step).padStart(6),
      (moveBonus ? 'yes' : 'no').padStart(7),
      mean.toFixed(1).padStart(9),
      String(levels[Math.floor(levels.length * 0.1)] ?? 0).padStart(5),
      String(levels[Math.floor(levels.length * 0.9)] ?? 0).padStart(5),
      (wall >= 99 ? 'none' : String(wall)).padStart(10),
    ].join(' '),
  )
}

// ---------------------------------------------------------------------------
// Third question: are the goals that are not about score actually clearable?
//
// A score goal is measurable against points per move, which the first table
// already reports. A colour goal and a power goal are not: how many gems of one
// colour a board gives up, and how often a four or five forms, are properties
// of the board that no amount of reasoning about the score curve reveals. They
// were set from an argument about what felt reasonable, which is exactly the
// kind of number this script exists to replace.
//
// Each level is played on its own, from a fresh board, with its own move
// budget. That is a simplification — a level in a real run starts on a board
// the previous level left behind — but it is the same one the first table
// makes, and it is the comparison between goal kinds that matters here.
// ---------------------------------------------------------------------------

interface GoalProbe {
  level: number
  kind: string
  need: number
  /** Share of seeds that met the goal inside the level's move budget. */
  cleared: number
  /** Median share of the goal reached, whether or not it was met. */
  medianReached: number
  movesUsed: number
}

function probeGoal(level: number): GoalProbe {
  const goal = goalForLevel(level, BOARD.kinds)
  const budget = movesForLevel(level)
  let clears = 0
  let movesSum = 0
  const reached: number[] = []

  for (let seed = 1; seed <= SEEDS; seed++) {
    const game = new Game({}, seed + level * 1000, BOARD)
    // Drop the run straight onto the level under test: the goal, its budget,
    // and a board that owes nothing to how the previous level ended.
    game.goal = goal
    game.goalDone = 0
    game.levelStartScore = 0
    game.moves = budget

    let used = 0
    for (let turn = 0; turn < budget && game.status === 'playing'; turn++) {
      const move = bestMove(game)
      if (!move) break
      game.drag(move.a, move.b)
      if (!settle(game)) break
      used++
    }
    movesSum += used
    const share = Math.min(1, game.progress / goal.need)
    reached.push(share)
    if (game.status === 'levelComplete' || game.progress >= goal.need) clears++
  }

  reached.sort((a, b) => a - b)
  return {
    level,
    kind: goal.kind,
    need: goal.need,
    cleared: clears / SEEDS,
    medianReached: reached[Math.floor(reached.length / 2)] ?? 0,
    movesUsed: movesSum / SEEDS,
  }
}

console.log()
console.log('Each level played alone on a fresh board, with its own move budget.')
console.log()
console.log(' level  goal     need  cleared  median reached  moves used')
console.log('------------------------------------------------------------')
for (const level of [1, 2, 3, 4, 5, 6, 9, 11, 15]) {
  const probe = probeGoal(level)
  console.log(
    [
      String(probe.level).padStart(6),
      probe.kind.padEnd(7),
      String(probe.need).padStart(6),
      `${(probe.cleared * 100).toFixed(0)}%`.padStart(8),
      `${(probe.medianReached * 100).toFixed(0)}%`.padStart(15),
      probe.movesUsed.toFixed(1).padStart(11),
    ].join(' '),
  )
}
