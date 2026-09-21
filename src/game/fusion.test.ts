import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findMatches, findMoves, isLegalSwap, makeGem } from './board.ts'
import { fusionClear, fusionKind } from './fusion.ts'
import { Game } from './game.ts'
import { bestMove } from './autoplay.ts'
import { hasRunActions, recordOf, restoreRun, verifyRun } from './replay.ts'
import { BOARD, makeGeom } from './types.ts'
import type { Grid, Power } from './types.ts'

const G = makeGeom(7, 7, 5)
const POWERS: Power[] = ['rowClear', 'colClear', 'bomb', 'rainbow']
const grid = (): Grid => Array.from({ length: G.cells }, (_, i) => makeGem((G.colOf(i) + G.rowOf(i) * 2) % 5))
const settle = (g: Game) => {
  for (let frame = 0; frame < 4000 && g.phaseKind !== 'idle'; frame++) g.update(1 / 60)
  assert.equal(g.phaseKind, 'idle')
}

for (const p of POWERS) for (const q of POWERS) {
  test(`${p} + ${q}: unique bounded targets, no mutation, one move and one score`, () => {
    const game = new Game({}, 1, G)
    game.grid = grid()
    const a = G.idx(2, 3), b = G.idx(3, 3)
    game.grid[a]!.power = p
    game.grid[b]!.power = q
    assert.equal(findMatches(G, game.grid).length, 0)
    assert.ok(isLegalSwap(G, game.grid, a, b))
    assert.ok(findMoves(G, game.grid).some(m => m.a === a && m.b === b))
    game.tap(a)
    assert.ok(game.fusionPartners.includes(b))
    game.drag(a, b)
    const moves = game.moves
    game.update(0.16)
    assert.equal(game.phaseKind, 'fusion')
    assert.equal(game.fusion?.kind, fusionKind(p, q))
    assert.equal(game.offsetFactor, 0, 'ingredients must not re-run the swap animation')
    const before = JSON.stringify(game.grid)
    const result = fusionClear(G, game.grid, a, b)!
    assert.equal(JSON.stringify(game.grid), before)
    assert.ok(result.cleared.has(a) && result.cleared.has(b))
    assert.ok([...result.cleared].every(i => i >= 0 && i < G.cells))
    for (const blast of result.blasts) {
      assert.ok(blast.targets.every(i => result.cleared.has(i)), 'every drawn target really clears')
    }
    game.drag(a, b)
    assert.equal(game.moves, moves, 'busy input cannot spend another move')
    assert.equal(game.log.length, 1)
    game.update(0.3)
    assert.equal(game.phaseKind, 'strike')
    assert.equal(game.score, result.cleared.size * 10)
    game.update(0.15)
    assert.equal(game.phaseKind, 'clear')
    assert.equal(game.fusion, null)
    assert.deepEqual(new Set(game.grid.flatMap((gem, i) => gem?.clearing ? [i] : [])), result.cleared)
    settle(game)
  })
}

test('cross, wide cross and mega bomb have exact destination-centred footprints', () => {
  for (const [p, q, count] of [
    ['rowClear', 'rowClear', 13], ['rowClear', 'bomb', 33], ['bomb', 'bomb', 25],
  ] as const) {
    const g = grid()
    g[G.idx(2, 3)]!.power = p
    g[G.idx(3, 3)]!.power = q
    assert.equal(fusionClear(G, g, G.idx(2, 3), G.idx(3, 3))!.cleared.size, count)
  }
  const corner = grid()
  corner[0]!.power = 'bomb'
  corner[1]!.power = 'bomb'
  assert.equal(fusionClear(G, corner, 1, 0)!.cleared.size, 9)
  assert.equal(fusionClear(G, corner, 0, 1)!.cleared.size, 12)
})

test('powers hit by a fusion chain once; ingredients do not fire their old power too', () => {
  const g = grid()
  const a = G.idx(2, 3), b = G.idx(3, 3), caught = G.idx(6, 3)
  g[a]!.power = 'rowClear'
  g[b]!.power = 'colClear'
  g[caught]!.power = 'colClear'
  const result = fusionClear(G, g, a, b)!
  assert.equal(result.blasts.filter(blast => blast.cell === caught).length, 1)
  assert.equal(result.cleared.size, 19)
})

