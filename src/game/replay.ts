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
import { Game } from './game.ts'
import type { Action } from './game.ts'
import { ITEMS } from './items.ts'
import type { Item } from './items.ts'
import type { Geom } from './types.ts'
import { FUSION_HEADER, SQUARE_HEADER, VARIETY_HEADER, SUPPLIES_HEADER, CAMPAIGN_HEADER, ADVENTURE_HEADER } from './rules.ts'
import { MISSIONS, WORLD_MISSIONS, type Mission } from './campaign.ts'
import type { RulesVersion } from './rules.ts'
import { UPGRADES } from './variety.ts'

const FRAME = 1 / 60
/** Frames to give one swap before calling it stuck. A cascade is well under this. */
const SETTLE_LIMIT = 4000
/** Past this a submission is not a run, it is an invitation to burn server CPU. */
export const MAX_MOVES = 4000
/** Two base36 characters carry one action, so everything below has to fit. */
const PACK_LIMIT = 36 * 36
const FIRST_HEADER = Math.min(...[ADVENTURE_HEADER, CAMPAIGN_HEADER, SUPPLIES_HEADER, VARIETY_HEADER, SQUARE_HEADER, FUSION_HEADER].map(h => Number.parseInt(h, 36)))

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
  /** Optional rules header, then accepted actions in order, two base36 characters each. */
  moves: string
  /** What the client believes it scored. The verifier recomputes both anyway. */
  score: number
  level: number
  /** Which board the run was played on; a run from another shape is not comparable. */
  board: RunBoard
}

export function hasRunActions(record: RunRecord): boolean {
  if (rulesOf(record) >= 6) return record.moves.length > 4
  return record.moves.length > ([FUSION_HEADER, SQUARE_HEADER, VARIETY_HEADER, SUPPLIES_HEADER].some(h => record.moves.startsWith(h)) ? 2 : 0)
}

export function rulesOf(record: RunRecord): RulesVersion {
  // Ranking labels can be painted before asynchronous verification rejects a
  // malformed remote row. Detection must not take the entire list down.
  const moves = typeof record.moves === 'string' ? record.moves : ''
  return moves.startsWith(ADVENTURE_HEADER) ? 7 : moves.startsWith(CAMPAIGN_HEADER) ? 6 : moves.startsWith(SUPPLIES_HEADER) ? 5 : moves.startsWith(VARIETY_HEADER) ? 4 : moves.startsWith(SQUARE_HEADER) ? 3
    : moves.startsWith(FUSION_HEADER) ? 2 : 1
}
export function missionOf(record: RunRecord): Mission | null {
  const rules = rulesOf(record)
  if (rules < 6 || !/^[0-9a-z]{2}$/.test(record.moves.slice(2, 4))) return null
  return (rules === 6 ? MISSIONS : WORLD_MISSIONS)[Number.parseInt(record.moves.slice(2, 4), 36)] ?? null
}
function decodeRecord(geom: Geom, record: RunRecord): { rules: RulesVersion; actions: Action[]; mission: Mission | null } {
  const rules = rulesOf(record)
  const mission = missionOf(record)
  if (rules >= 6 && !mission) throw new Error('campaign mission is missing or unknown')
  if (mission && record.seed !== mission.seed) throw new Error('seed does not match the authored mission')
  const actions = decodeMoves(geom, rules >= 6 ? record.moves.slice(4) : rules > 1 ? record.moves.slice(2) : record.moves)
  if (rules < 4 && actions.some(a => a.kind === 'fever' || a.kind === 'upgrade' || a.kind === 'advance'))
    throw new Error('this rules version does not have variety actions')
  return { rules, actions, mission }
}

export function boardOf(geom: Geom): RunBoard {
  return { cols: geom.cols, rows: geom.rows, kinds: geom.kinds }
}

/**
 * How many boosters a record may claim.
 *
 * This is the one number in the verifier that is a policy rather than a proof.
 * A booster is bought with coins that live on the player's own device, so no
 * replay can confirm the purchase — the record simply asserts it. What the
 * verifier can do is bound the assertion: at most two, only at the very start,
 * and never more than the inventory cap allows. A forged record therefore buys
 * exactly what any honest player can buy with a few runs' coins, and nothing
 * beyond it. Everything after those first two codes is proved as before.
 */
export const BOOSTER_LIMIT = 2

/**
 * Where item codes start. Swaps occupy `cell * 4 + direction`, so the first
 * value past the last of those is free — on the shipping 6x9 board that is 216,
 * leaving the range up to 1295 for everything else two base36 characters can
 * hold. Items cost nothing in the record format because of it: a run with items
 * is the same length, the same alphabet, and passes the same security rules as
 * one without.
 */
function itemBase(geom: Geom): number {
  return geom.cells * 4
}

