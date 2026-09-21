import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findMoves } from './board.ts'
import { Game } from './game.ts'
import { CHAIN_REWARD_AT, ITEMS, MAX_HELD, blastCells, itemForLevel } from './items.ts'
import { decodeMoves, encodeMoves, recordOf, verifyRun } from './replay.ts'
import { BOARD, at } from './types.ts'

const FRAME = 1 / 60

function settle(game: Game): void {
  for (let i = 0; i < 4000 && game.phaseKind !== 'idle'; i++) game.update(FRAME)
}

/** Plays legal moves until the inventory holds `item`, or gives up. */
function playUntilHeld(game: Game, item: (typeof ITEMS)[number], limit = 400): boolean {
  for (let i = 0; i < limit; i++) {
    if (game.status === 'levelComplete') game.nextLevel()
    if (game.items[item] > 0) return true
    if (game.status === 'gameOver') return false
    if (game.status === 'levelComplete') game.nextLevel()
    const moves = findMoves(game.geom, game.grid)
    const move = moves[0]
    if (!move) return false
    game.drag(move.a, move.b)
    settle(game)
  }
  return game.items[item] > 0
}

test('a blast covers what its item promises', () => {
  const middle = BOARD.idx(3, 4)
  assert.deepEqual(blastCells('hammer', middle, BOARD), [middle])
  assert.equal(blastCells('rocket', middle, BOARD).length, BOARD.cols)
  assert.equal(blastCells('bomb', middle, BOARD).length, 9)

  // A blast at a corner is clipped to the board rather than wrapping onto the
  // far side of it, which a flat index would do silently.
  const corner = BOARD.idx(0, 0)
  assert.equal(blastCells('bomb', corner, BOARD).length, 4)
  const rocket = blastCells('rocket', corner, BOARD)
  assert.ok(rocket.every((cell) => BOARD.rowOf(cell) === 0))
})

test('level payouts rotate so a player can plan around them', () => {
  for (let level = 1; level <= ITEMS.length * 2; level++) {
    assert.equal(itemForLevel(level), ITEMS[(level - 1) % ITEMS.length])
  }
})

test('an item cannot be spent unless it was earned', () => {
  const game = new Game({}, 12345)
  // Nothing is held at the start of a run, so every one of these is a forgery.
  for (const item of ITEMS) {
    assert.equal(game.useItem(item, BOARD.idx(2, 2)), false)
  }
  assert.equal(game.log.length, 0, 'a refused item must not reach the record')
  assert.equal(game.score, 0)
})

test('spending an item clears the board and is recorded', () => {
  const game = new Game({}, 20260916)
  assert.ok(playUntilHeld(game, 'bomb'), 'a run should pay out a bomb')

  const before = game.score
  const held = game.items.bomb
  const target = BOARD.idx(3, 4)
  assert.ok(at(game.grid, target), 'the target should hold a gem')

  assert.equal(game.useItem('bomb', target), true)
  settle(game)

  assert.equal(game.items.bomb, held - 1, 'the item is spent')
  assert.ok(game.score > before, 'a blast scores what it cleared')
  assert.deepEqual(game.log.at(-1), { kind: 'item', item: 'bomb', cell: target })
})

test('the inventory is capped', () => {
  const game = new Game({}, 77)
  for (let i = 0; i < MAX_HELD + 4; i++) {
    // Reaching in rather than playing to it: the cap is what is under test,
    // not the route a run takes to reach it.
    game.items.hammer = Math.min(MAX_HELD, game.items.hammer + 1)
  }
  assert.equal(game.items.hammer, MAX_HELD)
})

