import assert from 'node:assert/strict'
import test from 'node:test'
import { Game } from './game.ts'
import { bestMove } from './autoplay.ts'
import { blastRadius, findMatches, findMoves, isLegalSwap, makeGem } from './board.ts'
import { BOARD, makeGeom } from './types.ts'
import { decodeMoves, encodeMoves, hasRunActions, recordOf, restoreRun, rulesOf, verifyRun } from './replay.ts'
import { bonusForLevel, stageGoal, UPGRADES } from './variety.ts'

function settle(game: Game): void {
  for (let i = 0; i < 4000 && game.phaseKind !== 'idle'; i++) game.update(1 / 60)
  assert.equal(game.phaseKind, 'idle', 'cascade must be finite')
}
function swap(game: Game): void {
  const move = bestMove(game)
  assert.ok(move)
  game.drag(move.a, move.b); settle(game)
}
function run(seed: number, turns = 120): Game {
  const game = new Game({}, seed)
  game.addBooster('bomb', 2)
  for (let turn = 0; turn < turns && game.status !== 'gameOver'; turn++) {
    if (game.status === 'levelComplete') {
      if (game.upgradeDue) assert.ok(game.chooseUpgrade(game.upgradeOptions[turn % game.upgradeOptions.length]!))
      assert.ok(game.nextLevel())
    }
    if (game.feverCharge === 100) assert.ok(game.activateFever())
    if (turn % 11 === 0 && game.items.bomb) { assert.ok(game.useItem('bomb', 20)); settle(game) }
    else swap(game)
  }
  return game
}

