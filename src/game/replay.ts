/**
 * Recording and verifying a run.
 *
 * A leaderboard that takes the client's word for a score is not a leaderboard —
 * anyone can open the console and post any number. This game can do better than
 * rate-limiting, because a run is fully determined by its seed and the swaps the
 * player made: the board is dealt from a seeded PRNG, every refill draws from
 * the same stream, and nothing else feeds it. So the client submits the seed and
 * the move list, and the server replays the run and keeps whatever score the
 * replay produces. A forged score is not rejected so much as ignored — the only
 * way to post a high score is to submit the moves that earn it.
 *
 * Both sides run this exact module, so the client can check its own submission
 * before sending it and see the same verdict the server will reach.
 */
import { areNeighbours, isLegalSwap } from './board.ts'
import type { Move } from './board.ts'
import { Game } from './game.ts'
import type { Geom } from './types.ts'

const FRAME = 1 / 60
/** Frames to give one swap before calling it stuck. A cascade is well under this. */
const SETTLE_LIMIT = 4000
/** Past this a submission is not a run, it is an invitation to burn server CPU. */
export const MAX_MOVES = 4000
/** Two base36 characters carry one move, so `cell * 4 + direction` must fit. */
const PACK_LIMIT = 36 * 36

/** Neighbour offsets, in the order their index is encoded. */
const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]

export interface RunBoard {
  cols: number
  rows: number
  kinds: number
}

export interface RunRecord {
  seed: number
  /** Accepted swaps in order, two base36 characters each. */
  moves: string
  /** What the client believes it scored. The verifier recomputes both anyway. */
  score: number
  level: number
  /** Which board the run was played on; a run from another shape is not comparable. */
  board: RunBoard
}

export function boardOf(geom: Geom): RunBoard {
  return { cols: geom.cols, rows: geom.rows, kinds: geom.kinds }
}

/**
 * Packs the move list into a string.
 *
 * Firestore cannot store an array of arrays, and a run of a few hundred moves as
 * JSON objects is bulky for something this regular. Each swap is one cell index
 * plus the direction of its partner, which fits in two base36 characters.
 */
export function encodeMoves(geom: Geom, moves: readonly Move[]): string {
  if (geom.cells * 4 > PACK_LIMIT) {
    throw new Error(`a ${geom.cols}x${geom.rows} board does not fit the two-character move encoding`)
  }
  let out = ''
  for (const { a, b } of moves) {
    const dc = geom.colOf(b) - geom.colOf(a)
    const dr = geom.rowOf(b) - geom.rowOf(a)
    const dir = DIRECTIONS.findIndex(([x, y]) => x === dc && y === dr)
    if (dir < 0) throw new Error(`swap ${a}->${b} is not between neighbours`)
    out += (a * 4 + dir).toString(36).padStart(2, '0')
  }
  return out
}

export function decodeMoves(geom: Geom, encoded: string): Move[] {
  if (encoded.length % 2 !== 0) throw new Error('move list is truncated')
  const moves: Move[] = []
  for (let i = 0; i < encoded.length; i += 2) {
    const chunk = encoded.slice(i, i + 2)
    if (!/^[0-9a-z]{2}$/.test(chunk)) throw new Error(`move ${i / 2 + 1} is not valid base36`)
    const packed = Number.parseInt(chunk, 36)
    const a = Math.floor(packed / 4)
    const step = DIRECTIONS[packed % 4] as readonly [number, number]
    const c = geom.colOf(a) + step[0]
    const r = geom.rowOf(a) + step[1]
    if (a >= geom.cells || !geom.inBounds(c, r)) {
      throw new Error(`move ${i / 2 + 1} points off the board`)
    }
    moves.push({ a, b: geom.idx(c, r) })
  }
  return moves
}

/** Runs the clock until the board stops animating. */
function settle(game: Game): boolean {
  for (let i = 0; i < SETTLE_LIMIT; i++) {
    if (game.phaseKind === 'idle') return true
    game.update(FRAME)
  }
  return false
}

export interface VerifyResult {
  /** Whether the run replays cleanly. A false here means the submission is junk. */
  ok: boolean
  /** Why it failed, for logging. Never shown to the player verbatim. */
  reason: string | null
  /** The authoritative score — what the replay produced, not what was claimed. */
  score: number
  level: number
  moves: number
  /** False when the client's claim disagrees with the replay: tampering, or a version skew. */
  claimMatches: boolean
}

/**
 * Replays a submitted run against the given board and returns what actually
 * happened. The caller should store `score` from here and never the claim.
 */
export function verifyRun(record: RunRecord, geom: Geom): VerifyResult {
  const fail = (reason: string): VerifyResult => ({
    ok: false,
    reason,
    score: 0,
    level: 0,
    moves: 0,
    claimMatches: false,
  })

  if (!Number.isInteger(record.seed) || record.seed < 0 || record.seed > 0xffffffff) {
    return fail('seed is not a 32-bit unsigned integer')
  }
  if (
    record.board.cols !== geom.cols ||
    record.board.rows !== geom.rows ||
    record.board.kinds !== geom.kinds
  ) {
    return fail('run was played on a different board than this leaderboard accepts')
  }

  let moves: Move[]
  try {
    moves = decodeMoves(geom, record.moves)
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'move list could not be decoded')
  }
  if (moves.length > MAX_MOVES) return fail('move list is longer than any real run')

  const game = new Game({}, record.seed, geom)
  for (let i = 0; i < moves.length; i++) {
    // The player can only have kept playing past a cleared level by continuing.
    if (game.status === 'levelComplete') game.nextLevel()
    if (game.status === 'gameOver') return fail(`move ${i + 1} comes after the run ended`)

    const move = moves[i] as Move
    if (!areNeighbours(geom, move.a, move.b)) return fail(`move ${i + 1} is not between neighbours`)
    // This is the load-bearing check: a fabricated move list cannot score,
    // because every swap in it has to be one the board would actually have taken.
    if (!isLegalSwap(geom, game.grid, move.a, move.b)) {
      return fail(`move ${i + 1} does not make a match`)
    }

    game.drag(move.a, move.b)
    if (!settle(game)) return fail(`move ${i + 1} never settled`)
  }

  return {
    ok: true,
    reason: null,
    score: game.score,
    level: game.level,
    moves: moves.length,
    claimMatches: game.score === record.score && game.level === record.level,
  }
}

/** Builds the submission for a finished run. */
export function recordOf(game: Game): RunRecord {
  return {
    seed: game.seed,
    moves: encodeMoves(game.geom, game.log),
    score: game.score,
    level: game.level,
    board: boardOf(game.geom),
  }
}
