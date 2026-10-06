import assert from 'node:assert/strict'
import test from 'node:test'
import { Game } from './game.ts'
import { bestMove } from './autoplay.ts'
import { MISSIONS, WORLD_MISSIONS } from './campaign.ts'
import { BOARD } from './types.ts'
import { recordOf, restoreRun, verifyRun, missionOf, rulesOf } from './replay.ts'
import { metricsOf } from '../player/model.ts'
import { checkEntry } from '../leaderboard/verify.ts'
test('expanded forest is thirty authored stages; v6 table and shared logical mission identities stay intact', () => {
  assert.equal(MISSIONS.length, 20); assert.equal(WORLD_MISSIONS.length, 45)
  assert.equal(WORLD_MISSIONS.filter(m => m.region === 'forest').length, 30)
  assert.deepEqual(WORLD_MISSIONS.slice(0, 5), MISSIONS.slice(0, 5))
  assert.throws(() => new Game({}, WORLD_MISSIONS[5]!.seed, BOARD, 6, 'forest-6'), /v6/)
})
test('all 30 forest stages can be cleared with finite legal tools and greedy swaps; complete records prove exact metrics', () => {
  for (const m of WORLD_MISSIONS.filter(m => m.region === 'forest')) {
    const g = new Game({}, m.seed, BOARD, 7, m.id)
    const settle = () => { for (let i = 0; i < 4000 && g.phaseKind !== 'idle'; i++) g.update(1/60); assert.equal(g.phaseKind, 'idle') }
    assert.equal(g.matchedPowers, 0)
    for (let step = 0; step < 80 && g.status === 'playing'; step++) {
      if (g.feverCharge >= 100) g.activateFever()
      if (step < 3) g.useItem('bomb', BOARD.idx(2, 4))
      else if (step < 6) g.useItem('rocket', BOARD.idx(2, step - 3))
      else { const move = bestMove(g); assert.ok(move); g.drag(move.a, move.b) }
      settle()
    }
    assert.equal(g.status, 'levelComplete', `${m.id} ${g.progress}/${g.need}`)
    const r = recordOf(g), restored = new Game()
    assert.equal(rulesOf(r), 7); assert.equal(missionOf(r)?.id, m.id)
    assert.equal(verifyRun(r, BOARD).claimMatches, true, m.id)
    assert.equal(checkEntry({id:m.id,name:'QA',score:r.score,level:r.level,at:0,mine:true,run:r}), 'failed', 'campaign cannot validate as an endless ranking')
    assert.ok(restoreRun(restored, r)); assert.deepEqual(metricsOf(restored), metricsOf(g))
  }
})