/** Booster codes sit immediately above the item codes, one per item. */
function boosterBase(geom: Geom): number {
  return itemBase(geom) + ITEMS.length * geom.cells
}

function packLimitFor(geom: Geom): number {
  return varietyBase(geom) + 2 + UPGRADES.length
}
const varietyBase = (geom: Geom): number => boosterBase(geom) + ITEMS.length

/**
 * Packs the action list into a string.
 *
 * Firestore cannot store an array of arrays, and a run of a few hundred actions
 * as JSON objects is bulky for something this regular. A swap is one cell index
 * plus the direction of its partner; an item is its index and the cell it was
 * aimed at. Both fit in two base36 characters.
 */
export function encodeMoves(geom: Geom, actions: readonly Action[]): string {
  if (packLimitFor(geom) > Math.min(PACK_LIMIT, FIRST_HEADER)) {
    throw new Error(`a ${geom.cols}x${geom.rows} board does not fit the two-character action encoding`)
  }
  let out = ''
  for (const action of actions) {
    let packed: number
    if (action.kind === 'advance') {
      packed = varietyBase(geom) + 1 + UPGRADES.length
    } else if (action.kind === 'fever') {
      packed = varietyBase(geom)
    } else if (action.kind === 'upgrade') {
      const index = UPGRADES.indexOf(action.upgrade)
      if (index < 0) throw new Error('unknown upgrade')
      packed = varietyBase(geom) + 1 + index
    } else if (action.kind === 'booster') {
      const index = ITEMS.indexOf(action.item)
      if (index < 0) throw new Error(`unknown item ${action.item}`)
      packed = boosterBase(geom) + index
    } else if (action.kind === 'item') {
      const index = ITEMS.indexOf(action.item)
      if (index < 0) throw new Error(`unknown item ${action.item}`)
      if (action.cell < 0 || action.cell >= geom.cells) {
        throw new Error(`item aimed off the board at ${action.cell}`)
      }
      packed = itemBase(geom) + index * geom.cells + action.cell
    } else {
      const dc = geom.colOf(action.b) - geom.colOf(action.a)
      const dr = geom.rowOf(action.b) - geom.rowOf(action.a)
      const dir = DIRECTIONS.findIndex(([x, y]) => x === dc && y === dr)
      if (dir < 0) throw new Error(`swap ${action.a}->${action.b} is not between neighbours`)
      packed = action.a * 4 + dir
    }
    out += packed.toString(36).padStart(2, '0')
  }
  return out
}

export function decodeMoves(geom: Geom, encoded: string): Action[] {
  if (encoded.length % 2 !== 0) throw new Error('move list is truncated')
  const base = itemBase(geom)
  const boosters = boosterBase(geom)
  const actions: Action[] = []
  for (let i = 0; i < encoded.length; i += 2) {
    const chunk = encoded.slice(i, i + 2)
    const n = i / 2 + 1
    if (!/^[0-9a-z]{2}$/.test(chunk)) throw new Error(`move ${n} is not valid base36`)
    const packed = Number.parseInt(chunk, 36)

    if (packed >= varietyBase(geom)) {
      const index = packed - varietyBase(geom)
      if (index === 0) actions.push({ kind: 'fever' })
      else if (index === 1 + UPGRADES.length) actions.push({ kind: 'advance' })
      else {
        const upgrade = UPGRADES[index - 1]
        if (!upgrade) throw new Error(`move ${n} names an action this version does not have`)
        actions.push({ kind: 'upgrade', upgrade })
      }
      continue
    }
    if (packed >= boosters) {
      const index = packed - boosters
      const item = ITEMS[index]
      if (!item) throw new Error(`move ${n} names an item this version does not have`)
      actions.push({ kind: 'booster', item: item as Item })
      continue
    }

    if (packed >= base) {
      const offset = packed - base
      const index = Math.floor(offset / geom.cells)
      const cell = offset % geom.cells
      const item = ITEMS[index]
      if (!item) throw new Error(`move ${n} names an item this version does not have`)
      actions.push({ kind: 'item', item: item as Item, cell })
      continue
    }

    const a = Math.floor(packed / 4)
    const step = DIRECTIONS[packed % 4] as readonly [number, number]
    const c = geom.colOf(a) + step[0]
    const r = geom.rowOf(a) + step[1]
    if (a >= geom.cells || !geom.inBounds(c, r)) {
      throw new Error(`move ${n} points off the board`)
    }
    actions.push({ kind: 'swap', a, b: geom.idx(c, r) })
  }
  return actions
}

/** Runs the clock until the board stops animating. */
function settle(game: Game): boolean {
  for (let i = 0; i < SETTLE_LIMIT; i++) {
    if (game.phaseKind === 'idle') return true
    game.update(FRAME)
  }
  return false
}

