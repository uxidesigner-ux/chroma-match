import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, String(value)),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
}

const { PACKS, grantPack } = await import('./packs.ts')
const { PRICES, coins } = await import('./meta.ts')

beforeEach(() => store.clear())

/** '₩4,900' → 4900. The prices are written for reading, not for arithmetic. */
const won = (price: string): number => Number(price.replace(/[^\d]/g, ''))

test('the ladder gets better as it gets bigger', () => {
  // The whole reason to have three packs rather than one: each step has to be
  // a different decision, and the only thing making it different is value.
  let previousRate = 0
  for (const pack of PACKS) {
    const rate = pack.coins / won(pack.price)
    assert.ok(rate > previousRate, `${pack.id} is not better value than the pack below it`)
    previousRate = rate
  }
})

test('the stated bonus matches the actual one', () => {
  // The note on each row is the only reason a player would pick the big pack,
  // so a number that drifts from the price is the worst kind of wrong.
  const base = (PACKS[0]?.coins ?? 0) / won(PACKS[0]?.price ?? '1')
  for (const pack of PACKS) {
    const actual = Math.round(((pack.coins / won(pack.price) / base) - 1) * 100)
    assert.ok(Math.abs(actual - pack.bonus) <= 1, `${pack.id} claims +${pack.bonus}% but is +${actual}%`)
  }
})

test('exactly one pack is marked best value, and it is not the cheapest', () => {
  const marked = PACKS.filter((pack) => pack.best)
  assert.equal(marked.length, 1)
  assert.notEqual(marked[0]?.id, PACKS[0]?.id)
})

test('the smallest pack buys something worth buying', () => {
  // A pack that cannot afford the item it is sitting next to is a pack nobody
  // takes twice.
  assert.ok((PACKS[0]?.coins ?? 0) >= PRICES.bomb)
})

test('buying adds the coins, and an unknown pack adds nothing', () => {
  assert.equal(grantPack(PACKS[0]?.id ?? ''), PACKS[0]?.coins)
  assert.equal(coins(), PACKS[0]?.coins)
  assert.equal(grantPack('nope'), 0)
  assert.equal(coins(), PACKS[0]?.coins)
})
