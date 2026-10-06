import assert from 'node:assert/strict'
import test from 'node:test'
import { emptyPlayer, levelFor, neededXp, settlePlayer, statsFor, resetStats, type Round } from './model.ts'
const round = (id = 'a', overrides: Partial<Round> = {}): Round => ({ id, mode: 'adventure', outcome: 'cleared', at: 20,
  mission: 'forest-1', rules: 7, actions: 1, items: { hammer: 0, rocket: 0, bomb: 0 }, clears: 1, created: 2, fusions: 1, chain: 3, ...overrides })
const begin = (s: ReturnType<typeof emptyPlayer>, id: string, at = 10) => { s.attempts[id] = { at, tracked: true, baseline: 0, paidClears: 0, finished: false, xp: 0 } }
test('growth thresholds carry overflow, cap the requirement rather than the level', () => {
  for (const [xp, level, progress, need] of [[0,1,0,100],[99,1,99,100],[100,2,0,110],[210,3,0,120],[500,5,40,140],[1000,8,90,170],[2000,13,150,200],[3000,18,150,200]] as const)
    assert.deepEqual(levelFor(xp), { level, xp: progress, need })
  assert.equal(neededXp(100000), 200)
  assert.equal(levelFor(NaN).level, 1)
  assert.equal(levelFor(-10).level, 1)
})
test('first clear, XP, level reward and statistics are idempotent; a genuine replay still earns XP', () => {
  const s = emptyPlayer(1); begin(s, 'a')
  assert.deepEqual(settlePlayer(s, 'a', round(), 900, 900, 40, true, true), { xp: 100, coins: 60, first: true })
  settlePlayer(s, 'a', round(), 900, 900, 40, true, true)
  assert.equal(s.growth.totalXp, 100); assert.equal(s.coins, 60); assert.equal(statsFor(s, 'adventure', false).rounds, 1)
  begin(s, 'b'); assert.equal(settlePlayer(s, 'b', round('b'), 900, 900, 40, true, true).xp, 40)
  assert.equal(s.growth.totalXp, 140); assert.equal(s.coins, 60)
})
test('natural failures earn partial XP, quitting does not; zero-item rounds remain in the denominator', () => {
  const s = emptyPlayer(1)
  begin(s, 'a'); settlePlayer(s, 'a', round('a', { outcome: 'failed', clears: 0, items: { hammer: 1, rocket: 0, bomb: 1 } }), 50, 100, 40, true, true)
  begin(s, 'b'); settlePlayer(s, 'b', round('b', { outcome: 'quit', clears: 0 }), 50, 100, 40, true, true)
  assert.equal(s.growth.totalXp, 7)
  const total = statsFor(s, 'adventure', false)
  assert.equal(total.rounds, 2); assert.equal(total.items.hammer + total.items.bomb, 2)
  assert.equal(total.noItems, 0)
})
test('endless checkpoints pay once and a later quit preserves earned levels, only terminal contributes one round', () => {
  const s = emptyPlayer(1); begin(s, 'a')
  const a = round('a', { mission: null, mode: 'free', clears: 2 })
  settlePlayer(s, 'a', a, 10, 10, 0, true, false)
  settlePlayer(s, 'a', a, 10, 10, 0, true, false)
  assert.equal(s.growth.totalXp, 80); assert.equal(statsFor(s, 'free', false).rounds, 0)
  settlePlayer(s, 'a', { ...a, outcome: 'quit' }, 5, 10, 0, true, true)
  assert.equal(s.growth.totalXp, 80); assert.equal(statsFor(s, 'free', false).rounds, 1)
})
test('recent windows are bounded independently by mode; reset cannot resurrect old attempts or change growth', () => {
  const s = emptyPlayer(1)
  for (let i = 0; i < 30; i++) { begin(s, `a${i}`, 10); settlePlayer(s, `a${i}`, round(`a${i}`), 1, 1, 40, true, true) }
  assert.equal(s.stats.recent.length, 20); assert.equal(statsFor(s, 'adventure', false).rounds, 30)
  begin(s, 'old', 10)
  const growth = structuredClone(s.growth), coins = s.coins
  resetStats(s, 100)
  settlePlayer(s, 'old', round('old', { clears: 0, outcome: 'quit' }), 0, 100, 0, true, true)
  assert.equal(statsFor(s, 'adventure', true).rounds, 0); assert.deepEqual(s.growth, growth); assert.equal(s.coins, coins)
})
test('untracked legacy and empty runs are not fabricated whole-round averages', () => {
  const s = emptyPlayer(1); begin(s, 'a'); s.attempts.a!.tracked = false
  settlePlayer(s, 'a', round(), 1, 1, 40, true, true)
  begin(s, 'b'); settlePlayer(s, 'b', round('b', { actions: 0, clears: 0, outcome: 'quit' }), 0, 1, 0, true, true)
  assert.equal(statsFor(s, 'adventure', false).rounds, 0)
})