test('v4 has a distinct header and ordered bounded action codes', () => {
  const game = new Game({}, 7)
  assert.equal(rulesOf(recordOf(game)), 4)
  assert.equal(hasRunActions(recordOf(game)), false)
  const malformed = { ...recordOf(game), moves: undefined } as unknown as ReturnType<typeof recordOf>
  assert.equal(rulesOf(malformed), 1, 'painting a remote rule label must not throw')
  assert.equal(verifyRun(malformed, BOARD).ok, false, 'detection does not validate a malformed record')
  const actions = [{ kind: 'fever' }, { kind: 'advance' }, ...UPGRADES.map(upgrade => ({ kind: 'upgrade' as const, upgrade }))] as const
  for (const geom of [BOARD, makeGeom(12, 12, 6)])
    assert.deepEqual(decodeMoves(geom, encodeMoves(geom, actions)), actions)
  assert.throws(() => encodeMoves(makeGeom(8, 23, 5), actions), /does not fit/, 'action codes must not collide with reserved headers')
  for (const rules of [1, 2, 3] as const) {
    const legacy = recordOf(new Game({}, 7, BOARD, rules))
    assert.equal(verifyRun({ ...legacy, moves: legacy.moves + encodeMoves(BOARD, [{ kind: 'fever' }]) }, BOARD).ok, false)
  }
})
test('unearned, duplicate and busy fever cannot be accepted', () => {
  const game = new Game({}, 7)
  assert.equal(game.activateFever(), false)
  game.feverCharge = 100
  const moves = game.moves
  assert.ok(game.activateFever())
  assert.equal(game.moves, moves)
  assert.equal(game.feverTurns, 3)
  assert.equal(game.activateFever(), false)
  swap(game)
  assert.equal(game.feverTurns, 2)
  assert.equal(game.feverCharge, 0)
  assert.ok(game.grid.some(g => g?.power !== 'none'))
  const move = bestMove(game)!
  game.drag(move.a, move.b)
  game.feverCharge = 100
  assert.equal(game.activateFever(), false)
  settle(game)
  assert.equal(game.feverTurns, 1)
})
test('time, invalid swaps and free items do not consume fever turns', () => {
  const game = new Game({}, 42)
  game.addBooster('hammer', 2)
  game.feverCharge = 100; game.activateFever()
  const invalid = Array.from({ length: BOARD.cells - 1 }, (_, a) => ({ a, b: a + 1 }))
    .find(m => BOARD.colOf(m.a) < BOARD.cols - 1 && !isLegalSwap(BOARD, game.grid, m.a, m.b, 4))!
  game.drag(invalid.a, invalid.b); settle(game)
  assert.equal(game.feverTurns, 3)
  assert.ok(game.useItem('hammer', 10)); settle(game)
  assert.equal(game.feverTurns, 3)
  game.update(600)
  assert.equal(game.feverTurns, 3)
  assert.equal(game.feverCharge, 0)
})
test('a large cascade charges at most 35 per action and never decays', () => {
  const game = new Game({}, 42)
  game.grid[0] = makeGem(0, 'rainbow'); game.grid[1] = makeGem(0, 'rainbow')
  game.drag(0, 1); settle(game)
  assert.ok(game.feverCharge > 0 && game.feverCharge <= 35)
  const charge = game.feverCharge; game.update(600)
  assert.equal(game.feverCharge, charge)
})
test('upgrade is mandatory only at its cleared boundary, chosen once and capped', () => {
  const game = new Game({}, 42)
  assert.equal(game.chooseUpgrade('blast'), false)
  game.level = 3; game.status = 'levelComplete'
  assert.equal(game.upgradeDue, true)
  assert.equal(game.nextLevel(), false)
  assert.ok(game.chooseUpgrade('blast'))
  assert.equal(game.chooseUpgrade('stripe'), false)
  assert.ok(game.nextLevel())
  game.level = 6; game.status = 'levelComplete'; assert.ok(game.chooseUpgrade('blast')); game.nextLevel()
  game.level = 9; game.status = 'levelComplete'
  assert.equal(game.chooseUpgrade('blast'), false)
  assert.deepEqual(game.upgradeOptions, ['stripe', 'echo'])
  game.upgrades = { blast: 2, stripe: 2, echo: 2 }
  assert.equal(game.upgradeDue, false)
  assert.ok(game.nextLevel())
})
test('blast/stripe upgrade targets are clipped, monotonic and include edge lines', () => {
  const geom = makeGeom(9, 9, 5), grid = Array.from({ length: geom.cells }, () => makeGem(0))
  grid[40]!.power = 'bomb'
  assert.equal(blastRadius(geom, grid, 40).length, 9)
  assert.equal(blastRadius(geom, grid, 40, { blast: 1, stripe: 0 }).length, 25)
  assert.equal(blastRadius(geom, grid, 40, { blast: 2, stripe: 0 }).length, 49)
  for (const cell of [0, 80]) for (const power of ['rowClear', 'colClear'] as const) {
    grid[cell]!.power = power
    const reach = blastRadius(geom, grid, cell, { blast: 0, stripe: 2 })
    assert.equal(reach.length, 27); assert.equal(new Set(reach).size, 27)
    assert.ok(reach.every(i => i >= 0 && i < geom.cells))
  }
})
test('bonus rotation is predictable, never changes geometry and grants no free entry score', () => {
  assert.deepEqual([5, 10, 15, 20].map(n => bonusForLevel(n, 4)), ['factory', 'festival', 'relay', 'factory'])
  assert.equal(bonusForLevel(5, 3), null)
  assert.equal(stageGoal(5, 5, 3).kind, 'power')
  for (const level of [5, 10, 15]) {
    const game = new Game({}, 42); game.level = level - 1; game.status = 'levelComplete'
    if (game.upgradeDue) game.chooseUpgrade('blast')
    assert.ok(game.nextLevel())
    assert.equal(game.geom, BOARD); assert.equal(game.grid.length, BOARD.cells); assert.equal(game.score, 0)
    assert.equal(game.moves, 25 + Math.floor((level - 1) / 3) * 2 + 5)
    assert.equal(findMatches(BOARD, game.grid, 4).length, 0)
    assert.ok(findMoves(BOARD, game.grid, 4).length > 0)
    if (level === 5) assert.equal(game.grid.filter(g => g?.power === 'bomb').length, 3)
    if (level === 10) {
      assert.ok(game.grid.every(g => g && g.kind < 3)); swap(game)
      assert.ok(game.grid.every(g => g && g.kind < 3))
    }
    if (level === 15) {
      assert.equal(game.grid.filter(g => g?.power !== 'none').length, 6)
      game.drag(0, 1); settle(game)
      assert.ok(game.grid.some((g, i) => g?.power !== 'none' && BOARD.colOf(i) < 5 && game.grid[i + 1]?.power !== 'none'))
    }
  }
})
test('earned fever stacks with factory rewards instead of replacing its bomb', () => {
  const deliveries: string[] = []
  const game = new Game({ onPowerCreated: (_cell, power) => deliveries.push(power) }, 7)
  game.level = 4; game.status = 'levelComplete'; assert.ok(game.nextLevel())
  game.goal = { kind: 'score', need: Infinity }; game.moves = 100
  game.feverCharge = 100; assert.ok(game.activateFever())
  for (const expected of [['bomb', 'bomb'], ['rowClear', 'bomb'], ['bomb', 'bomb']]) {
    deliveries.length = 0; swap(game)
    assert.deepEqual(deliveries.slice(-2), expected, 'both promised powers are supplied after settling')
  }
  assert.equal(game.feverTurns, 0)
})
test('v4 full runs, choices, fever and bonus boards replay/restore exactly on 12 seeds', () => {
  let fever = false, upgrade = false, bonus = false
  for (let seed = 1; seed <= 12; seed++) {
    const played = run(seed), record = recordOf(played), verdict = verifyRun(record, BOARD)
    assert.ok(verdict.ok && verdict.claimMatches, `seed ${seed}: ${verdict.reason}`)
    let hooks = 0
    const restored = new Game({ onClear: () => hooks++, onLevelComplete: () => hooks++, onFever: () => hooks++ })
    assert.ok(restoreRun(restored, record)); assert.equal(hooks, 0)
    assert.deepEqual(recordOf(restored), record)
    assert.deepEqual([restored.feverCharge, restored.feverTurns, restored.upgrades, restored.upgradeDue, restored.bonusRound],
      [played.feverCharge, played.feverTurns, played.upgrades, played.upgradeDue, played.bonusRound])
    assert.deepEqual(restored.grid.map(g => [g?.kind, g?.power]), played.grid.map(g => [g?.kind, g?.power]))
    fever ||= played.log.some(a => a.kind === 'fever'); upgrade ||= played.log.some(a => a.kind === 'upgrade'); bonus ||= played.level >= 5
  }
  assert.ok(fever && upgrade && bonus, 'fixtures must actually exercise the features')
})
test('forged and removed variety actions fail replay, rather than minting rewards', () => {
  const fresh = recordOf(new Game({}, 7))
  for (const action of [{ kind: 'fever' }, { kind: 'upgrade', upgrade: 'blast' }] as const)
    assert.equal(verifyRun({ ...fresh, moves: 'zw' + encodeMoves(BOARD, [action]) }, BOARD).ok, false)
  const game = run(7), record = recordOf(game)
  const index = game.log.findIndex(a => a.kind === 'upgrade'); assert.ok(index >= 0)
  const skipped = game.log.filter((_, i) => i !== index)
  const result = verifyRun({ ...record, moves: 'zw' + encodeMoves(BOARD, skipped) }, BOARD)
  assert.equal(result.ok, false); assert.match(result.reason!, /required upgrade/)
})
test('legacy v1–v3 replay and resume still retain their rules and never award fever', () => {
  for (const rules of [1, 2, 3] as const) for (const seed of [1, 18, 42]) {
    const game = new Game({}, seed, BOARD, rules)
    for (let turn = 0; turn < 80 && game.status !== 'gameOver'; turn++) {
      if (game.status === 'levelComplete') game.nextLevel()
      swap(game)
    }
    assert.equal(game.feverCharge, 0); assert.equal(game.activateFever(), false)
    const record = recordOf(game); assert.ok(verifyRun(record, BOARD).claimMatches)
    const restored = new Game(); assert.ok(restoreRun(restored, record)); assert.equal(restored.rules, rules)
    assert.deepEqual(recordOf(restored), record)
  }
})

