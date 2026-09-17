import type { RunRecord } from '../game/replay.ts'
import type { AvatarSpec } from '../avatar/spec.ts'

/** What a viewer's own browser concluded about a row it is showing. */
export type EntryCheck = 'unchecked' | 'ok' | 'failed'

export interface LeaderboardEntry {
  id: string
  name: string
  score: number
  level: number
  /** Milliseconds since the epoch, stamped by whatever stored the row. */
  at: number
  /** True when this row belongs to the player looking at it. */
  mine: boolean
  /**
   * The face to draw beside the name, where one is known.
   *
   * The friends board knows every row's avatar because it is built from profile
   * documents. The public board does not: a leaderboard row carries a run, not
   * a player, and adding a field to that document would change a schema the
   * deployed security rules pin exactly — so the public board draws a face only
   * for the viewer's own row, which it can read from this device.
   */
  avatar?: AvatarSpec
  /**
   * The run behind the score.
   *
   * Carried on the row rather than kept server-side, because without a Cloud
   * Function nothing on the server can tell an earned score from a typed one.
   * Shipping the seed and the move list means every viewer's browser can
   * replay the row and decide for itself — see verify.ts.
   */
  run: RunRecord | null
}

export interface SubmitResult {
  accepted: boolean
  /** Why a submission was turned away, for the player. Never a raw error. */
  reason: string | null
  /** 1-based position on the board, or null when it did not place. */
  rank: number | null
  score: number
}

export interface Leaderboard {
  /**
   * Whether these scores are shared with anyone else. The launch screen says so
   * out loud: a board that only ever contains your own runs should not be
   * dressed up as a competition.
   */
  readonly isShared: boolean
  /** A short label for where the scores live, shown under the board. */
  readonly label: string
  top(limit: number): Promise<LeaderboardEntry[]>
  submit(run: RunRecord, name: string): Promise<SubmitResult>
  /** The player's best placed score, or null if they have not placed. */
  best(): Promise<LeaderboardEntry | null>
}

/** Trims a display name to something safe to render and store. */
export function cleanName(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16)
}

export const NAME_MAX = 16
