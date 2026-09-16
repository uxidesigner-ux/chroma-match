import { ITEMS } from './game/items.ts'
import type { Inventory, Item } from './game/items.ts'

/**
 * What survives a run: coins, and the items bought with them.
 *
 * This is the first state in the game that outlives the board, and it is kept
 * deliberately separate from everything the leaderboard reads. A run's score is
 * still decided entirely by its seed and its actions; what this file holds is
 * what the player brings *to* a run, which is a different question and one the
 * replay is told about explicitly — see BOOSTER_LIMIT and the run record.
 *
 * It lives in localStorage, which means it is per-device, clearable, and not
 * worth defending: someone editing their own coin balance is only cheating a
 * shop they own. The thing worth defending is the leaderboard, and that is
 * defended by the replay, not by this.
 */

const COINS_KEY = 'chroma-match:coins'
const STASH_KEY = 'chroma-match:stash'

/** Nobody may start a run with more than this, however rich they are. */
export const BOOSTER_LIMIT = 2

/** What each item costs in the shop. */
export const PRICES: Record<Item, number> = {
  hammer: 60,
  rocket: 110,
  bomb: 180,
}

/** How many of one item the shop will let you stockpile. */
export const STASH_LIMIT = 9

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return '' // private browsing, or storage disabled — the game still plays
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* nothing to do; it simply won't persist */
  }
}

export function coins(): number {
  const n = Number(read(COINS_KEY))
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export function setCoins(value: number): void {
  write(COINS_KEY, String(Math.max(0, Math.floor(value))))
}

/**
 * What a finished run pays out.
 *
 * Score is the bulk of it, so the way to earn is to play well rather than to
 * play often; the per-level bonus is there so a run that climbed and then died
 * badly still shows for the climb. Deliberately small against the prices above:
 * a bomb should be several decent runs, or the shop stops being a decision.
 */
export function payoutFor(score: number, level: number): number {
  return Math.floor(score / 90) + (level - 1) * 12
}

export function stash(): Inventory {
  const raw = read(STASH_KEY)
  const out: Inventory = { hammer: 0, rocket: 0, bomb: 0 }
  if (!raw) return out
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return out
    for (const item of ITEMS) {
      const n = Number((parsed as Record<string, unknown>)[item])
      // Clamped on the way in rather than trusted: this is player-editable
      // storage, and a NaN here would spread into every count on the screen.
      if (Number.isFinite(n) && n > 0) out[item] = Math.min(STASH_LIMIT, Math.floor(n))
    }
  } catch {
    /* corrupt or hand-edited: fall back to an empty stash rather than throwing */
  }
  return out
}

export function setStash(next: Inventory): void {
  const clean: Inventory = { hammer: 0, rocket: 0, bomb: 0 }
  for (const item of ITEMS) clean[item] = Math.max(0, Math.min(STASH_LIMIT, Math.floor(next[item])))
  write(STASH_KEY, JSON.stringify(clean))
}

export interface PurchaseResult {
  ok: boolean
  reason?: string
}

/** Buys one, or says why not. The caller re-reads the balance either way. */
export function buy(item: Item): PurchaseResult {
  const held = stash()
  if (held[item] >= STASH_LIMIT) return { ok: false, reason: `You cannot hold more than ${STASH_LIMIT}.` }
  const price = PRICES[item]
  const balance = coins()
  if (balance < price) return { ok: false, reason: `${price - balance} more coins needed.` }

  setCoins(balance - price)
  held[item] += 1
  setStash(held)
  return { ok: true }
}

/** Moves a chosen loadout out of the stash. Called once, as a run starts. */
export function spendBoosters(chosen: readonly Item[]): void {
  const held = stash()
  for (const item of chosen.slice(0, BOOSTER_LIMIT)) {
    if (held[item] > 0) held[item] -= 1
  }
  setStash(held)
}

export function totalStashed(held: Inventory = stash()): number {
  return ITEMS.reduce((sum, item) => sum + held[item], 0)
}
