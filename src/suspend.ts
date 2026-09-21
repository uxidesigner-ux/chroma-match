import type { RunRecord } from './game/replay.ts'
import { hasRunActions } from './game/replay.ts'

/**
 * A run put down, to be picked up later.
 *
 * What is stored is the run record itself — a seed and a string of actions —
 * and nothing else. Not the board, not the score, not the level, not the move
 * count, not the inventory: every one of those is rebuilt by replaying the
 * actions, and a replay cannot drift out of step with itself the way nine
 * hand-copied fields eventually would. It is the same record the leaderboard
 * verifies, so a resumed run is still a postable one.
 *
 * The level and score kept alongside it are for the button on the launch
 * screen and are never read back into the game. They are a label, not state.
 */

const KEY = 'chroma-match:suspended'

export interface Suspended {
  record: RunRecord
  /** For the Continue button. Recomputed by the replay, never trusted by it. */
  level: number
  score: number
  at: number
}

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function suspendedRun(): Suspended | null {
  const raw = read()
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const value = parsed as Partial<Suspended>
    const record = value.record
    // Shape-checked before it is handed to a replay: this is storage a player
    // can edit, and a malformed record should read as "nothing saved" rather
    // than throw on the launch screen.
    if (
      !record ||
      typeof record.seed !== 'number' ||
      typeof record.moves !== 'string' ||
      !record.board ||
      typeof record.board.cols !== 'number'
    ) {
      return null
    }
    return {
      record,
      level: Number(value.level) || 1,
      score: Number(value.score) || 0,
      at: Number(value.at) || 0,
    }
  } catch {
    return null
  }
}

export function suspendRun(record: RunRecord): void {
  // A run with no accepted actions is a board nobody has touched. Saving it
  // would put a Continue button on the launch screen that resumes nothing.
  if (!hasRunActions(record)) {
    clearSuspended()
    return
  }
  const payload: Suspended = { record, level: record.level, score: record.score, at: Date.now() }
  try {
    localStorage.setItem(KEY, JSON.stringify(payload))
  } catch {
    /* storage is full or blocked; the run is simply not kept */
  }
}

export function clearSuspended(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to do */
  }
}
