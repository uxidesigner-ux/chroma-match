import { session, uid as currentUid } from '../leaderboard/session.ts'
import { cleanName } from '../leaderboard/types.ts'
import type { LeaderboardEntry } from '../leaderboard/types.ts'
import type { RunRecord } from '../game/replay.ts'
import { codeFor, normaliseCode } from './code.ts'

/**
 * Who a player is to their friends, who their friends are, and their best run.
 *
 * The best run is stored on the profile as the *run record* — a seed and a
 * move list — not as a number. That is the whole reason it is allowed to be
 * here: the viewer replays it before it goes on the board, exactly as it
 * replays a stranger's row on the global one, so a friend who edits their
 * document gets dropped rather than believed.
 *
 * The alternative was to read the friends' rows out of `runs`, which is where
 * this started. It does not work: picking each friend's best needs an ordering
 * on score alongside an equality filter on uid, and that pair needs a composite
 * index. Without one the query comes back in no particular order, so a friend
 * with more runs than the fetch limit would show whichever score happened to be
 * returned — which is not their best, and is not wrong in any visible way.
 *
 * The friendship is one-directional and lives in the follower's own document:
 * you add a code, it goes in your list, and nothing is written to theirs. That
 * is not a social graph, but it is the whole of what a leaderboard needs, and
 * it means every write a client makes is to a document it owns — which is a
 * rule a security rule can actually express.
 */

/** Firestore's `in` operator takes at most 30 values, and one is the player. */
export const FRIEND_LIMIT = 24

export interface Player {
  uid: string
  name: string
  code: string
  photo: string
  /** Their best posted run, still in its verifiable form. */
  best: RunRecord | null
  /** When that run was recorded, for breaking ties the way the board does. */
  bestAt: number
}

function toPlayer(data: Record<string, unknown>): Player | null {
  const uid = typeof data.uid === 'string' ? data.uid : ''
  if (!uid) return null
  const best = data.best as Record<string, unknown> | undefined
  const board = best?.board as Record<string, unknown> | undefined

  // Only built when every part is present and the right type. A half-formed
  // record would be reported as a failed replay — i.e. as cheating — when what
  // it actually is, is missing data.
  const record: RunRecord | null =
    best !== undefined &&
    typeof best.seed === 'number' &&
    typeof best.moves === 'string' &&
    typeof best.score === 'number' &&
    typeof best.level === 'number' &&
    board !== undefined &&
    typeof board.cols === 'number' &&
    typeof board.rows === 'number' &&
    typeof board.kinds === 'number'
      ? {
          seed: best.seed,
          moves: best.moves,
          score: best.score,
          level: best.level,
          board: { cols: board.cols, rows: board.rows, kinds: board.kinds },
        }
      : null

  return {
    uid,
    name: typeof data.name === 'string' ? data.name : 'Anonymous',
    // Recomputed from the uid rather than read: the code is a pure function of
    // the account, so a stored one that disagrees is a stale or edited field.
    code: codeFor(uid),
    photo: typeof data.photo === 'string' ? data.photo : '',
    best: record,
    bestAt: typeof best?.at === 'number' ? best.at : 0,
  }
}

/** Writes the player's own profile, creating it the first time. */
export async function publishProfile(name: string, photo: string): Promise<void> {
  const { db } = await session()
  const uid = await currentUid()
  const { doc, setDoc } = await import('firebase/firestore')
  await setDoc(
    doc(db, 'players', uid),
    { uid, name: cleanName(name) || 'Anonymous', code: codeFor(uid), photo: photo.slice(0, 300) },
    { merge: true },
  )
}

/** The uids this player follows. Empty when there is no profile yet. */
export async function friendUids(): Promise<string[]> {
  const { db } = await session()
  const uid = await currentUid()
  const { doc, getDoc } = await import('firebase/firestore')
  const snapshot = await getDoc(doc(db, 'players', uid))
  const raw = snapshot.data()?.friends
  if (!Array.isArray(raw)) return []
  return raw.filter((value): value is string => typeof value === 'string').slice(0, FRIEND_LIMIT)
}

