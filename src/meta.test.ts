import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

/*
 * meta.ts talks to localStorage, which bare Node does not have. Its accessors
 * are wrapped in try/catch, so without a stub every read returns empty and
 * every write disappears — the module would "pass" these tests by doing
 * nothing at all. The stub is what makes them mean something.
 */
const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, String(value)),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
}

const {
  STARTER_COINS,
  STARTER_ITEMS,
  PRICES,
  STASH_LIMIT,
  buy,
  coins,
  grantStarterKit,
  hasUsedItem,
  markItemUsed,
  payoutFor,
  setCoins,
  setStash,
  spendBoosters,
  stash,
  totalStashed,
} = await import('./meta.ts')

beforeEach(() => store.clear())

test('the starter kit is handed out once, ever', () => {
  const first = grantStarterKit()
  assert.ok(first)
  assert.equal(first.coins, STARTER_COINS)
  assert.equal(coins(), STARTER_COINS)
  for (const item of STARTER_ITEMS) assert.equal(stash()[item], 1)

  // The flag, not an empty stash, is what decides: a player who spends
  // everything and comes back is not a new player, and a kit that returns is a
  // renewable income rather than a welcome.
  assert.equal(grantStarterKit(), null)
  assert.equal(coins(), STARTER_COINS)

  setCoins(0)
  setStash({ hammer: 0, rocket: 0, bomb: 0 })
  assert.equal(grantStarterKit(), null, 'spending the kit must not earn another')
  assert.equal(coins(), 0)
})

test('the kit adds to what is already there', () => {
  setCoins(500)
  setStash({ hammer: 2, rocket: 0, bomb: 0 })
  const granted = grantStarterKit()
  assert.ok(granted)
  assert.equal(coins(), 500 + STARTER_COINS)
  assert.equal(stash().hammer, 3)
})

test('the first-use flag is sticky', () => {
  assert.equal(hasUsedItem(), false)
  markItemUsed()
  assert.equal(hasUsedItem(), true)
  markItemUsed()
  assert.equal(hasUsedItem(), true)
})

test('buying spends coins and stops at the limits', () => {
  setCoins(PRICES.hammer - 1)
  const poor = buy('hammer')
  assert.equal(poor.ok, false)
  assert.match(poor.reason ?? '', /more coins/)
  assert.equal(stash().hammer, 0, 'a refused purchase must not deliver')

  setCoins(PRICES.hammer)
  assert.equal(buy('hammer').ok, true)
  assert.equal(coins(), 0)
  assert.equal(stash().hammer, 1)

  setCoins(100000)
  setStash({ hammer: STASH_LIMIT, rocket: 0, bomb: 0 })
  const full = buy('hammer')
  assert.equal(full.ok, false)
  assert.match(full.reason ?? '', /cannot hold/)
  assert.equal(coins(), 100000, 'a refused purchase must not charge')
})

test('a hand-edited stash cannot produce nonsense counts', () => {
  // This is player-editable storage. A NaN or a negative here would spread into
  // every count on screen and into what a run starts holding.
  store.set('chroma-match:stash', JSON.stringify({ hammer: 'lots', rocket: -5, bomb: 999 }))
  const held = stash()
  assert.equal(held.hammer, 0)
  assert.equal(held.rocket, 0)
  assert.equal(held.bomb, STASH_LIMIT)

  store.set('chroma-match:stash', 'not json at all')
  assert.deepEqual(stash(), { hammer: 0, rocket: 0, bomb: 0 })

  store.set('chroma-match:coins', '-40')
  assert.equal(coins(), 0)
})

test('boosters come out of the stash, and never more than the cap', () => {
  setStash({ hammer: 1, rocket: 1, bomb: 1 })
  // Three passed, two taken: the cap is applied here as well as in the record,
  // so an over-long loadout cannot quietly drain the stash for items the run
  // was never allowed to carry.
  spendBoosters(['hammer', 'rocket', 'bomb'])
  assert.equal(totalStashed(), 1)

  setStash({ hammer: 0, rocket: 0, bomb: 0 })
  spendBoosters(['bomb'])
  assert.equal(totalStashed(), 0, 'spending what is not held must not go negative')
})

test('a payout rewards the run rather than the restart', () => {
  assert.ok(payoutFor(4000, 5) > payoutFor(4000, 1), 'levels count')
  assert.ok(payoutFor(8000, 1) > payoutFor(4000, 1), 'score counts more')
  assert.equal(payoutFor(0, 1), 0, 'a run that scored nothing pays nothing')
})

test('the shop is priced in runs', () => {
  // From `npm run tune`: a median run scores 4230 and dies around level 8.
  // The prices are a ladder built on that number, so this is the test that
  // notices when a change to either side quietly moves the economy.
  const run = payoutFor(4230, 8)
  const runs = (price: number) => price / run

  assert.ok(runs(PRICES.hammer) > 0.8 && runs(PRICES.hammer) < 1.4, 'a hammer is about a run')
  assert.ok(runs(PRICES.rocket) > 1.6 && runs(PRICES.rocket) < 2.4, 'a rocket is about two')
  assert.ok(runs(PRICES.bomb) > 3 && runs(PRICES.bomb) < 4.2, 'a bomb is three and a half')
  assert.ok(PRICES.hammer < PRICES.rocket && PRICES.rocket < PRICES.bomb, 'stronger costs more')

  // The starter kit should open the shop rather than skip it: enough for the
  // cheapest item, nowhere near the strongest.
  assert.ok(STARTER_COINS >= PRICES.hammer, 'the kit can afford a hammer')
  assert.ok(STARTER_COINS < PRICES.bomb, 'the kit cannot afford a bomb')
})
