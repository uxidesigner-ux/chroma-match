import { STASH_LIMIT, coins, setCoins, setStash, stash } from './meta.ts'
import type { Item } from './game/items.ts'

/**
 * A reason to come back tomorrow.
 *
 * The shop has always had somewhere for coins to go and only one place for
 * them to come from — finishing a run. That makes every item a function of how
 * long you played today, which is a treadmill rather than a habit. A daily
 * reward pays for returning at all, and the streak pays for returning again.
 *
 * The day boundary is the device's local midnight, not UTC. A player in Seoul
 * whose "today" ends at 09:00 would experience a UTC reset as the reward
 * arriving mid-morning and again the next mid-morning, which is not a daily
 * reward as far as they are concerned.
 */

const DAY_KEY = 'chroma-match:daily-day'
const STREAK_KEY = 'chroma-match:daily-streak'

export interface DailyReward {
  day: number
  coins: number
  /** Handed out on the last day of the cycle, on top of the coins. */
  item?: Item
}

/**
 * Seven days, then it repeats from the top.
 *
 * The ladder is deliberately steep at the end: day seven is worth more than
 * days one to four together, which is what makes a missed Wednesday cost
 * something. The bomb on day seven is priced at 460 in the shop, so a full week
 * is worth roughly three runs of play — a bonus, not a bypass.
 */
export const DAILY_REWARDS: readonly DailyReward[] = [
  { day: 1, coins: 60 },
  { day: 2, coins: 80 },
  { day: 3, coins: 110 },
  { day: 4, coins: 150 },
  { day: 5, coins: 200 },
  { day: 6, coins: 260 },
  { day: 7, coins: 340, item: 'bomb' },
]

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* nothing to do; the streak simply will not persist */
  }
}

/** The local calendar day, as a sortable string. Exported so tests can pin it. */
export function dayOf(at: Date = new Date()): string {
  const year = at.getFullYear()
  const month = String(at.getMonth() + 1).padStart(2, '0')
  const day = String(at.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Whole days between two day strings. Negative if `b` is earlier than `a`. */
export function daysBetween(a: string, b: string): number {
  const first = Date.parse(`${a}T00:00:00`)
  const second = Date.parse(`${b}T00:00:00`)
  if (!Number.isFinite(first) || !Number.isFinite(second)) return Number.NaN
  return Math.round((second - first) / 86400000)
}

export interface DailyState {
  /** True when today's reward has not been taken yet. */
  available: boolean
  /** The day of the cycle today would be, 1..7. */
  day: number
  streak: number
  reward: DailyReward
}

/**
 * Where the streak stands, without changing it.
 *
 * A gap of exactly one day continues the streak; anything longer starts again
 * at day one. A negative gap means the clock went backwards — a traveller, or
 * somebody who set their date forward to claim twice and then set it back — and
 * is treated as a break rather than as a claim that never happened, because the
 * alternative rewards the trick.
 */
export function dailyState(at: Date = new Date()): DailyState {
  const today = dayOf(at)
  const last = read(DAY_KEY)
  const held = Math.max(0, Math.floor(Number(read(STREAK_KEY))) || 0)

  const gap = last ? daysBetween(last, today) : Number.NaN
  const claimedToday = gap === 0
  const continues = gap === 1

  const streak = claimedToday ? held : continues ? held + 1 : 1
  const day = ((streak - 1) % DAILY_REWARDS.length) + 1
  const reward = DAILY_REWARDS[day - 1] ?? DAILY_REWARDS[0]

  return {
    available: !claimedToday,
    day,
    streak,
    reward: reward as DailyReward,
  }
}

/** Takes today's reward, or returns null if it has already been taken. */
export function claimDaily(at: Date = new Date()): DailyState | null {
  const state = dailyState(at)
  if (!state.available) return null

  // Written before the payout, for the same reason the starter kit is: a
  // storage that accepts the flag and then fails hands out nothing, while the
  // opposite order hands out a reward every time the page is opened.
  write(DAY_KEY, dayOf(at))
  write(STREAK_KEY, String(state.streak))

  setCoins(coins() + state.reward.coins)
  if (state.reward.item) {
    const held = stash()
    held[state.reward.item] = Math.min(STASH_LIMIT, held[state.reward.item] + 1)
    setStash(held)
  }
  return state
}
