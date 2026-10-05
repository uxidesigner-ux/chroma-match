import assert from 'node:assert/strict'
import test from 'node:test'
import { Game } from '../game/game.ts'
import { MISSIONS } from '../game/campaign.ts'
import { recordOf } from '../game/replay.ts'
import { BOARD } from '../game/types.ts'
import { FirebaseLeaderboard } from './firebase.ts'
import { LocalLeaderboard } from './local.ts'

test('both ranking adapters reject campaign records before connecting or writing', async () => {
  const m = MISSIONS[0]!, run = recordOf(new Game({}, m.seed, BOARD, 6, m.id))
  for (const board of [new LocalLeaderboard(), new FirebaseLeaderboard()]) {
    const result = await board.submit(run, 'Campaign player')
    assert.equal(result.accepted, false)
    assert.equal(result.rank, null)
    assert.equal(result.score, 0)
    assert.ok(result.reason)
  }
})
