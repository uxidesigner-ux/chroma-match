import assert from 'node:assert/strict'
import test from 'node:test'

import { findMoves } from './board.ts'
import { Game } from './game.ts'
import { boardOf, decodeMoves, encodeMoves, recordOf, verifyRun } from './replay.ts'
import type { RunRecord } from './replay.ts'
import { BOARD, makeGeom } from './types.ts'
import type { Geom } from './types.ts'

const FRAME = 1 / 60

function settle(game: Game): void {
  for (let i = 0; i < 4000; i++) {
    if (game.phaseKind === 'idle') return
    game.update(FRAME)
  }
  assert.fail('board never settled')
}

/**
 * Plays a run with the same deterministic policy the tuning harness uses.
 * `idleBetweenMoves` inserts wall-clock time between swaps, which is what makes
 * the hint fire — the thing that used to poison the gameplay RNG.
 */
function playRun(seed: number, turns: number, geom: Geom = BOARD, idleBetweenMoves = 0): Game {
  const game = new Game({}, seed, geom)
  for (let turn = 0; turn < turns; turn++) {
    if (game.status === 'levelComplete') game.nextLevel()
    if (game.status !== 'playing') break
    if (idleBetweenMoves > 0) game.update(idleBetweenMoves)
    const moves = findMoves(game.geom, game.grid)
    if (moves.length === 0) break
    // Deterministic choice: the lowest-indexed legal swap.
    const move = moves[0]!
    game.drag(move.a, move.b)
    settle(game)
  }
  return game
}

test('a run replays to exactly the score it was played to', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const played = playRun(seed, 20)
    const record = recordOf(played)
    const verdict = verifyRun(record, BOARD)

    assert.ok(verdict.ok, `seed ${seed} failed to replay: ${verdict.reason}`)
    assert.equal(verdict.score, played.score, `seed ${seed} replayed to a different score`)
    assert.equal(verdict.level, played.level)
    assert.ok(verdict.claimMatches)
  }
})

test('how long the player thinks cannot change the outcome', () => {
  // Hints fire after four seconds of idling and used to draw from the same RNG
  // that refills the board, so a thoughtful player and a fast one playing the
  // same seed and the same swaps ended up on different boards. That made every
  // honest slow run look forged. This is the regression test for that.
  for (let seed = 1; seed <= 12; seed++) {
    const fast = playRun(seed, 20, BOARD, 0)
    const slow = playRun(seed, 20, BOARD, 6) // long enough for a hint every turn

    assert.equal(
      slow.score,
      fast.score,
      `seed ${seed}: idling changed the score (${fast.score} vs ${slow.score})`,
    )
    assert.deepEqual(
      slow.log,
      fast.log,
      `seed ${seed}: idling changed which swaps were available`,
    )
    assert.ok(verifyRun(recordOf(slow), BOARD).ok, `seed ${seed}: the slow run failed to verify`)
  }
})

test('moves survive the round trip through the wire format', () => {
  const played = playRun(3, 24)
  const encoded = encodeMoves(played.geom, played.log)
  assert.equal(encoded.length, played.log.length * 2, 'two characters per move')
  assert.deepEqual(decodeMoves(played.geom, encoded), played.log)
})

test('the replay overrules the claim rather than trusting it', () => {
  const played = playRun(5, 18)
  const honest = recordOf(played)
  const forged: RunRecord = { ...honest, score: 9_999_999, level: 42 }

  const verdict = verifyRun(forged, BOARD)
  assert.ok(verdict.ok, 'the moves are genuine, so the run itself still replays')
  assert.equal(verdict.claimMatches, false, 'the inflated claim must be flagged')
  assert.equal(verdict.score, played.score, 'the stored score is the replayed one')
  assert.ok(verdict.score < 9_999_999)
})

test('a fabricated move list cannot score', () => {
  const played = playRun(9, 10)
  const geom = played.geom
  // Every legal-looking swap in the game, but in an order the board never saw.
  const scrambled = [...played.log].reverse()
  const verdict = verifyRun({ ...recordOf(played), moves: encodeMoves(geom, scrambled) }, BOARD)
  assert.equal(verdict.ok, false, 'a reordered move list should stop making matches')
  assert.match(verdict.reason ?? '', /does not make a match/)
})

test('junk submissions are rejected rather than replayed', () => {
  const base = recordOf(playRun(2, 8))

  const cases: Array<[string, RunRecord, RegExp]> = [
    ['a truncated move list', { ...base, moves: `${base.moves}a` }, /truncated/],
    ['non-base36 characters', { ...base, moves: '!!' }, /base36/],
    ['a move off the board', { ...base, moves: 'zz' }, /off the board/],
    ['a negative seed', { ...base, seed: -1 }, /seed/],
    [
      'a different board',
      { ...base, board: { cols: 8, rows: 8, kinds: 6 } },
      /different board/,
    ],
  ]

  for (const [label, record, expected] of cases) {
    const verdict = verifyRun(record, BOARD)
    assert.equal(verdict.ok, false, `${label} should have been rejected`)
    assert.match(verdict.reason ?? '', expected, label)
    assert.equal(verdict.score, 0, `${label} must not award points`)
  }
})

test('moves appended after the run ended are rejected', () => {
  // Seed 2 exhausts its move budget on level 1 under this policy, which is the
  // only way to reach game over through the real rules. Note that tampering
  // with the live game's move counter would NOT reproduce here: the verifier
  // always replays from the rules, never from the client's bookkeeping.
  const game = playRun(2, 40)
  assert.equal(game.status, 'gameOver', 'the fixture seed must end by running out of moves')

  // Splice on a swap that is genuinely legal on the final board, so the run's
  // ending — not the move's legality — is what has to reject it.
  const afterwards = findMoves(game.geom, game.grid)
  assert.ok(afterwards.length > 0, 'the final board should still offer moves')

  const record = recordOf(game)
  const extra = encodeMoves(game.geom, [afterwards[0]!])
  const verdict = verifyRun({ ...record, moves: record.moves + extra }, BOARD)
  assert.equal(verdict.ok, false)
  assert.match(verdict.reason ?? '', /after the run ended/)
})

test('the encoding refuses a board it cannot represent', () => {
  const huge = makeGeom(40, 40, 5) // 1600 cells x 4 directions overflows two base36 chars
  assert.throws(() => encodeMoves(huge, [{ a: 0, b: 1 }]), /does not fit/)
  assert.deepEqual(boardOf(BOARD), { cols: BOARD.cols, rows: BOARD.rows, kinds: BOARD.kinds })
})
