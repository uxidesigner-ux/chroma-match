import assert from 'node:assert/strict'
import test from 'node:test'

import { findMatches, findMoves, makeGem } from './board.ts'
import { Game, MOVES_PER_LEVEL, movesForLevel } from './game.ts'
import { at, BOARD, makeGeom } from './types.ts'
import type { Geom } from './types.ts'

/**
 * The state-machine tests run on their own board for the same reason the rules
 * tests do; a separate case below checks that the shipping board is playable.
 */
const G = makeGeom(8, 8, 6)
const newGame = (seed: number, geom: Geom = G) => new Game({}, seed, geom)

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
  const moves = findMoves(game.geom, game.grid)
  if (moves.length === 0) return false
  const move = moves[0]!
  game.drag(move.a, move.b)
  settle(game, `after swapping ${move.a} with ${move.b}`)
  return true
}

test('a settled board is always whole, matchless and playable', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const game = newGame(seed)
    let score = 0

    for (let turn = 0; turn < MOVES_PER_LEVEL && game.status === 'playing'; turn++) {
      const movesBefore = game.moves
      assert.ok(playBestAvailable(game), `seed ${seed} deadlocked on turn ${turn}`)

      assert.ok(!game.grid.includes(null), `seed ${seed} left a hole after turn ${turn}`)
      assert.equal(
        findMatches(game.geom, game.grid).length,
        0,
        `seed ${seed} settled with a free match after turn ${turn}`,
      )
      assert.equal(game.moves, movesBefore - 1, 'a legal swap costs exactly one move')
      assert.ok(game.score > score, 'a legal swap always scores')
      assert.ok(findMoves(game.geom, game.grid).length > 0, 'a settled board always offers a move')
      score = game.score
    }

    assert.notEqual(game.status, 'playing', `seed ${seed} neither cleared nor ran out of moves`)
  }
})

test('an illegal swap costs nothing and leaves the board untouched', () => {
  const game = newGame(7)
  const legal = new Set(findMoves(game.geom, game.grid).map((m) => `${m.a}:${m.b}`))

  let tried = false
  for (let i = 0; i < G.cells - 1 && !tried; i++) {
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
    assert.equal(game.moves, movesForLevel(1), 'a rejected swap must not cost a move')
    assert.equal(game.score, 0)
    tried = true
  }
  assert.ok(tried, 'the fixture should contain at least one illegal swap')
})

test('a rainbow swapped onto a colour clears every gem of that colour', () => {
  const game = newGame(42)
  // Hand-place a rainbow next to a known colour rather than fishing for a
  // five-run: this exercises the detonation, not the way it is earned.
  const target = 3
  for (let i = 0; i < G.cells; i++) game.grid[i] = makeGem(i % 5 === 0 ? target : (i % 5) - 1 + 1)
  const rainbowAt = G.idx(4, 4)
  const partnerAt = G.idx(5, 4)
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
  const game = newGame(5)
  game.score = game.target // stand in for a run of good luck
  game.moves = 3
  const level = game.level

  // Any legal swap now settles the board, which is where the goal is checked.
  assert.ok(playBestAvailable(game))
  assert.equal(game.status, 'levelComplete')

  game.nextLevel()
  assert.equal(game.level, level + 1)
  assert.equal(game.moves, movesForLevel(level + 1))
  assert.equal(game.status, 'playing')
  assert.equal(game.progress, 0, 'the new level starts measuring from zero')
  assert.ok(game.target > 0)
})

test('running out of moves ends the run', () => {
  const game = newGame(11)
  game.moves = 1
  assert.ok(playBestAvailable(game))
  assert.equal(game.moves, 0)
  assert.equal(game.status, 'gameOver')
})

test('a press lights a gem up without committing to it', () => {
  const game = newGame(3)

  game.press(0)
  assert.equal(game.held, 0, 'the gem lights up on contact')
  assert.equal(game.selected, null, 'nothing is committed while the pointer is down')

  game.cancelPress()
  assert.equal(game.held, null)
  assert.equal(game.selected, null, 'sliding off the board takes the press back')

  game.press(0)
  game.cancelPress()
  game.tap(0)
  assert.equal(game.selected, 0, 'releasing on the gem commits it')
})

test('pressing a second gem leaves the first selection standing', () => {
  const game = newGame(3)
  game.tap(0)
  assert.equal(game.selected, 0)

  game.press(1)
  assert.equal(game.held, 1)
  assert.equal(game.selected, 0, 'the committed gem must survive a press elsewhere')

  game.cancelPress()
  game.tap(1)
  assert.equal(game.selected, null, 'releasing on a neighbour spends the selection')
})

test('a drag lets go of the held gem, and a busy board ignores presses', () => {
  const game = newGame(3)
  const move = findMoves(game.geom, game.grid)[0]!

  game.press(move.a)
  assert.equal(game.held, move.a)
  game.drag(move.a, move.b)
  assert.equal(game.held, null, 'the ring must not ride along with a swapping gem')

  assert.notEqual(game.phaseKind, 'idle')
  game.press(0)
  assert.equal(game.held, null, 'the board must not light up mid-animation')
})

test('the shipping board is playable, not just the one the tests pin', () => {
  // Everything above runs on G. This is the case that would fail if the board
  // were retuned into a shape that deadlocks or cannot be dealt cleanly.
  for (let seed = 1; seed <= 40; seed++) {
    const game = newGame(seed, BOARD)
    assert.equal(game.grid.length, BOARD.cells)
    assert.ok(!game.grid.includes(null), `BOARD seed ${seed} dealt a hole`)
    assert.equal(findMatches(game.geom, game.grid).length, 0, `BOARD seed ${seed} dealt a match`)
    assert.ok(findMoves(game.geom, game.grid).length > 0, `BOARD seed ${seed} dealt a deadlock`)

    // And it survives a run without corrupting itself.
    for (let turn = 0; turn < 12 && game.status === 'playing'; turn++) {
      assert.ok(playBestAvailable(game), `BOARD seed ${seed} deadlocked on turn ${turn}`)
      assert.ok(!game.grid.includes(null))
      assert.equal(findMatches(game.geom, game.grid).length, 0)
    }
  }
})
