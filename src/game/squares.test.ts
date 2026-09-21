import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createBoard, findMatches, findMoves, isLegalSwap, makeGem, powerFor } from './board.ts'
import { BOARD, makeGeom } from './types.ts'
import { makeRng } from './rng.ts'
import { Game } from './game.ts'
import { bestMove } from './autoplay.ts'
import { hasRunActions, recordOf, restoreRun, verifyRun } from './replay.ts'

const geom = makeGeom(6, 6, 5)
const base = () => Array.from({ length: geom.cells }, (_, i) => makeGem((geom.colOf(i) + geom.rowOf(i) * 2) % 4))
test('2×2 is one bomb group in v3, but is not a match in old replays', () => {
  const grid = base()
  const square = [7, 8, 13, 14]
  square.forEach(i => { grid[i] = makeGem(4) })
  const groups = findMatches(geom, grid)
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0]!.cells, square)
  assert.equal(powerFor(groups[0]!), 'bomb')
  assert.equal(findMatches(geom, grid, 2).length, 0)
  assert.equal(findMatches(geom, grid, 1).length, 0)
})
test('plus intersects once, overlapping squares merge, and wrapped edges never match', () => {
  const grid = base()
  ;[8, 13, 14, 15, 20].forEach(i => { grid[i] = makeGem(4) })
  const group = findMatches(geom, grid)[0]!
  assert.equal(group.cells.length, 5)
  assert.equal(powerFor(group), 'bomb')
  const wide = base()
  ;[7, 8, 9, 13, 14, 15].forEach(i => { wide[i] = makeGem(4) })
  assert.equal(findMatches(geom, wide).length, 1)
  assert.equal(findMatches(geom, wide)[0]!.cells.length, 6)
  const edge = base()
  ;[5, 6, 11, 12].forEach(i => { edge[i] = makeGem(4) })
  assert.equal(findMatches(geom, edge).filter(g => g.square).length, 0)
})
test('a square-only swap is discoverable and earns a bomb for one move', () => {
  const game = new Game({}, 42, geom)
  game.grid = base()
  ;[7, 8, 13, 15].forEach(i => { game.grid[i] = makeGem(4) })
  assert.equal(findMatches(geom, game.grid).length, 0)
  assert.ok(isLegalSwap(geom, game.grid, 14, 15, 3))
  assert.equal(isLegalSwap(geom, game.grid, 14, 15, 2), false)
  assert.ok(findMoves(geom, game.grid).some(m => m.a === 14 && m.b === 15))
  game.drag(14, 15)
  for (let i = 0; i < 4000 && game.phaseKind !== 'idle'; i++) game.update(1 / 60)
  assert.equal(game.moves, 24)
  assert.ok(game.grid.some(g => g?.power === 'bomb'))
})
test('v3 fresh boards contain neither free lines nor squares on 100 seeds', () => {
  for (let seed = 0; seed < 100; seed++) {
    const grid = createBoard(BOARD, makeRng(seed), 3)
    assert.equal(findMatches(BOARD, grid, 3).length, 0)
    assert.ok(findMoves(BOARD, grid, 3).length > 0)
  }
})
test('v3 actions replay and resume exactly, with a distinct non-action header', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const game = new Game({}, seed)
    assert.equal(hasRunActions(recordOf(game)), false)
    game.addBooster('bomb', 2)
    for (let turn = 0; turn < 30 && game.status !== 'gameOver'; turn++) {
      if (game.status === 'levelComplete') game.nextLevel()
      const move = bestMove(game)!
      if (turn === 3) game.useItem('bomb', 20)
      else game.drag(move.a, move.b)
      for (let frame = 0; frame < 4000 && game.phaseKind !== 'idle'; frame++) game.update(1 / 60)
    }
    const record = recordOf(game)
    assert.ok(record.moves.startsWith('zx'))
    assert.ok(verifyRun(record, BOARD).claimMatches)
    const restored = new Game()
    assert.ok(restoreRun(restored, record))
    assert.equal(restored.rules, 3)
    assert.deepEqual(recordOf(restored), record)
    assert.deepEqual(restored.grid.map(g => [g?.kind, g?.power]), game.grid.map(g => [g?.kind, g?.power]))
  }
})