/** Same phase and eligibility checks for ranking and local restore. */
function replayAction(game: Game, action: Action): string | null {
  if (action.kind === 'upgrade') return game.chooseUpgrade(action.upgrade) ? null : 'claims an unavailable upgrade'
  if (action.kind === 'advance') return game.nextLevel() ? null : game.upgradeDue ? 'skips a required upgrade' : 'claims unavailable stage continuation'
  if (game.status === 'levelComplete') {
    if (game.rules >= 4) return game.upgradeDue ? 'skips a required upgrade' : 'comes before stage continuation'
    game.nextLevel()
  }
  if (game.status === 'gameOver') return 'comes after the run ended'
  if (action.kind === 'fever') return game.activateFever() ? null : 'claims unearned fever'
  if (action.kind === 'booster') return game.addBooster(action.item, BOOSTER_LIMIT) ? null : 'claims a booster the run may not have'
  if (action.kind === 'item') {
    if (!game.useItem(action.item, action.cell)) return `spends a ${action.item} the run never had`
  } else {
    if (!areNeighbours(game.geom, action.a, action.b)) return 'is not between neighbours'
    if (!isLegalSwap(game.geom, game.grid, action.a, action.b, game.rules)) return 'does not make a match'
    game.drag(action.a, action.b)
  }
  return settle(game) ? null : 'never settled'
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

  let actions: Action[]
  let rules: RulesVersion
  let mission: Mission | null
  try {
    ;({ actions, rules, mission } = decodeRecord(geom, record))
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'move list could not be decoded')
  }
  if (record.moves.length > MAX_MOVES * 2) return fail('move list is longer than any real run')

  const game = new Game({}, record.seed, geom, rules, mission?.id)
  for (let i = 0; i < actions.length; i++) {
    const reason = replayAction(game, actions[i]!)
    if (reason) return fail(`move ${i + 1} ${reason}`)
  }

  return {
    ok: true,
    reason: null,
    score: game.score,
    level: game.level,
    moves: actions.length,
    claimMatches: game.score === record.score && game.level === record.level,
  }
}

/**
 * Replays a record into a live game, so a suspended run can be picked up.
 *
 * A run is entirely determined by its seed and its actions, which means a
 * saved run needs no snapshot of the board, the score, the level, the move
 * count or the inventory — replaying the log rebuilds every one of them, and
 * rebuilds them *consistently*, which a hand-written snapshot of nine fields
 * would not stay for long. It is the same machinery the verifier uses, pointed
 * at the player's own game instead of a submission.
 *
 * Returns false if the record will not replay — a save from an older version of
 * the rules, or one that has been edited. A player losing a suspended run is
 * bad; a player resuming into a board that is not the one they left is worse.
 *
 * Everything that can be checked without playing is checked first, so the
 * common failures — a truncated string, a code this version has no action for,
 * a seed no board was dealt from — leave the game exactly as they found it. A
 * failure that only shows up mid-replay cannot be undone that cheaply, so it
 * leaves the game restarted on the record's seed; either way the caller has a
 * false and must not put that board in front of anyone.
 */
export function restoreRun(game: Game, record: RunRecord): boolean {
  const geom = game.geom
  if (!Number.isInteger(record.seed) || record.seed < 0 || record.seed > 0xffffffff) return false
  if (
    record.board.cols !== geom.cols ||
    record.board.rows !== geom.rows ||
    record.board.kinds !== geom.kinds
  ) {
    return false
  }

  let actions: Action[]
  let rules: RulesVersion
  let mission: Mission | null
  try {
    ;({ actions, rules, mission } = decodeRecord(geom, record))
  } catch {
    return false
  }
  if (record.moves.length > MAX_MOVES * 2) return false

  return game.withHooksMuted(() => {
    game.restart(record.seed, rules, mission?.id)
    for (const action of actions) {
      if (replayAction(game, action)) {
        game.restart(record.seed, rules, mission?.id)
        return false
      }
    }
    return true
  })
}

/** Builds the submission for a finished run. */
export function recordOf(game: Game): RunRecord {
  return {
    seed: game.seed,
    moves: (game.rules >= 6 ? (game.rules === 6 ? CAMPAIGN_HEADER : ADVENTURE_HEADER) + (game.rules === 6 ? MISSIONS : WORLD_MISSIONS).findIndex(m => m.id === game.mission?.id).toString(36).padStart(2, '0') : game.rules === 5 ? SUPPLIES_HEADER : game.rules === 4 ? VARIETY_HEADER : game.rules === 3 ? SQUARE_HEADER : game.rules === 2 ? FUSION_HEADER : '') + encodeMoves(game.geom, game.log),
    score: game.score,
    level: game.level,
    board: boardOf(game.geom),
  }
}
