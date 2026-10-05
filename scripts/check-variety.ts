import assert from 'node:assert/strict'
import { Game } from '../src/game/game.ts'
import { bestMove } from '../src/game/autoplay.ts'
import { findMatches, findMoves } from '../src/game/board.ts'
import { recordOf, verifyRun } from '../src/game/replay.ts'
import type { BonusRound } from '../src/game/variety.ts'

// Reproducible engine stress check, not a user/retention study or wall-clock
// benchmark. Simulated seconds measure the declared animation phase budget.
const seeds = 100, turnLimit = 200, frameLimit = 540
let maxFrames = 0, highestStage = 0, ended = 0, caps = 0
const bonusTypes = new Set<BonusRound>()
for (let seed = 1; seed <= seeds; seed++) {
  const game = new Game({ onCascadeCapped: () => caps++ }, seed)
  game.addBooster('bomb', 2)
  for (let turn = 0; turn < turnLimit && game.status !== 'gameOver'; turn++) {
    if (game.status === 'levelComplete') {
      if (game.upgradeDue) assert.ok(game.chooseUpgrade(game.upgradeOptions[turn % game.upgradeOptions.length]!))
      assert.ok(game.nextLevel())
    }
    if (game.bonusRound) bonusTypes.add(game.bonusRound)
    if (game.feverCharge === 100) assert.ok(game.activateFever())
    if (turn % 11 === 0 && game.items.bomb) assert.ok(game.useItem('bomb', 20))
    else {
      const move = bestMove(game); assert.ok(move, `seed ${seed}, turn ${turn}: no legal move`)
      game.drag(move.a, move.b)
    }
    let frames = 0
    for (; frames < frameLimit && game.phaseKind !== 'idle'; frames++) game.update(1 / 60)
    assert.equal(game.phaseKind, 'idle', `seed ${seed}, turn ${turn}: action exceeded nine seconds`)
    assert.ok(game.grid.every(g => g !== null), `seed ${seed}, turn ${turn}: incomplete board`)
    assert.equal(findMatches(game.geom, game.grid, game.rules).length, 0)
    if (game.status === 'playing') assert.ok(findMoves(game.geom, game.grid, game.rules).length > 0)
    maxFrames = Math.max(maxFrames, frames); highestStage = Math.max(highestStage, game.level)
  }
  if (game.status === 'gameOver') ended++
  const verdict = verifyRun(recordOf(game), game.geom)
  assert.ok(verdict.ok && verdict.claimMatches, `seed ${seed}: ${verdict.reason}`)
}
assert.deepEqual([...bonusTypes].sort(), ['factory', 'festival', 'relay'])
console.log(JSON.stringify({ seeds, turnLimit, maxFrames, maxSimulatedSeconds: maxFrames / 60,
  highestStage, ended, caps, bonusTypes: [...bonusTypes] }))
