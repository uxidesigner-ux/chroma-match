import { coins, setCoins } from './meta.ts'

/**
 * Coin packs — the shop's other side, and the only thing here that is not real.
 *
 * Nothing charges anybody. There is no payment provider wired up, no receipt,
 * no entitlement: pressing Buy adds the coins and says, on the screen and in
 * the confirmation, that this is a prototype. That is a deliberate choice about
 * what is being tested. The question a storefront answers is whether the price
 * ladder reads as fair and whether the pack sizes match what players actually
 * run out of — and both of those can be answered by a checkout that does not
 * take money. Wiring a real one first would answer neither and would make every
 * balance change a refund problem.
 *
 * The ladder is the conventional one: the smallest pack is the worst value per
 * coin and the largest is the best, so the price of convenience is visible. The
 * middle pack is the one marked, because it is the one meant to be chosen.
 */

export interface Pack {
  id: string
  coins: number
  /** Shown as written. A prototype has no business formatting currencies. */
  price: string
  /** Coins per unit of currency, relative to the smallest pack. */
  bonus: number
  best?: boolean
}

export const PACKS: readonly Pack[] = [
  { id: 'pocket', coins: 600, price: '₩1,500', bonus: 0 },
  { id: 'pouch', coins: 2200, price: '₩4,900', bonus: 12, best: true },
  { id: 'chest', coins: 6000, price: '₩11,000', bonus: 36 },
]

/** Adds a pack's coins. Returns what was added, or 0 for an unknown pack. */
export function grantPack(id: string): number {
  const pack = PACKS.find((entry) => entry.id === id)
  if (!pack) return 0
  setCoins(coins() + pack.coins)
  return pack.coins
}
