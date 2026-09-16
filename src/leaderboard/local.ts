import { verifyRun } from '../game/replay.ts'
import type { RunRecord } from '../game/replay.ts'
import { BOARD } from '../game/types.ts'
import { cleanName } from './types.ts'
import type { Leaderboard, LeaderboardEntry, SubmitResult } from './types.ts'

const KEY = 'chroma-match:board'
const KEEP = 50

/**
 * A leaderboard that never leaves the browser.
 *
 * This is what runs before a backend is configured, and what the game falls
 * back to when one is unreachable. It deliberately runs the same verification
 * the server does: a run that would be rejected online is rejected here too, so
 * the flow a player sees offline is the flow they will see online rather than a
 * more forgiving stand-in that hides bugs until deploy day.
 */
export class LocalLeaderboard implements Leaderboard {
  readonly isShared = false
  readonly label = 'On this device only'

  private read(): LeaderboardEntry[] {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isEntry)
    } catch {
      // Corrupt or unavailable storage is not worth failing a page load over.
      return []
    }
  }

  private write(entries: LeaderboardEntry[]): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(entries.slice(0, KEEP)))
    } catch {
      /* private mode, or the quota is full; the run still counted this session */
    }
  }

  async top(limit: number): Promise<LeaderboardEntry[]> {
    return this.read()
      .sort((a, b) => b.score - a.score || a.at - b.at)
      .slice(0, limit)
  }

  async best(): Promise<LeaderboardEntry | null> {
    return (await this.top(KEEP)).find((entry) => entry.mine) ?? null
  }

  async submit(run: RunRecord, name: string): Promise<SubmitResult> {
    const verdict = verifyRun(run, BOARD)
    if (!verdict.ok) {
      return { accepted: false, reason: 'That run could not be replayed.', rank: null, score: 0 }
    }

    const entry: LeaderboardEntry = {
      id: `local-${run.seed}-${run.moves.length}-${Date.now()}`,
      name: cleanName(name) || 'Anonymous',
      score: verdict.score,
      level: verdict.level,
      at: Date.now(),
      mine: true,
    }

    const all = [...this.read(), entry].sort((a, b) => b.score - a.score || a.at - b.at)
    this.write(all)

    const rank = all.findIndex((e) => e.id === entry.id) + 1
    return {
      accepted: true,
      reason: null,
      rank: rank > 0 && rank <= KEEP ? rank : null,
      score: verdict.score,
    }
  }
}

function isEntry(value: unknown): value is LeaderboardEntry {
  if (typeof value !== 'object' || value === null) return false
  const e = value as Record<string, unknown>
  return (
    typeof e.id === 'string' &&
    typeof e.name === 'string' &&
    typeof e.score === 'number' &&
    typeof e.level === 'number' &&
    typeof e.at === 'number'
  )
}