test('prism ingredients are consumed, not converted according to their hidden base colour', () => {
  const g = grid()
  g[0] = makeGem(2, 'rainbow')
  g[1] = makeGem(2, 'bomb')
  const first = fusionClear(G, g, 0, 1)!
  g[0]!.kind = 4
  const second = fusionClear(G, g, 0, 1)!
  assert.deepEqual(first, second)
  assert.equal(first.blasts.filter(b => b.cell === 0 && b.kind === 'square').length, 0)
})

test('ordinary and non-adjacent pairs cannot fuse; legacy swaps still require a match', () => {
  const g = grid()
  assert.equal(fusionClear(G, g, 0, 1), null)
  g[0]!.power = 'bomb'
  g[1]!.power = 'bomb'
  assert.equal(isLegalSwap(G, g, 0, 1, 1), false)
  assert.equal(isLegalSwap(G, g, 0, 1, 2), true)
  assert.equal(fusionClear(G, g, 0, G.cells - 1), null)
  assert.equal(isLegalSwap(G, g, 0, G.cells - 1), false)
})

test('pre-fusion production fixture keeps its exact score, board and rules after restore', () => {
  const old = { seed: 18, moves: '3l2g2g1l4h3s3o080s0o', score: 1800, level: 1,
    board: { cols: 6, rows: 9, kinds: 5 } }
  const expected = [[1,'none'],[0,'none'],[3,'bomb'],[2,'none'],[1,'none'],[0,'none'],[4,'none'],[1,'none'],[2,'none'],[2,'none'],[0,'none'],[3,'none'],[0,'none'],[2,'none'],[3,'none'],[1,'none'],[2,'none'],[0,'none'],[4,'colClear'],[0,'none'],[1,'none'],[3,'none'],[4,'bomb'],[3,'none'],[3,'none'],[1,'none'],[0,'none'],[4,'none'],[1,'none'],[2,'none'],[4,'none'],[2,'none'],[1,'none'],[3,'none'],[2,'none'],[2,'none'],[0,'none'],[2,'none'],[1,'none'],[0,'colClear'],[0,'none'],[3,'none'],[2,'none'],[3,'none'],[2,'none'],[3,'none'],[1,'none'],[4,'colClear'],[4,'none'],[0,'none'],[4,'none'],[3,'none'],[2,'none'],[1,'none']]
  assert.ok(verifyRun(old, BOARD).claimMatches)
  const game = new Game({}, 999)
  assert.ok(restoreRun(game, old))
  assert.equal(game.rules, 1)
  assert.equal(game.moves, 15)
  assert.equal(game.bestCombo, 6)
  assert.deepEqual(game.grid.map(g => [g?.kind, g?.power]), expected)
  assert.deepEqual(recordOf(game), old)
  game.nextLevel()
  assert.equal(game.rules, 1)
  game.restart(18)
  assert.equal(game.rules, 3)
})

test('naturally earned fusions replay and resume in v2, including chains and items', () => {
  let fused = 0
  for (let seed = 1; seed <= 20; seed++) {
    const game = new Game({ onFusion: () => fused++ }, seed, BOARD, 2)
    game.addBooster('bomb', 2)
    for (let turn = 0; turn < 40 && game.status !== 'gameOver'; turn++) {
      if (game.status === 'levelComplete') game.nextLevel()
      if (turn === 4) game.useItem('bomb', 20)
      else {
        const move = bestMove(game)!
        game.drag(move.a, move.b)
      }
      settle(game)
    }
    const record = recordOf(game)
    assert.ok(record.moves.startsWith('zy'))
    assert.ok(verifyRun(record, BOARD).claimMatches, `seed ${seed}`)
    const restored = new Game({}, 99)
    assert.ok(restoreRun(restored, record))
    assert.deepEqual(recordOf(restored), record)
    assert.deepEqual(restored.grid.map(g => [g?.kind, g?.power]), game.grid.map(g => [g?.kind, g?.power]))
    assert.deepEqual(restored.items, game.items)
  }
  assert.ok(fused > 0, 'test must exercise real earned fusions, not only ordinary matches')
})

test('rules header cannot occur mid-record, does not count as play, and shares the wire cap', () => {
  const empty = recordOf(new Game({}, 18))
  assert.equal(hasRunActions(empty), false)
  assert.equal(hasRunActions({ ...empty, moves: '' }), false)
  assert.equal(verifyRun({ ...empty, moves: 'zyzy' }, BOARD).ok, false)
  assert.equal(restoreRun(new Game(), { ...empty, moves: 'zyzy' }), false)
  assert.match(verifyRun({ ...empty, moves: 'zy' + '00'.repeat(4000) }, BOARD).reason ?? '', /longer/)
})
