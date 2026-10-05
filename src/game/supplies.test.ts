import assert from 'node:assert/strict'
import test from 'node:test'
import { Game } from './game.ts'
import { bestMove } from './autoplay.ts'
import { ITEMS, START_HELD, inventoryCap, startingInventory } from './items.ts'
import { BOARD } from './types.ts'
import { BOOSTER_LIMIT, encodeMoves, hasRunActions, recordOf, restoreRun, rulesOf, verifyRun } from './replay.ts'
import { CURRENT_RULES, SUPPLIES_HEADER, VARIETY_HEADER } from './rules.ts'

function settle(game: Game): void {
  for (let i = 0; i < 4000 && game.phaseKind !== 'idle'; i++) game.update(1 / 60)
  assert.equal(game.phaseKind, 'idle')
}
// Render identities/flash timers are not seeded puzzle state or part of a save.
const puzzle = (game: Game) => game.grid.map(gem => gem ? { kind: gem.kind, power: gem.power } : null)
function snapshot(game: Game) {
  return { record: recordOf(game), items: { ...game.items }, grid: puzzle(game), moves: game.moves,
    goal: game.goal, progress: game.progress, need: game.need, status: game.status, bonus: game.bonusRound,
    charge: game.feverCharge, turns: game.feverTurns, upgrades: { ...game.upgrades }, rules: game.rules }
}

test('every fresh game has three usable items of each kind without a stash or claimed booster', () => {
  const game = new Game({}, 18)
  assert.equal(game.rules, 5)
  assert.deepEqual(game.items, { hammer: 3, rocket: 3, bomb: 3 })
  assert.deepEqual(game.boosters, [])
  assert.deepEqual(game.log, [])
  const record = recordOf(game)
  assert.equal(record.moves, SUPPLIES_HEADER)
  assert.equal(rulesOf(record), CURRENT_RULES)
  assert.equal(hasRunActions(record), false)
  assert.equal(verifyRun(record, BOARD).claimMatches, true)
  assert.deepEqual(puzzle(game), puzzle(new Game({}, 18, BOARD, 4)), 'supply must not change the deal')
})

test('supplies are fresh values and restart grants exactly one supply, not an accumulation', () => {
  const game = new Game({}, 18), other = new Game({}, 18)
  game.items.hammer--
  assert.equal(other.items.hammer, START_HELD)
  assert.equal(startingInventory(5).hammer, START_HELD)
  game.restart(18)
  assert.deepEqual(game.items, other.items)
  game.restart(18)
  assert.deepEqual(game.items, { hammer: 3, rocket: 3, bomb: 3 })
})

test('each supplied item can be aimed immediately and spends no move', () => {
  for (const item of ITEMS) {
    const game = new Game({}, 18), moves = game.moves
    assert.equal(game.useItem(item, 0), true)
    assert.equal(game.items[item], START_HELD - 1)
    assert.equal(game.moves, moves)
    settle(game)
    assert.equal(verifyRun(recordOf(game), BOARD).claimMatches, true)
    assert.deepEqual(game.log[0], { kind: 'item', item, cell: 0 })
  }
})

test('optional boosters still add to the free supply with the existing two-item verification limit', () => {
  assert.equal(inventoryCap(5), START_HELD + BOOSTER_LIMIT)
  for (const item of ITEMS) {
    const game = new Game({}, 18)
    for (let i = 0; i < BOOSTER_LIMIT; i++) assert.ok(game.addBooster(item, BOOSTER_LIMIT))
    assert.equal(game.items[item], 5)
    assert.equal(game.addBooster(item, BOOSTER_LIMIT), false)
    assert.equal(verifyRun(recordOf(game), BOARD).claimMatches, true)
    const forged = { ...recordOf(game), moves: SUPPLIES_HEADER + encodeMoves(BOARD,
      Array.from({ length: BOOSTER_LIMIT + 1 }, () => ({ kind: 'booster' as const, item }))) }
    assert.equal(verifyRun(forged, BOARD).ok, false)
  }
})

