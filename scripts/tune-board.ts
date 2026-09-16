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
import { findMatches, findMoves, powerFor } from '../src/game/board.ts'
import type { Move } from '../src/game/board.ts'
import { Game, MOVES_PER_LEVEL, movesForLevel } from '../src/game/game.ts'
import { BOARD, makeGeom } from '../src/game/types.ts'
import type { Geom } from '../src/game/types.ts'

const FRAME = 1 / 60
const SEEDS = 60

/**
 * The portrait phone the board has to fit. Width comes from a 375pt viewport
 * less the page's 16px gutters; height is the stage as measured in the browser
 * at that size. The canvas insets the board by 10px on every side.
 */
const VIEWPORT = { boardBoxW: 343, boardBoxH: 562, pad: 10 }
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

/**
 * Stands in for a player who is paying attention but not solving the board:
 * takes the swap with the largest immediate clear, preferring one that leaves a
 * power gem. It does not look ahead to cascades, which no casual player does.
 */
function bestMove(game: Game): Move | null {
  const moves = findMoves(game.geom, game.grid)
  if (moves.length === 0) return null
  let best = moves[0] as Move
  let bestScore = -1
  for (const move of moves) {
    const a = game.grid[move.a] ?? null
    const b = game.grid[move.b] ?? null
    if (!a || !b) continue
    game.grid[move.a] = b
    game.grid[move.b] = a
    let score = 0
    for (const group of findMatches(game.geom, game.grid)) {
      score += group.cells.length
      const power = powerFor(group)
      if (power === 'rainbow') score += 8
      else if (power === 'bomb') score += 5
      else if (power !== 'none') score += 3
    }
    game.grid[move.a] = a
    game.grid[move.b] = b
    if (score > bestScore) {
      bestScore = score
      best = move
    }
  }
  return best
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
  clearRate: number
  stalled: number
}

function evaluate(geom: Geom, label: string): Report {
  let turns = 0
  let shuffles = 0
  let comboSum = 0
  let comboCount = 0
  let maxCombo = 0
  let offeredSum = 0
  let cleared = 0
  let stalled = 0
  let pointsSum = 0

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
    if (game.status === 'levelComplete') cleared++
  }

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
    clearRate: cleared / SEEDS,
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
  'clear%'.padStart(7),
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
      `${(r.clearRate * 100).toFixed(0)}%`.padStart(7),
      String(r.stalled).padStart(6),
    ].join(' '),
  )
}

console.log()
console.log(`A cell under ${MIN_TOUCH}px is below the minimum comfortable touch target.`)

// ---------------------------------------------------------------------------
// Second question: given the shipping board, what target curve keeps a run
// climbing instead of hitting a wall? Each level is independent — the same 25
// moves against a fresh target — so a target above what 25 moves can possibly
// score makes that level unwinnable no matter how well it is played.
// ---------------------------------------------------------------------------

/** Plays to game over and reports the level the run died on. */
function runToEnd(seed: number, base: number, step: number): number {
  const game = new Game({}, seed, BOARD)
  const target = (level: number) => base + (level - 1) * step
  game.target = target(1)

  for (let guard = 0; guard < 400; guard++) {
    if (game.status === 'gameOver') break
    if (game.status === 'levelComplete') {
      game.nextLevel()
      game.target = target(game.level)
      game.moves = movesForLevel(game.level)
      continue
    }
    const move = bestMove(game)
    if (!move) break
    game.drag(move.a, move.b)
    if (!settle(game)) break
  }
  return game.level
}

const perMove =
  rows.find((r) => r.label === `${BOARD.cols}x${BOARD.rows} / ${BOARD.kinds}`)?.pointsPerMove ?? 0
const ceiling = perMove * MOVES_PER_LEVEL

console.log()
console.log(
  `Shipping board ${BOARD.cols}x${BOARD.rows}/${BOARD.kinds}: a mid-strength run scores about ` +
    `${Math.round(ceiling)} in ${MOVES_PER_LEVEL} moves, so any target above that is a wall.`,
)
console.log()
console.log(
  ['base'.padStart(6), 'step'.padStart(6), 'mean lvl'.padStart(9), 'p10'.padStart(5), 'p90'.padStart(5), 'wall at'.padStart(8)].join(' '),
)
console.log('-'.repeat(43))

for (const [base, step] of [
  [1200, 900], // what ships today
  [1600, 200],
  [1800, 200],
  [1800, 250],
  [2000, 250],
  [2000, 300],
  [2200, 250],
  [2200, 350],
] as Array<[number, number]>) {
  const levels: number[] = []
  for (let seed = 1; seed <= 40; seed++) levels.push(runToEnd(seed, base, step))
  levels.sort((a, b) => a - b)
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length
  // The first level whose target exceeds what 25 moves can plausibly score.
  // Where the target first outruns what that level's move count can score.
  let wall = 1
  while (base + (wall - 1) * step <= perMove * movesForLevel(wall) && wall < 99) wall++
  console.log(
    [
      String(base).padStart(6),
      String(step).padStart(6),
      mean.toFixed(1).padStart(9),
      String(levels[Math.floor(levels.length * 0.1)] ?? 0).padStart(5),
      String(levels[Math.floor(levels.length * 0.9)] ?? 0).padStart(5),
      String(wall).padStart(8),
    ].join(' '),
  )
}
