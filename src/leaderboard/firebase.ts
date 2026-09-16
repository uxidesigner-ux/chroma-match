import { verifyRun } from '../game/replay.ts'
import type { RunRecord } from '../game/replay.ts'
import { BOARD } from '../game/types.ts'
import { FIREBASE_CONFIG } from './firebase-config.ts'
import { cleanName } from './types.ts'
import type { Leaderboard, LeaderboardEntry, SubmitResult } from './types.ts'

/** Rows pulled per page. The launch screen shows twenty. */
const PAGE = 25
/** The player's own rows are sorted in the client, so this bounds that fetch. */
const OWN_LIMIT = 50

interface Connection {
  db: import('firebase/firestore').Firestore
  uid: string
}

/**
 * A leaderboard backed by Firestore.
 *
 * The Firebase SDK is loaded on demand: it is by far the largest thing this
 * game would ship, and a player who never opens the board should not pay for
 * it. Everything here is therefore behind dynamic imports, and a failure to
 * connect is reported rather than thrown so the caller can fall back to the
 * local board.
 *
 * Note what this class does NOT do: trust the server. Rows come back with the
 * run that produced them and are replayed by the viewer before they are
 * believed — see verify.ts. Until a Cloud Function can do that server-side,
 * the security rules only constrain the shape of a row, not its honesty.
 */
export class FirebaseLeaderboard implements Leaderboard {
  readonly isShared = true
  readonly label = 'Everyone'

  private connection: Promise<Connection> | null = null

  /** Signs in anonymously and opens Firestore, once, on first use. */
  private connect(): Promise<Connection> {
    this.connection ??= (async () => {
      const [{ initializeApp }, { getAuth, signInAnonymously }, { getFirestore }] =
        await Promise.all([
          import('firebase/app'),
          import('firebase/auth'),
          import('firebase/firestore'),
        ])

      const app = initializeApp(FIREBASE_CONFIG)
      const credential = await signInAnonymously(getAuth(app))
      return { db: getFirestore(app), uid: credential.user.uid }
    })()
    return this.connection
  }

  async top(limit: number): Promise<LeaderboardEntry[]> {
    const { db, uid } = await this.connect()
    const { collection, getDocs, orderBy, query, limit: take } = await import('firebase/firestore')

    // Ordered on one field only, so this needs no composite index.
    const snapshot = await getDocs(
      query(collection(db, 'runs'), orderBy('score', 'desc'), take(Math.min(limit, PAGE))),
    )
    return snapshot.docs.map((doc) => toEntry(doc.id, doc.data(), uid))
  }

  async best(): Promise<LeaderboardEntry | null> {
    const { db, uid } = await this.connect()
    const { collection, getDocs, query, where, limit: take } = await import('firebase/firestore')

    // Equality plus an ordering on another field would need a composite index,
    // so the player's own handful of rows are sorted here instead.
    const snapshot = await getDocs(
      query(collection(db, 'runs'), where('uid', '==', uid), take(OWN_LIMIT)),
    )
    const mine = snapshot.docs
      .map((doc) => toEntry(doc.id, doc.data(), uid))
      .sort((a, b) => b.score - a.score || a.at - b.at)
    return mine[0] ?? null
  }

  async submit(run: RunRecord, name: string): Promise<SubmitResult> {
    // Replayed here first: a run that will not survive the board's own
    // verification should never become a row for everyone else to filter out.
    const verdict = verifyRun(run, BOARD)
    if (!verdict.ok) {
      return { accepted: false, reason: 'That run could not be replayed.', rank: null, score: 0 }
    }

    const { db, uid } = await this.connect()
    const { addDoc, collection, serverTimestamp } = await import('firebase/firestore')

    await addDoc(collection(db, 'runs'), {
      uid,
      name: cleanName(name) || 'Anonymous',
      // The replayed score, never the claim the caller arrived with.
      score: verdict.score,
      level: verdict.level,
      seed: run.seed,
      moves: run.moves,
      board: run.board,
      at: serverTimestamp(),
    })

    const board = await this.top(PAGE)
    const rank = board.findIndex((entry) => entry.mine && entry.score === verdict.score) + 1
    return {
      accepted: true,
      reason: null,
      rank: rank > 0 ? rank : null,
      score: verdict.score,
    }
  }
}

/** Shapes a stored document into an entry, tolerating anything malformed. */
function toEntry(id: string, data: Record<string, unknown>, uid: string): LeaderboardEntry {
  const score = typeof data.score === 'number' ? data.score : 0
  const level = typeof data.level === 'number' ? data.level : 1
  const at = data.at as { toMillis?: () => number } | undefined

  // Only build a run when every part of it is present and the right type;
  // a half-formed one would be reported as a failed replay rather than as the
  // missing data it actually is.
  const board = data.board as Record<string, unknown> | undefined
  const run: RunRecord | null =
    typeof data.seed === 'number' &&
    typeof data.moves === 'string' &&
    board !== undefined &&
    typeof board.cols === 'number' &&
    typeof board.rows === 'number' &&
    typeof board.kinds === 'number'
      ? {
          seed: data.seed,
          moves: data.moves,
          score,
          level,
          board: { cols: board.cols, rows: board.rows, kinds: board.kinds },
        }
      : null

  return {
    id,
    name: typeof data.name === 'string' ? data.name : 'Anonymous',
    score,
    level,
    // A row written moments ago has no server timestamp yet; treat it as now.
    at: typeof at?.toMillis === 'function' ? at.toMillis() : Date.now(),
    mine: data.uid === uid,
    run,
  }
}
