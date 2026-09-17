import assert from 'node:assert/strict'
import { test } from 'node:test'
import { boardFrom } from './players.ts'
import type { Player } from './players.ts'
import { BOARD } from '../game/types.ts'
import { DEFAULT_SPEC } from '../avatar/spec.ts'

function player(uid: string, score: number | null, at = 0): Player {
  return {
    uid,
    name: uid,
    code: 'XXXXXXX',
    photo: '',
    avatar: DEFAULT_SPEC,
    best:
      score === null
        ? null
        : { seed: 1, moves: 'aa', score, level: 3, board: { ...BOARD } },
    bestAt: at,
  }
}

test('the board is one row per player, best first', () => {
  const rows = boardFrom([player('a', 900), player('b', 4200), player('c', 1500)], 'c')
  assert.deepEqual(
    rows.map((row) => row.name),
    ['b', 'c', 'a'],
  )
  assert.equal(rows.find((row) => row.mine)?.name, 'c')
})

test('a tie goes to whoever got there first', () => {
  const rows = boardFrom([player('late', 1000, 200), player('early', 1000, 100)], 'x')
  assert.deepEqual(
    rows.map((row) => row.name),
    ['early', 'late'],
  )
})

test('a player with no posted run is not a row', () => {
  // A friend who has signed in but never posted should be absent rather than
  // sitting at the bottom on zero — that reads as a score, and it is not one.
  const rows = boardFrom([player('a', null), player('b', 10)], 'a')
  assert.deepEqual(
    rows.map((row) => row.name),
    ['b'],
  )
})

test('every row carries the run behind it, so the viewer can replay it', () => {
  // This is the only thing making a friend's number worth showing next to your
  // own: it is checked the same way a stranger's is.
  for (const row of boardFrom([player('a', 900), player('b', 4200)], 'a')) {
    assert.ok(row.run, `${row.name} has no run attached`)
    assert.equal(row.run.score, row.score)
  }
})
