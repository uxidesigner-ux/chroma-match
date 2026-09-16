import { verifyRun } from '../game/replay.ts'
import { BOARD } from '../game/types.ts'
import type { EntryCheck, LeaderboardEntry } from './types.ts'

/**
 * Checks a leaderboard row by replaying the run behind it.
 *
 * A row is only believed when the replay produces exactly the score the row
 * claims. Anything else — a run that will not replay, a score that does not
 * match, a board shape this version does not play — is 'failed'.
 *
 * A row with no run attached is 'unchecked' rather than 'failed': it is not
 * evidence of cheating, only of a backend that did not keep the moves.
 */
export function checkEntry(entry: LeaderboardEntry): EntryCheck {
  if (!entry.run) return 'unchecked'
  const verdict = verifyRun(entry.run, BOARD)
  if (!verdict.ok) return 'failed'
  return verdict.score === entry.score && verdict.level === entry.level ? 'ok' : 'failed'
}

/**
 * Replays a page of rows without blocking the frame.
 *
 * Verification is deliberately not done before the board is drawn. Replaying a
 * long run takes real work, and a leaderboard that waits for twenty of them
 * before showing anything feels broken. Rows go up immediately and settle into
 * a verdict a moment later, yielding to the event loop between each one.
 */
export async function checkEntries(
  entries: readonly LeaderboardEntry[],
  onResult: (entry: LeaderboardEntry, check: EntryCheck) => void,
): Promise<void> {
  for (const entry of entries) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    let check: EntryCheck
    try {
      check = checkEntry(entry)
    } catch {
      // A malformed row must not take the whole board down with it.
      check = 'failed'
    }
    onResult(entry, check)
  }
}
