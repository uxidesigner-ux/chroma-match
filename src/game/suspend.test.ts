import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findMoves } from './board.ts'
import { Game } from './game.ts'
import { BOOSTER_LIMIT, recordOf, restoreRun, verifyRun } from './replay.ts'
import { BOARD } from './types.ts'

const FRAME = 1 / 60

function settle(game: Game): void {
  for (let i = 0; i < 4000 && game.phaseKind !== 'idle'; i++) game.update(FRAME)
}

/** Plays a run of roughly `moves` accepted swaps, taking a booster in first. */
function playSome(seed: number, moves: number): Game {
  const game = new Game({}, seed)
  game.addBooster('bomb', BOOSTER_LIMIT)
  for (let i = 0; i < moves; i++) {
    if (game.status === 'gameOver') break
    if (game.status === 'levelComplete') game.nextLevel()
    const move = findMoves(game.geom, game.grid)[0]
    if (!move) break
    game.drag(move.a, move.b)
    settle(game)
  }
  return game
}

test('a kept run resumes exactly where it was put down', () => {
  // The whole feature in one assertion: the save is the run record, so picking
  // a run back up is replaying it. Anything the replay does not reproduce is
  // something the player would notice as their board changing under them.
  const played = playSome(20260917, 24)
  const record = recordOf(played)

  const resumed = new Game({}, 1)
  assert.equal(restoreRun(resumed, record), true)

  assert.equal(resumed.score, played.score)
  assert.equal(resumed.level, played.level)
  assert.equal(resumed.moves, played.moves)
  assert.equal(resumed.goalDone, played.goalDone)
  assert.deepEqual(resumed.goal, played.goal)
  assert.deepEqual(resumed.items, played.items)
  assert.deepEqual(resumed.boosters, played.boosters)
  assert.deepEqual(resumed.log, played.log)
  assert.equal(resumed.status, played.status)

  // The board itself, gem for gem, including which ones carry a power.
  assert.equal(resumed.grid.length, played.grid.length)
  for (let i = 0; i < resumed.grid.length; i++) {
    assert.equal(resumed.grid[i]?.kind, played.grid[i]?.kind, `cell ${i} colour`)
    assert.equal(resumed.grid[i]?.power, played.grid[i]?.power, `cell ${i} power`)
  }
})

test('a resumed run is still a postable one', () => {
  // Resuming must not cost the player their leaderboard entry: the record is
  // unchanged by the round trip, so it verifies exactly as it did before.
  const played = playSome(31415, 18)
  const record = recordOf(played)

  const resumed = new Game({}, 1)
  assert.equal(restoreRun(resumed, record), true)

  const verdict = verifyRun(recordOf(resumed), BOARD)
  assert.equal(verdict.ok, true, verdict.reason ?? '')
  assert.equal(verdict.score, played.score)
  assert.ok(verdict.claimMatches)
})

test('a save that will not replay is refused, not half-applied', () => {
  const played = playSome(777, 10)
  const record = recordOf(played)

  for (const broken of [
    { ...record, moves: `${record.moves}zz` }, // an action this version has no code for
    { ...record, moves: `${record.moves}a` }, // truncated
    { ...record, seed: -1 }, // a seed no board was ever dealt from
    { ...record, board: { cols: 8, rows: 8, kinds: 6 } }, // another board's run
  ]) {
    const game = new Game({}, 4242)
    const before = game.grid.map((gem) => gem?.kind)
    assert.equal(restoreRun(game, broken), false)
    // Every one of these is catchable without playing a single move, so the
    // game is left exactly as it was found. A player dropped onto half of
    // somebody else's run would have no way to tell that is what happened.
    assert.equal(game.log.length, 0)
    assert.equal(game.score, 0)
    assert.equal(game.level, 1)
    assert.deepEqual(
      game.grid.map((gem) => gem?.kind),
      before,
    )
  }
})

test('ending a run deliberately settles it like running out of moves', () => {
  let ended: number | null = null
  const game = new Game({ onGameOver: (score) => (ended = score) }, 5)
  const move = findMoves(game.geom, game.grid)[0]
  assert.ok(move)
  game.drag(move.a, move.b)
  settle(game)

  const score = game.score
  game.endRun()
  assert.equal(game.status, 'gameOver')
  assert.equal(ended, score, 'the payout hook fires with the score it ended on')

  // Idempotent: a second press of End cannot pay a second time.
  ended = null
  game.endRun()
  assert.equal(ended, null)
})
