import assert from 'node:assert/strict'
import test from 'node:test'
import { Game } from './game.ts'
import { bestMove } from './autoplay.ts'
import { MISSIONS, missionFor } from './campaign.ts'
import { BOARD } from './types.ts'
import { encodeMoves, hasRunActions, missionOf, recordOf, restoreRun, verifyRun } from './replay.ts'
import { CampaignProgress, CAMPAIGN_KEY, emptyCampaign, parseCampaign, unlocked } from '../campaign-progress.ts'

export function settleMission(game: Game): void {
  for (let i = 0; i < 4000 && game.phaseKind !== 'idle'; i++) game.update(1 / 60)
  assert.equal(game.phaseKind, 'idle')
}
function play(missionId: string): Game {
  const m = missionFor(missionId)!, g = new Game({}, m.seed, BOARD, 6, m.id)
  for (let step = 0; step < 70 && g.status === 'playing'; step++) {
    if (g.feverCharge === 100) g.activateFever()
    // Use the finite starting tools too. No board/state mutation or extra stock.
    if (step < 3) g.useItem('bomb', BOARD.idx(2, 4))
    else if (step < 6) g.useItem('rocket', BOARD.idx(2, step - 3))
    else { const move = bestMove(g); assert.ok(move); g.drag(move.a, move.b) }
    settleMission(g)
  }
  return g
}
test('all twenty v6 mission contexts round trip with exact goals, stock, rules and puzzle state', () => {
  assert.equal(MISSIONS.length, 20)
  assert.equal(new Set(MISSIONS.map(m => m.id)).size, 20)
  for (const m of MISSIONS) {
    const game = new Game({}, m.seed, BOARD, 6, m.id)
    assert.equal(game.moves, m.moves)
    assert.equal(game.goalDone, 0)
    assert.deepEqual(game.goal, m.goal)
    assert.deepEqual(game.items, { hammer: 3, rocket: 3, bomb: 3 })
    const untouched = recordOf(game)
    assert.equal(hasRunActions(untouched), false)
    assert.equal(missionOf(untouched)?.id, m.id)
    assert.equal(verifyRun(untouched, BOARD).claimMatches, true)
    game.useItem('hammer', 0); settleMission(game)
    const move = bestMove(game)
    if (game.status === 'playing' && move) { game.drag(move.a, move.b); settleMission(game) }
    const record = recordOf(game), restored = new Game()
    assert.equal(verifyRun(record, BOARD).claimMatches, true)
    assert.ok(restoreRun(restored, record))
    const view = (g: Game) => ({ record: recordOf(g), items: g.items, goal: g.goal, progress: g.progress,
      moves: g.moves, status: g.status, charge: g.feverCharge, mission: g.mission?.id,
      grid: g.grid.map(a => a ? [a.kind, a.power] : null) })
    assert.deepEqual(view(restored), view(game))
    assert.equal(game.nextLevel(), false)
    assert.equal(game.upgradeDue, false)
  }
})
test('regional rules are live from the first move and initial gifts do not earn progress', () => {
  for (const region of ['forest', 'volcano', 'prism', 'relay']) {
    const m = missionFor(`${region}-1`)!, g = new Game({}, m.seed, BOARD, 6, m.id)
    if (region === 'forest') assert.equal(g.grid.some(a => a?.power !== 'none'), false)
    if (region === 'volcano') assert.equal(g.grid.filter(a => a?.power === 'bomb').length, 3)
    if (region === 'prism') assert.ok(g.grid.every(a => a && a.kind < 3))
    if (region === 'relay') assert.equal(g.grid.filter(a => a?.power !== 'none').length, 6)
    const move = bestMove(g)!; g.drag(move.a, move.b); settleMission(g)
    if (region === 'volcano') assert.ok(g.grid.some(a => a?.power === 'bomb'))
    if (region === 'relay') assert.ok(g.grid.some(a => a?.power !== 'none'))
  }
  assert.throws(() => new Game({}, 18, BOARD, 6), /mission/)
  assert.throws(() => new Game({}, 18, BOARD, 5, 'forest-1'), /mission/)
})
test('unknown, duplicate, swapped and truncated mission contexts cannot mint a result', () => {
  const m = MISSIONS[0]!, g = play(m.id), record = recordOf(g)
  assert.equal(g.status, 'levelComplete')
  for (const moves of ['zu', 'zuzz', 'zu00zu00', record.moves.slice(0, -1), record.moves.replace(/^zu00/, 'zu01')])
    assert.equal(verifyRun({ ...record, moves }, BOARD).claimMatches, false, moves)
  const forged = { ...record, moves: record.moves + encodeMoves(BOARD, [{ kind: 'advance' }]) }
  assert.equal(verifyRun(forged, BOARD).ok, false)
  assert.equal(verifyRun({ ...record, seed: record.seed + 1 }, BOARD).ok, false)
  assert.equal(restoreRun(new Game(), { ...record, seed: record.seed + 1 }), false)
})
test('forest first clear unlocks all regions; authored missions unlock in order and never from best score', () => {
  const state = emptyCampaign()
  assert.equal(unlocked(state, missionFor('forest-1')!), true)
  for (const id of ['forest-2', 'volcano-1', 'prism-1', 'relay-1']) assert.equal(unlocked(state, missionFor(id)!), false)
  state.completed['forest-1'] = 900
  for (const id of ['forest-2', 'volcano-1', 'prism-1', 'relay-1']) assert.equal(unlocked(state, missionFor(id)!), true)
  assert.equal(unlocked(state, missionFor('forest-3')!), false)
  assert.deepEqual(parseCampaign('{"version":1,"completed":{"forest-5":999999,"bogus":1}}'), emptyCampaign())
})
test('verified first-clear reward is paid once across a replay, reload and improved score', () => {
  const data = new Map<string, string>(), storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) } }
  let earned = 0
  const ledger = new CampaignProgress(storage, n => { earned += n }), staleTab = new CampaignProgress(storage, n => { earned += n })
  const g = play('forest-1'), record = recordOf(g)
  assert.equal(g.status, 'levelComplete')
  assert.equal(ledger.claim({ ...record, score: record.score + 1 }).ok, false)
  assert.equal(ledger.claim(record).reward, MISSIONS[0]!.reward)
  assert.equal(ledger.claim(record).reward, 0)
  assert.equal(staleTab.claim(record).reward, 0)
  assert.equal(new CampaignProgress(storage, n => { earned += n }).claim(record).reward, 0)
  assert.equal(earned, MISSIONS[0]!.reward)
  assert.ok(data.has(CAMPAIGN_KEY))
})
test('unfinished and locked missions cannot claim rewards; blocked storage never pays repeatedly', () => {
  let credit = 0
  const storage = { getItem: () => null, setItem: () => { throw new Error('quota') } }
  const ledger = new CampaignProgress(storage, n => { credit += n })
  const m = MISSIONS[0]!, initial = new Game({}, m.seed, BOARD, 6, m.id)
  assert.equal(ledger.claim(recordOf(initial)).ok, false)
  assert.equal(ledger.claim(recordOf(play('volcano-1'))).ok, false)
  const record = recordOf(play(m.id))
  assert.equal(ledger.claim(record).persistent, false)
  assert.equal(ledger.claim(record).first, false)
  assert.equal(credit, 0)
  assert.equal(ledger.state.completed[m.id], record.score)
})
test('all twenty authored boards have a verified solution using finite tools and bounded turns', () => {
  for (const m of MISSIONS) {
    const game = play(m.id)
    assert.equal(game.status, 'levelComplete', m.id)
    assert.equal(verifyRun(recordOf(game), BOARD).claimMatches, true)
  }
})