test('resume restores spent supplies exactly, including an empty tray, without topping them up', () => {
  const game = new Game({}, 18)
  for (let i = 0; i < START_HELD; i++) { assert.ok(game.useItem('hammer', 0)); settle(game) }
  assert.equal(game.items.hammer, 0)
  assert.equal(game.useItem('hammer', 0), false)
  const kept = recordOf(game), resumed = new Game({}, 99)
  for (let i = 0; i < 3; i++) {
    assert.equal(restoreRun(resumed, kept), true)
    assert.deepEqual(snapshot(resumed), snapshot(game))
  }
  const forged = { ...kept, moves: kept.moves + encodeMoves(BOARD, [{ kind: 'item', item: 'hammer', cell: 0 }]) }
  assert.equal(verifyRun(forged, BOARD).ok, false)
})

test('real stage rewards cannot overflow either the legacy or supplied inventory cap', () => {
  for (const rules of [4, 5] as const) {
    const game = new Game({}, 18, BOARD, rules)
    assert.ok(game.addBooster('hammer', BOOSTER_LIMIT))
    assert.ok(game.addBooster('hammer', BOOSTER_LIMIT))
    for (let turn = 0; turn < 40 && game.status === 'playing'; turn++) {
      const move = bestMove(game); assert.ok(move)
      game.drag(move.a, move.b); settle(game)
    }
    assert.equal(game.status, 'levelComplete')
    assert.equal(game.items.hammer, inventoryCap(rules))
    assert.equal(verifyRun(recordOf(game), BOARD).claimMatches, true)
  }
})

test('all v1-v4 generations retain empty starts, earned/carried stock and exact save parity', () => {
  for (const rules of [1, 2, 3, 4] as const) {
    const old = new Game({}, 18, BOARD, rules)
    assert.deepEqual(old.items, { hammer: 0, rocket: 0, bomb: 0 })
    assert.equal(inventoryCap(rules), 3)
    assert.equal(old.useItem('hammer', 0), false)
    assert.ok(old.addBooster('hammer', BOOSTER_LIMIT))
    assert.ok(old.useItem('hammer', 0)); settle(old)
    const kept = recordOf(old), restored = new Game({}, 99)
    assert.equal(verifyRun(kept, BOARD).claimMatches, true)
    assert.equal(restoreRun(restored, kept), true)
    assert.deepEqual(snapshot(restored), snapshot(old))
  }
})

test('a supply action cannot be smuggled into an old header or followed by a mid-run booster', () => {
  const game = new Game({}, 18)
  assert.ok(game.useItem('hammer', 0)); settle(game)
  const record = recordOf(game)
  assert.equal(verifyRun({ ...record, moves: VARIETY_HEADER + record.moves.slice(2) }, BOARD).ok, false)
  assert.equal(verifyRun({ ...record, moves: record.moves + encodeMoves(BOARD, [{ kind: 'booster', item: 'hammer' }]) }, BOARD).ok, false)
  assert.equal(verifyRun({ ...record, moves: SUPPLIES_HEADER + record.moves }, BOARD).ok, false)
})

test('v5 supplies, upgrades, fever and bonus entry stay deterministic on twelve real runs', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const game = new Game({}, seed)
    assert.ok(game.addBooster('bomb', BOOSTER_LIMIT))
    for (let turn = 0; turn < 80 && game.status !== 'gameOver'; turn++) {
      if (game.status === 'levelComplete') {
        if (game.upgradeDue) assert.ok(game.chooseUpgrade(game.upgradeOptions[0]!))
        assert.ok(game.nextLevel())
      }
      if (game.feverCharge === 100) assert.ok(game.activateFever())
      if (turn % 13 === 0 && game.items.hammer) assert.ok(game.useItem('hammer', 0))
      else {
        const move = bestMove(game); assert.ok(move)
        game.drag(move.a, move.b)
      }
      settle(game)
    }
    const record = recordOf(game)
    assert.equal(verifyRun(record, BOARD).claimMatches, true, `seed ${seed}`)
    const restored = new Game()
    assert.equal(restoreRun(restored, record), true)
    assert.deepEqual(snapshot(restored), snapshot(game))
  }
})
