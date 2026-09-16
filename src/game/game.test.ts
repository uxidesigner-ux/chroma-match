import assert from 'node:assert/strict'
import test from 'node:test'

import { findMatches, findMoves, makeGem } from './board.ts'
import { Game, MOVES_PER_LEVEL } from './game.ts'
import { at, CELLS, idx } from './types.ts'

const FRAME = 1 / 60

/** Runs the clock until the board stops animating. */
function settle(game: Game, label = ''): void {
  for (let i = 0; i < 4000; i++) {
    if (game.phaseKind === 'idle') return
    game.update(FRAME)
  }
  assert.fail(`board never settled ${label}`)
}

/** Plays one legal move, chosen deterministically so failures reproduce. */
function playBestAvailable(game: Game): boolean {
  const moves = findMoves(game.grid)
  if (moves.length === 0) return false
  const move = moves[0]!
  game.drag(move.a, move.b)
  settle(game, `after swapping ${move.a} with ${move.b}`)
  return true
}

test('a settled board is always whole, matchless and playable', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const game = new Game({}, seed)
    let score = 0

    for (let turn = 0; turn < MOVES_PER_LEVEL && game.status === 'playing'; turn++) {
      const movesBefore = game.moves
      assert.ok(playBestAvailable(game), `seed ${seed} deadlocked on turn ${turn}`)

      assert.ok(!game.grid.includes(null), `seed ${seed} left a hole after turn ${turn}`)
      assert.equal(
        findMatches(game.grid).length,
        0,
        `seed ${seed} settled with a free match after turn ${turn}`,
      )
      assert.equal(game.moves, movesBefore - 1, 'a legal swap costs exactly one move')
      assert.ok(game.score > score, 'a legal swap always scores')
      assert.ok(findMoves(game.grid).length > 0, 'a settled board always offers a move')
      score = game.score
    }

    assert.notEqual(game.status, 'playing', `seed ${seed} neither cleared nor ran out of moves`)
  }
})

test('an illegal swap costs nothing and leaves the board untouched', () => {
  const game = new Game({}, 7)
  const legal = new Set(findMoves(game.grid).map((m) => `${m.a}:${m.b}`))

  let tried = false
  for (let i = 0; i < CELLS - 1 && !tried; i++) {
    const a = i
    const b = i + 1
    if (legal.has(`${a}:${b}`)) continue
    if (a % 8 === 7) continue // not actually neighbours across the row break

    const before = game.grid.map((g) => g?.kind)
    game.drag(a, b)
    settle(game)
    assert.deepEqual(
      game.grid.map((g) => g?.kind),
      before,
      'the gems must end up exactly where they started',
    )
    assert.equal(game.moves, MOVES_PER_LEVEL, 'a rejected swap must not cost a move')
    assert.equal(game.score, 0)
    tried = true
  }
  assert.ok(tried, 'the fixture should contain at least one illegal swap')
})

test('a rainbow swapped onto a colour clears every gem of that colour', () => {
  const game = new Game({}, 42)
  // Hand-place a rainbow next to a known colour rather than fishing for a
  // five-run: this exercises the detonation, not the way it is earned.
  const target = 3
  for (let i = 0; i < CELLS; i++) game.grid[i] = makeGem(i % 5 === 0 ? target : (i % 5) - 1 + 1)
  const rainbowAt = idx(4, 4)
  const partnerAt = idx(5, 4)
  game.grid[rainbowAt] = makeGem(0, 'rainbow')
  game.grid[partnerAt] = makeGem(target)

  const before = game.grid.filter((g) => g?.kind === target).length
  assert.ok(before > 5, 'the fixture needs plenty of the target colour on the board')

  game.drag(partnerAt, rainbowAt)
  // Stop the clock right after the clear is committed, before gravity refills.
  for (let i = 0; i < 400 && game.phaseKind !== 'clear'; i++) game.update(FRAME)
  assert.equal(game.phaseKind, 'clear')

  const clearing = game.grid.filter((g) => g?.clearing).length
  assert.ok(clearing >= before, `expected at least ${before} gems clearing, saw ${clearing}`)
  assert.ok(at(game.grid, rainbowAt)?.clearing, 'the rainbow goes with them')
})

test('clearing the target advances the level and refills the move counter', () => {
  const game = new Game({}, 5)
  game.score = game.target // stand in for a run of good luck
  game.moves = 3
  const level = game.level

  // Any legal swap now settles the board, which is where the goal is checked.
  assert.ok(playBestAvailable(game))
  assert.equal(game.status, 'levelComplete')

  game.nextLevel()
  assert.equal(game.level, level + 1)
  assert.equal(game.moves, MOVES_PER_LEVEL)
  assert.equal(game.status, 'playing')
  assert.equal(game.progress, 0, 'the new level starts measuring from zero')
  assert.ok(game.target > 0)
})

test('running out of moves ends the run', () => {
  const game = new Game({}, 11)
  game.moves = 1
  assert.ok(playBestAvailable(game))
  assert.equal(game.moves, 0)
  assert.equal(game.status, 'gameOver')
})
