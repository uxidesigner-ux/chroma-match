import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Game } from './game.ts'
import { royalMission, type RoyalShape } from './royal.ts'
import { findMatches, findMoves, applyGravity, shuffleBoard } from './board.ts'
import { makeGeom } from './types.ts'
import { makeRng } from './rng.ts'

const geom = makeGeom(9, 9, 4)
function settle(game: Game) {
  for (let i = 0; i < 4000 && game.phaseKind !== 'idle'; i++) game.update(1 / 60)
  assert.equal(game.phaseKind, 'idle', 'animation must terminate')
}

test('private royal stage inputs are bounded and deterministic without changing authored mission tables', () => {
  const input = {level: 20, shape: 'courtyard' as const, difficulty: 'hard' as const, seed: 7}
  assert.deepEqual(royalMission(input, geom), royalMission(input, geom))
  assert.equal(royalMission({level: NaN, moves: Infinity, obstacleDensity: NaN}, geom).level, 1)
  assert.equal(royalMission({level: -30, moves: 500}, geom).moves, 99)
  assert.equal(royalMission({level: 9999}, geom).level, 999)
  const easy = royalMission({...input, difficulty: 'easy'}, geom)
  const hard = royalMission(input, geom)
  assert.ok(easy.moves > hard.moves)
  assert.ok(easy.goal.need < hard.goal.need)
  assert.ok(royalMission({level: 20}, geom).obstacles.length > royalMission({level: 1}, geom).obstacles.length)
})

test('all royal geometries start with a legal move, no existing matches and no gems in cutouts', () => {
  for (const size of [makeGeom(6,9,5), geom]) for (const shape of ['rectangle', 'courtyard', 'bridge', 'auto'] as RoyalShape[]) {
    for (const level of [1, 4, 7, 15, 30, 100]) for (const density of [0, .15, .4]) {
      const game = new Game({}, 1, size)
      game.startRoyal({level, shape, obstacleDensity: density})
      assert.equal(findMatches(size, game.grid, game.rules).length, 0)
      assert.ok(findMoves(size, game.grid, game.rules).length, `${shape}, ${level}, ${density}`)
      assert.equal(game.grid.filter(Boolean).length, size.cells - game.terrain.voidCells.size)
      for (const i of game.terrain.voidCells) assert.equal(game.grid[i], null)
      assert.equal(game.royalRemaining, game.royal!.obstacles.length)
    }
  }
})

test('cutouts and anchored obstacles survive gravity and shuffle on a courtyard board', () => {
  const game = new Game({}, 1, geom)
  game.startRoyal({level: 16, shape: 'courtyard', obstacleDensity: .25})
  const fixed = game.royal!.obstacles.map(o => [o.cell, game.grid[o.cell]] as const)
  const shaped = {...geom, voidCells: game.terrain.voidCells}
  const empty = game.grid.findIndex(g => g && !g.durability)
  game.grid[empty] = null
  applyGravity(shaped, game.grid, makeRng(14))
  shuffleBoard(shaped, game.grid, makeRng(22), game.rules)
  for (const [cell, gem] of fixed) assert.equal(game.grid[cell], gem)
  for (const cell of shaped.voidCells) assert.equal(game.grid[cell], null)
  assert.ok(findMoves(geom, game.grid, game.rules).length)
})

test('ribbons take neighboring damage while ice requires a direct tool or power hit', () => {
  for (const kind of ['ribbon', 'ice'] as const) {
    const game = new Game({}, 1, geom)
    game.startRoyal({level: 8, obstacleDensity: 0})
    const cell = geom.idx(4, 4)
    const gem = game.grid[cell]!
    gem.kind = -1; gem.obstacle = kind; gem.durability = kind === 'ribbon' ? 1 : 2
    assert.ok(game.useItem('hammer', cell - 1))
    if (kind === 'ribbon') assert.equal(gem.durability, undefined)
    else assert.equal(gem.durability, 2)
  }
  const game = new Game({}, 1, geom)
  game.startRoyal({level: 8, obstacleDensity: 0})
  const cell = geom.idx(4, 4), gem = game.grid[cell]!
  gem.kind = -1; gem.obstacle = 'ice'; gem.durability = 2
  assert.ok(game.useItem('hammer', cell)); assert.equal(gem.durability, 1); settle(game)
  assert.ok(game.useItem('hammer', cell)); assert.equal(gem.durability, undefined); settle(game)
  assert.notEqual(game.grid[cell]?.id, gem.id)
})

test('royal victories require both objectives; next level regenerates terrain and restarting clears private state', () => {
  const game = new Game({}, 1, geom)
  game.startRoyal({level: 4, shape: 'auto', obstacleDensity: .15})
  game.score = game.goal.need
  assert.ok(game.useItem('shuffle', 0)); settle(game)
  assert.equal(game.status, 'playing', 'score alone cannot complete a board containing obstacles')
  game.startRoyal({level: 6, shape: 'auto', obstacleDensity: 0})
  game.score = game.goal.need
  assert.ok(game.useItem('shuffle', 0)); settle(game)
  assert.equal(game.status, 'levelComplete')
  assert.equal(game.upgradeDue, false)
  assert.ok(game.nextLevel())
  assert.equal(game.level, 7)
  assert.equal(game.royal?.shape, 'bridge')
  assert.equal(game.status, 'playing')
  game.restart(42, 9)
  assert.equal(game.royal, null)
  assert.equal(game.terrain.voidCells.size, 0)
})

test('retry during an active clear resets the whole private run silently and reproduces its board', () => {
  let hooks = 0
  const game = new Game({onLevelComplete: () => hooks++, onGameOver: () => hooks++, onPowerCreated: () => hooks++}, 1, geom)
  const options = {level: 15, difficulty: 'hard' as const, shape: 'bridge' as const, obstacleDensity: .4, moves: 5, seed: 2026}
  game.startRoyal(options)
  const snapshot = () => game.grid.map(g => g && [g.kind, g.power, g.durability, g.obstacle, g.ox, g.oy, g.clearing])
  const before = snapshot(), inventory = {...game.items}
  const first = game.grid.findIndex(g => g && !g.durability)
  assert.ok(game.useItem('bomb', first))
  assert.notEqual(game.phaseKind, 'idle')
  const oldHooks = hooks
  game.startRoyal(options)
  assert.equal(hooks, oldHooks, 'restarting must not award an old win or fire old power hooks')
  assert.deepEqual(snapshot(), before)
  assert.deepEqual(game.items, inventory)
  assert.equal(game.phaseKind, 'idle')
  assert.equal(game.status, 'playing')
  assert.equal(game.score, 0)
  assert.equal(game.moves, 5)
  assert.equal(game.log.length, 0)
  assert.equal(game.selected, null)
  assert.equal(game.grid.some(gem => gem?.clearing), false)
  assert.equal(game.strikes.length, 0)
  assert.equal(game.fusion, null)
})

test('overlapping special blast and neighboring clears damage an ice block once per wave', () => {
  const game = new Game({}, 1, geom)
  game.startRoyal({level: 7, obstacleDensity: 0, seed: 2026})
  const cell = geom.idx(4, 4), gem = game.grid[cell]!
  gem.kind = -1; gem.obstacle = 'ice'; gem.durability = 2
  // The bomb hits the ice itself and all four of its neighbors in one wave.
  assert.ok(game.useItem('bomb', cell))
  assert.equal(gem.durability, 1)
})
