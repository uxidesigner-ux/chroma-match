import { ALL_ITEMS as ITEMS } from './game/items.ts'
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
const GRANTED_KEY = 'chroma-match:granted'
const USED_ITEM_KEY = 'chroma-match:used-item'

/** The production wallet is transaction-backed; legacy functions remain for old saves/tests. */
export interface EconomyState { coins: number; stash: Inventory; starter: boolean; claims: Record<string, true> }
interface EconomyPort { read: () => EconomyState; change: (operation: (state: EconomyState) => void) => Promise<void> }
let economy: EconomyPort | null = null
export function bindEconomy(port: EconomyPort): void { economy = port }
export function rewardClaimed(id: string): boolean { return Boolean(economy?.read().claims[id]) }
export async function creditStored(amount: number, id?: string, item?: Item): Promise<boolean> {
  if (!economy) { setCoins(coins() + amount); if (item) { const s = stash(); s[item] = Math.min(STASH_LIMIT, (s[item] ?? 0) + 1); setStash(s) }; return true }
  let credited = false
  await economy.change(s => {
    if (id && s.claims[id]) return
    if (id) s.claims[id] = true
    s.coins += Math.max(0, Math.floor(amount))
    if (item) s.stash[item] = Math.min(STASH_LIMIT, (s.stash[item] ?? 0) + 1)
    credited = true
  })
  return credited
}
export async function buyStored(item: Item): Promise<PurchaseResult> {
  if (!economy) return buy(item)
  let result: PurchaseResult = { ok: false }
  try {
    await economy.change(s => {
      if ((s.stash[item] ?? 0) >= STASH_LIMIT) result = { ok: false, reason: 'full' }
      else if (s.coins < PRICES[item]) result = { ok: false, reason: 'coins' }
      else { s.coins -= PRICES[item]; s.stash[item] = (s.stash[item] ?? 0) + 1; result = { ok: true } }
    })
  } catch { result = { ok: false, reason: 'storage' } }
  return result
}
export async function grantStoredStarterKit(): Promise<{ coins: number; items: readonly Item[] } | null> {
  if (!economy) return grantStarterKit()
  let result: { coins: number; items: readonly Item[] } | null = null
  try {
    await economy.change(s => {
      if (s.starter) return
      s.starter = true; s.coins += STARTER_COINS
      for (const item of STARTER_ITEMS) s.stash[item] = Math.min(STASH_LIMIT, (s.stash[item] ?? 0) + 1)
      result = { coins: STARTER_COINS, items: STARTER_ITEMS }
    })
  } catch { /* No success is shown for a failed transaction. */ }
  return result
}

/**
 * What a first-time player is handed.
 *
 * Without it the opening of this game is three greyed-out item buttons, an
 * empty shop and a loadout screen whose entire content is an apology — a player
 * meets every part of the meta as an absence, and has to clear a level before
 * any of it turns on. The kit is small on purpose: enough to use an item on the
 * first board and to see the shop work, not enough to skip earning the rest.
 */
export const STARTER_COINS = 150
export const STARTER_ITEMS: readonly Item[] = ['hammer', 'bomb']

/** Nobody may start a run with more than this, however rich they are. */
export const BOOSTER_LIMIT = 2

/**
 * What each item costs, priced in runs rather than in coins.
 *
 * The sweep puts a median run at 4230 points around level 8, which `payoutFor`
 * turns into about 130 coins. The ladder is built from that: a hammer is about
 * a run, a rocket two, a bomb three and a half. The first numbers here were
 * 60/110/180 — a bomb every 1.4 runs — which made carrying two boosters the
 * default state rather than a decision, and quietly devalued earning items by
 * playing. meta.test.ts holds the ladder to those run-counts.
 */
export const PRICES: Record<Item, number> = {
  hammer: 130,
  rocket: 260,
  bomb: 460, bow: 260, shuffle: 130,
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
  if (economy) return economy.read().coins
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
  if (economy) return { ...economy.read().stash }
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
  for (const item of ITEMS) clean[item] = Math.max(0, Math.min(STASH_LIMIT, Math.floor(next[item] ?? 0)))
  write(STASH_KEY, JSON.stringify(clean))
}

export interface PurchaseResult {
  ok: boolean
  reason?: string
}

/** Buys one, or says why not. The caller re-reads the balance either way. */
export function buy(item: Item): PurchaseResult {
  const held = stash()
  if ((held[item] ?? 0) >= STASH_LIMIT) return { ok: false, reason: `You cannot hold more than ${STASH_LIMIT}.` }
  const price = PRICES[item]
  const balance = coins()
  if (balance < price) return { ok: false, reason: `${price - balance} more coins needed.` }

  setCoins(balance - price)
  held[item] = (held[item] ?? 0) + 1
  setStash(held)
  return { ok: true }
}

/** Moves a chosen loadout out of the stash. Called once, as a run starts. */
export function spendBoosters(chosen: readonly Item[]): void {
  const held = stash()
  for (const item of chosen.slice(0, BOOSTER_LIMIT)) {
    if ((held[item] ?? 0) > 0) held[item] = (held[item] ?? 0) - 1
  }
  setStash(held)
}

/**
 * Hands out the starter kit, once ever.
 *
 * Idempotent through a flag rather than through "is the stash empty?": a player
 * who spends everything and comes back is not a new player, and re-granting
 * would quietly make the kit a renewable income.
 *
 * Returns what was granted, or null if this device has had it.
 */
export function grantStarterKit(): { coins: number; items: readonly Item[] } | null {
  if (read(GRANTED_KEY) === '1') return null
  write(GRANTED_KEY, '1')

  // Written before the grant, so a storage that accepts the flag and then fails
  // cannot hand out a second kit on the next visit. The opposite order risks
  // granting forever; this one risks granting nothing, which is the safer half
  // of a storage failure nobody can do anything about anyway.
  setCoins(coins() + STARTER_COINS)
  const held = stash()
  for (const item of STARTER_ITEMS) held[item] = Math.min(STASH_LIMIT, (held[item] ?? 0) + 1)
  setStash(held)
  return { coins: STARTER_COINS, items: STARTER_ITEMS }
}

/** Whether this device has ever spent an item. Drives the first-run nudge. */
export function hasUsedItem(): boolean {
  return read(USED_ITEM_KEY) === '1'
}

export function markItemUsed(): void {
  write(USED_ITEM_KEY, '1')
}

export function totalStashed(held: Inventory = stash()): number {
  return ITEMS.reduce((sum, item) => sum + (held[item] ?? 0), 0)
}