/** The profiles behind a list of uids, in the order asked for. */
export async function playersByUid(uids: readonly string[]): Promise<Player[]> {
  if (uids.length === 0) return []
  const { db } = await session()
  const { collection, documentId, getDocs, query, where } = await import('firebase/firestore')
  const snapshot = await getDocs(
    query(collection(db, 'players'), where(documentId(), 'in', uids.slice(0, FRIEND_LIMIT + 1))),
  )
  const found = new Map<string, Player>()
  for (const document of snapshot.docs) {
    const player = toPlayer(document.data())
    if (player) found.set(player.uid, player)
  }
  return uids.map((uid) => found.get(uid)).filter((player): player is Player => player !== undefined)
}

export interface AddResult {
  ok: boolean
  reason?: string
  player?: Player
}

/**
 * Follows the player behind a code.
 *
 * Every failure here is a sentence the player can act on, because "could not
 * add friend" tells somebody who fat-fingered one character nothing at all.
 * A code that matches more than one account is treated as no match: two hashes
 * landing on the same seven characters is rare, and quietly adding whichever
 * document sorted first would add a stranger.
 */
export async function addFriendByCode(raw: string): Promise<AddResult> {
  const code = normaliseCode(raw)
  if (!code) return { ok: false, reason: 'That is not a friend code.' }

  const { db } = await session()
  const me = await currentUid()
  if (code === codeFor(me)) return { ok: false, reason: 'That is your own code.' }

  const { arrayUnion, collection, doc, getDocs, limit, query, setDoc, where } = await import(
    'firebase/firestore'
  )
  const snapshot = await getDocs(
    query(collection(db, 'players'), where('code', '==', code), limit(2)),
  )
  if (snapshot.size !== 1) return { ok: false, reason: 'Nobody is using that code.' }

  const player = toPlayer(snapshot.docs[0]?.data() ?? {})
  // The stored code is what the query matched, but the uid is what gets
  // followed — so it is checked against the code it claims before being used.
  if (!player || player.code !== code) return { ok: false, reason: 'Nobody is using that code.' }

  const held = await friendUids()
  if (held.includes(player.uid)) return { ok: true, player }
  if (held.length >= FRIEND_LIMIT) {
    return { ok: false, reason: `You can follow ${FRIEND_LIMIT} friends at most.` }
  }

  await setDoc(doc(db, 'players', me), { uid: me, friends: arrayUnion(player.uid) }, { merge: true })
  return { ok: true, player }
}

export async function removeFriend(uid: string): Promise<void> {
  const { db } = await session()
  const me = await currentUid()
  const { arrayRemove, doc, setDoc } = await import('firebase/firestore')
  await setDoc(doc(db, 'players', me), { uid: me, friends: arrayRemove(uid) }, { merge: true })
}

/**
 * Records this run as the player's best, if it beats what is stored.
 *
 * Compared on the claimed score rather than a replayed one, because this is the
 * player's own run and it has already been through `verifyRun` on its way to
 * the leaderboard. What stops a hand-written document reaching anybody's screen
 * is the replay the *viewer* runs, not a check here.
 */
export async function publishBest(run: RunRecord): Promise<void> {
  const { db } = await session()
  const uid = await currentUid()
  const { doc, getDoc, setDoc } = await import('firebase/firestore')

  const held = toPlayer((await getDoc(doc(db, 'players', uid))).data() ?? {})
  if (held?.best && held.best.score >= run.score) return

  await setDoc(
    doc(db, 'players', uid),
    {
      uid,
      best: {
        seed: run.seed,
        moves: run.moves,
        score: run.score,
        level: run.level,
        board: run.board,
        at: Date.now(),
      },
    },
    { merge: true },
  )
}

/**
 * The friends board: one row per account, highest first.
 *
 * Every row carries the run behind it, so the caller replays them before they
 * are believed. A friend's number gets checked the same way a stranger's does,
 * which is the only reason it is worth putting on a screen next to your own.
 */
export function boardFrom(players: readonly Player[], me: string): LeaderboardEntry[] {
  return players
    .filter((player): player is Player & { best: RunRecord } => player.best !== null)
    .map((player) => ({
      // The uid is the row: one row per player, so it is stable across refreshes
      // in a way a document id would not be.
      id: player.uid,
      name: player.name,
      score: player.best.score,
      level: player.best.level,
      at: player.bestAt,
      mine: player.uid === me,
      run: player.best,
    }))
    .sort((a, b) => b.score - a.score || a.at - b.at)
}
