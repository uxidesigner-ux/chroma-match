import { FirebaseLeaderboard } from './firebase.ts'
import { LocalLeaderboard } from './local.ts'
import type { Leaderboard } from './types.ts'

/**
 * Picks a board and never lets the choice break the game.
 *
 * Firebase is tried first, but a leaderboard is a side dish: a network that is
 * down, a browser blocking third-party storage, or a project that has not been
 * set up must all end with a playable game and a board that says where its
 * scores are going. So the shared board is probed once, and anything short of
 * a clean connection falls back to the local one.
 */
export async function openLeaderboard(): Promise<Leaderboard> {
  const shared = new FirebaseLeaderboard()
  try {
    await shared.top(1)
    return shared
  } catch {
    return new LocalLeaderboard()
  }
}

export { LocalLeaderboard, FirebaseLeaderboard }