test('saving immediately after continuing a cleared stage restores the new stage, before any swap', () => {
  const game = new Game({}, 18)
  while (game.status === 'playing') swap(game)
  assert.equal(game.status, 'levelComplete'); assert.ok(game.nextLevel())
  const record = recordOf(game)
  assert.ok(verifyRun(record, BOARD).claimMatches)
  const restored = new Game(); assert.ok(restoreRun(restored, record))
  assert.equal(restored.status, 'playing'); assert.equal(restored.level, 2)
  assert.deepEqual(recordOf(restored), record)
})

test('three-colour cascades cap at eight links, preserve surviving powers and return control in under nine seconds', () => {
  let caps = 0
  const game = new Game({ onCascadeCapped: () => caps++ }, 31)
  game.level = 9; game.status = 'levelComplete'; game.chooseUpgrade('blast'); game.nextLevel()
  game.goal = { kind: 'score', need: Infinity }; game.moves = 200
  for (let turn = 0; turn < 60; turn++) {
    if (game.feverCharge === 100) game.activateFever()
    const move = bestMove(game)!; game.drag(move.a, move.b)
    let frames = 0
    for (; frames < 540 && game.phaseKind !== 'idle'; frames++) {
      const check = game.phaseKind === 'fall' && game.combo === 8
      const powers = check ? game.grid.map(g => g?.power) : []
      const score = game.score, before = caps
      game.update(1 / 60)
      if (caps !== before) {
        assert.equal(game.score, score, 'stabilizing earns no unplayed points')
        powers.forEach((power, cell) => { if (power !== 'none') assert.equal(game.grid[cell]?.power, power) })
        assert.equal(findMatches(BOARD, game.grid, 4).length, 0)
      }
    }
    assert.equal(game.phaseKind, 'idle', `turn ${turn}: must hand back control`)
    assert.ok(frames < 540)
    assert.ok(game.grid.every(g => g && Number.isInteger(g.kind) && g.kind >= 0 && g.kind < 3))
  }
  assert.ok(caps > 0, 'fixture must actually exercise the cap')
})
