import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

/*
 * Same stub as meta.test.ts, and for the same reason: every accessor in
 * daily.ts is wrapped in try/catch, so without a localStorage the module
 * silently does nothing and would "pass" by never being exercised.
 */
const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, String(value)),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
}

const { DAILY_REWARDS, claimDaily, dailyState, dayOf, daysBetween } = await import('./daily.ts')
const { coins, stash } = await import('./meta.ts')

/** Local noon, so a timezone can never push a test date onto its neighbour. */
const at = (iso: string): Date => new Date(`${iso}T12:00:00`)

beforeEach(() => store.clear())

test('the day is the device’s local one, not UTC', () => {
  // A player in Seoul whose day ends at 09:00 UTC would experience a UTC reset
  // as the reward landing mid-morning, which is not a daily reward to them.
  assert.equal(dayOf(new Date(2026, 8, 17, 23, 30)), '2026-09-17')
  assert.equal(dayOf(new Date(2026, 8, 18, 0, 10)), '2026-09-18')
  assert.equal(daysBetween('2026-09-17', '2026-09-18'), 1)
  assert.equal(daysBetween('2026-02-28', '2026-03-01'), 1, 'month ends count as one day')
})

test('a reward is claimable once a day, and the streak climbs', () => {
  const first = claimDaily(at('2026-09-17'))
  assert.ok(first)
  assert.equal(first.day, 1)
  assert.equal(first.streak, 1)
  assert.equal(coins(), DAILY_REWARDS[0]?.coins)

  assert.equal(claimDaily(at('2026-09-17')), null, 'twice in one day pays once')
  assert.equal(coins(), DAILY_REWARDS[0]?.coins)

  const second = claimDaily(at('2026-09-18'))
  assert.ok(second)
  assert.equal(second.streak, 2)
  assert.equal(second.day, 2)
})

test('a missed day starts the streak again', () => {
  claimDaily(at('2026-09-17'))
  claimDaily(at('2026-09-18'))
  const after = claimDaily(at('2026-09-21'))
  assert.ok(after)
  assert.equal(after.streak, 1, 'three days later is a new streak, not a continued one')
  assert.equal(after.day, 1)
})

test('setting the clock backwards breaks the streak rather than rewinding it', () => {
  // The alternative rewards the trick: a negative gap would otherwise read as
  // "not claimed today" on a day that was already paid for.
  claimDaily(at('2026-09-18'))
  const back = claimDaily(at('2026-09-16'))
  assert.ok(back)
  assert.equal(back.streak, 1)
})

test('a full week pays the item as well as the coins', () => {
  const days = ['09-17', '09-18', '09-19', '09-20', '09-21', '09-22', '09-23']
  let last = null
  for (const day of days) last = claimDaily(at(`2026-${day}`))
  assert.ok(last)
  assert.equal(last.day, DAILY_REWARDS.length)
  assert.equal(last.reward.item, 'bomb')
  assert.equal(stash().bomb, 1)

  // And the eighth day starts the cycle again rather than paying day seven twice.
  const next = dailyState(at('2026-09-24'))
  assert.equal(next.day, 1)
  assert.equal(next.streak, 8)
})

test('state does not pay out', () => {
  dailyState(at('2026-09-17'))
  dailyState(at('2026-09-17'))
  assert.equal(coins(), 0)
  assert.equal(dailyState(at('2026-09-17')).available, true)
})
