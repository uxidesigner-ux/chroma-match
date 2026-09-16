import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findMoves } from './board.ts'
import { Game } from './game.ts'
import { goalForLevel, scoreTargetForLevel } from './goals.ts'
import { BOOSTER_LIMIT, encodeMoves, recordOf, verifyRun } from './replay.ts'
import { BOARD } from './types.ts'

const FRAME = 1 / 60

function settle(game: Game): void {
  for (let i = 0; i < 4000 && game.phaseKind !== 'idle'; i++) game.update(FRAME)
}

test('a level asks for the same thing every time it is reached', () => {
  // The verifier recomputes a level's goal rather than reading it from the
  // record. If a goal were not a pure function of the level, an honest run and
  // its replay would diverge and the score would be rejected.
  for (let level = 1; level <= 30; level++) {
    assert.deepEqual(goalForLevel(level, BOARD.kinds), goalForLevel(level, BOARD.kinds))
  }
})

test('the goal cycle brings in more than one kind of level', () => {
  const kinds = new Set<string>()
  for (let level = 1; level <= 12; level++) kinds.add(goalForLevel(level, BOARD.kinds).kind)
  assert.deepEqual([...kinds].sort(), ['colour', 'power', 'score'])
})

test('a colour goal never names a colour the board does not deal', () => {
  for (const palette of [3, 4, 5, 6]) {
    for (let level = 1; level <= 40; level++) {
      const goal = goalForLevel(level, palette)
      if (goal.kind !== 'colour') continue
      assert.ok(goal.colour >= 0 && goal.colour < palette, `level ${level} of ${palette}`)
    }
  }
})

test('the goal counts are the measured ones, and they climb', () => {
  // Pinned because they are tuning output, not arithmetic: `npm run tune`'s
  // third table is what justifies them, and a change here should be a change
  // that table backs up rather than one that slipped in.
  const colour3 = goalForLevel(3, BOARD.kinds)
  assert.equal(colour3.kind, 'colour')
  assert.equal(colour3.need, 25)

  const power5 = goalForLevel(5, BOARD.kinds)
  assert.equal(power5.kind, 'power')
  assert.equal(power5.need, 8)

  for (const level of [3, 9, 15]) {
    const goal = goalForLevel(level, BOARD.kinds)
    const next = goalForLevel(level + 6, BOARD.kinds)
    assert.equal(goal.kind, next.kind)
    assert.ok(next.need > goal.need, `${goal.kind} should climb past level ${level}`)
  }
})

test('goals get harder, and the score curve is unchanged', () => {
  assert.equal(scoreTargetForLevel(1), 1800)
  for (let level = 2; level <= 20; level++) {
    assert.ok(scoreTargetForLevel(level) > scoreTargetForLevel(level - 1))
  }

  const early = goalForLevel(3, BOARD.kinds)
  const late = goalForLevel(9, BOARD.kinds)
  assert.equal(early.kind, 'colour')
  assert.equal(late.kind, 'colour')
  assert.ok(late.need > early.need)
})

test('progress is reported in the goal it belongs to', () => {
  const game = new Game({}, 31337)
  assert.equal(game.goal.kind, 'score')
  assert.equal(game.need, scoreTargetForLevel(1))

  const move = findMoves(game.geom, game.grid)[0]
  assert.ok(move)
  game.drag(move.a, move.b)
  settle(game)
  // On a score level, progress is points — the same number the HUD always showed.
  assert.equal(game.progress, game.score - game.levelStartScore)
  assert.ok(game.progress > 0)
})

test('a booster is recorded, and the record replays it', () => {
  const game = new Game({}, 909090)
  assert.equal(game.addBooster('bomb', BOOSTER_LIMIT), true)
  assert.equal(game.items.bomb, 1)
  assert.deepEqual(game.boosters, ['bomb'])

  assert.equal(game.useItem('bomb', BOARD.idx(3, 4)), true)
  settle(game)
  for (let i = 0; i < 4; i++) {
    if (game.status !== 'playing') break
    const move = findMoves(game.geom, game.grid)[0]
    if (!move) break
    game.drag(move.a, move.b)
    settle(game)
  }

  const verdict = verifyRun(recordOf(game), BOARD)
  assert.equal(verdict.ok, true, verdict.reason ?? '')
  assert.equal(verdict.score, game.score)
})

test('the booster cap is the security boundary', () => {
  const game = new Game({}, 5150)
  for (let i = 0; i < BOOSTER_LIMIT; i++) {
    assert.equal(game.addBooster('hammer', BOOSTER_LIMIT), true)
  }
  // One past the cap is refused in the game...
  assert.equal(game.addBooster('hammer', BOOSTER_LIMIT), false)

  // ...and a record that writes one anyway is refused by the verifier, which
  // is the case that matters: the game is the honest player's copy, the
  // verifier is everyone else's.
  const greedy = encodeMoves(
    BOARD,
    Array.from({ length: BOOSTER_LIMIT + 1 }, () => ({ kind: 'booster' as const, item: 'bomb' as const })),
  )
  const verdict = verifyRun({ seed: 5150, moves: greedy, score: 0, level: 1, board: { cols: BOARD.cols, rows: BOARD.rows, kinds: BOARD.kinds } }, BOARD)
  assert.equal(verdict.ok, false)
  assert.match(verdict.reason ?? '', /may not have/)
})

test('a booster spliced into the middle of a run is refused', () => {
  const game = new Game({}, 24680)
  const move = findMoves(game.geom, game.grid)[0]
  assert.ok(move)
  game.drag(move.a, move.b)
  settle(game)

  // The run has started, so this is not a loadout any more — it is an item
  // being conjured mid-board.
  assert.equal(game.addBooster('bomb', BOOSTER_LIMIT), false)

  const record = recordOf(game)
  const spliced = record.moves + encodeMoves(BOARD, [{ kind: 'booster', item: 'bomb' }])
  const verdict = verifyRun({ ...record, moves: spliced }, BOARD)
  assert.equal(verdict.ok, false)
  assert.match(verdict.reason ?? '', /may not have/)
})