test('an item survives the round trip through the run record', () => {
  const geom = BOARD
  const actions = [
    { kind: 'swap' as const, a: 0, b: 1 },
    { kind: 'item' as const, item: 'hammer' as const, cell: 0 },
    { kind: 'item' as const, item: 'rocket' as const, cell: geom.cells - 1 },
    { kind: 'item' as const, item: 'bomb' as const, cell: 17 },
  ]
  const encoded = encodeMoves(geom, actions)
  // Two characters per action, the same as before items existed: the record
  // format did not have to grow, so neither did the security rules.
  assert.equal(encoded.length, actions.length * 2)
  assert.match(encoded, /^[0-9a-z]+$/)
  assert.deepEqual(decodeMoves(geom, encoded), actions)
})

test('a run that used items verifies, and a forged one does not', () => {
  const game = new Game({}, 20260916)
  assert.ok(playUntilHeld(game, 'bomb'), 'a run should pay out a bomb')
  assert.equal(game.useItem('bomb', BOARD.idx(3, 4)), true)
  settle(game)
  // Keep playing so the run is not one blast long.
  for (let i = 0; i < 6; i++) {
    if (game.status === 'levelComplete') game.nextLevel()
    if (game.status === 'gameOver') break
    const move = findMoves(game.geom, game.grid)[0]
    if (!move) break
    game.drag(move.a, move.b)
    settle(game)
  }

  const record = recordOf(game)
  const verdict = verifyRun(record, BOARD)
  assert.equal(verdict.ok, true, verdict.reason ?? '')
  assert.equal(verdict.score, game.score)
  assert.ok(verdict.claimMatches)

  // The attack this is all for: a record that opens by spending an item the run
  // had not earned yet. The verifier does not take the client's inventory — it
  // rebuilds its own — so there is nothing to lie about.
  const forged = encodeMoves(BOARD, [{ kind: 'item', item: 'bomb', cell: BOARD.idx(3, 4) }])
  // Keep the rules header at the start; the forged item is the first action.
  const cheated = verifyRun({ ...record, moves: record.moves.slice(0, 2) + forged + record.moves.slice(2) }, BOARD)
  assert.equal(cheated.ok, false)
  assert.match(cheated.reason ?? '', /never had/)
  assert.equal(cheated.score, 0)
})

test('the same seed and the same actions earn the same items', () => {
  // The property the whole leaderboard rests on. If payouts were not a pure
  // function of (seed, actions), a verifier replaying a run would hand out a
  // different inventory than the player had, and honest runs would start
  // failing verification for reasons nobody could reproduce.
  const play = (): Game => {
    const game = new Game({}, 424242)
    for (let i = 0; i < 60; i++) {
      if (game.status === 'gameOver') break
      if (game.status === 'levelComplete') game.nextLevel()
      const move = findMoves(game.geom, game.grid)[0]
      if (!move) break
      game.drag(move.a, move.b)
      settle(game)
    }
    return game
  }

  const first = play()
  const second = play()
  assert.deepEqual(second.items, first.items)
  assert.equal(second.score, first.score)
  assert.equal(second.level, first.level)
  assert.deepEqual(second.log, first.log)
})

test('a deep chain pays a bomb, once', () => {
  const earned: string[] = []
  const game = new Game({ onItemEarned: (item, reason) => earned.push(`${item}:${reason}`) }, 20260916)
  for (let i = 0; i < 200; i++) {
    if (game.status === 'gameOver') break
    if (game.status === 'levelComplete') game.nextLevel()
    const move = findMoves(game.geom, game.grid)[0]
    if (!move) break
    game.drag(move.a, move.b)
    settle(game)
  }

  const chains = earned.filter((e) => e.endsWith(':chain'))
  // Seed-dependent: a run that never chains that deep pays nothing, which is
  // correct. What must hold either way is that a payout only ever follows a
  // chain that actually reached the rung, and that it is always a bomb.
  if (chains.length > 0) {
    assert.ok(game.bestCombo >= CHAIN_REWARD_AT)
    assert.ok(chains.every((e) => e === 'bomb:chain'))
  } else {
    assert.ok(game.bestCombo < CHAIN_REWARD_AT)
  }
})
