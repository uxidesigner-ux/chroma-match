import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyGravity,
  createBoard,
  expandClears,
  findMatches,
  findMoves,
  isLegalSwap,
  makeGem,
  powerFor,
} from './board.ts'
import { makeRng } from './rng.ts'
import { at, makeGeom } from './types.ts'
import type { Grid } from './types.ts'

/**
 * The rules tests pin their own board rather than importing the shipping one,
 * so retuning the board for a phone cannot quietly invalidate a fixture — and
 * so the fixtures stay readable as eight rows of eight letters.
 */
const G = makeGeom(8, 8, 6)

/**
 * Builds a grid from eight eight-character rows, one letter per colour.
 * `.` leaves a hole, which is how gravity is exercised.
 */
function grid(rows: string[]): Grid {
  assert.equal(rows.length, G.rows, 'a fixture needs one string per row')
  const cells: Grid = []
  for (const row of rows) {
    assert.equal(row.length, G.cols, `row "${row}" is not ${G.cols} wide`)
    for (const ch of row) {
      cells.push(ch === '.' ? null : makeGem(ch.charCodeAt(0) - 65))
    }
  }
  return cells
}

const kindsOf = (g: Grid): string =>
  g.map((cell) => (cell ? String.fromCharCode(65 + cell.kind) : '.')).join('')

test('finds a horizontal run of three', () => {
  const g = grid([
    'AAABCDEF',
    'BCDEFABC',
    'CDEFABCD',
    'DEFABCDE',
    'EFABCDEF',
    'FABCDEFA',
    'ABCDEFAB',
    'BCDEFABC',
  ])
  const groups = findMatches(G, g)
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0]?.cells.sort((a, b) => a - b), [0, 1, 2])
  assert.equal(powerFor(groups[0]!), 'none')
})

test('finds a vertical run and reads its orientation', () => {
  const g = grid([
    'ABCDEFAB',
    'ACDEFABC',
    'ADEFABCD',
    'BEFABCDE',
    'CFABCDEF',
    'DABCDEFA',
    'EBCDEFAB',
    'FCDEFABC',
  ])
  const groups = findMatches(G, g)
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0]?.cells.sort((a, b) => a - b), [0, 8, 16])
})

test('a run of four earns a line clearer pointing the same way', () => {
  const g = grid([
    'AAAABCDE',
    'BCDEFABC',
    'CDEFABCD',
    'DEFABCDE',
    'EFABCDEF',
    'FABCDEFA',
    'ABCDEFAB',
    'BCDEFABC',
  ])
  const groups = findMatches(G, g)
  assert.equal(groups.length, 1)
  assert.equal(groups[0]?.longest, 4)
  assert.equal(powerFor(groups[0]!), 'rowClear')
})

test('an L shape merges into one group and earns a bomb', () => {
  const g = grid([
    'AAABCDEF',
    'ABCDEFAB',
    'ACDEFABC',
    'DEFABCDE',
    'EFABCDEF',
    'FABCDEFA',
    'ABCDEFAB',
    'BCDEFABC',
  ])
  const groups = findMatches(G, g)
  assert.equal(groups.length, 1, 'the arms of an L must not be reported separately')
  assert.equal(groups[0]?.cells.length, 5)
  assert.equal(powerFor(groups[0]!), 'bomb')
})

test('five in a line earns a rainbow', () => {
  const g = grid([
    'AAAAABCD',
    'BCDEFABC',
    'CDEFABCD',
    'DEFABCDE',
    'EFABCDEF',
    'FABCDEFA',
    'ABCDEFAB',
    'BCDEFABC',
  ])
  assert.equal(powerFor(findMatches(G, g)[0]!), 'rainbow')
})

test('a clear chains through any power gem it catches', () => {
  const g = grid([
    'ABCDEFAB',
    'BCDEFABC',
    'CDEFABCD',
    'DEFABCDE',
    'EFABCDEF',
    'FABCDEFA',
    'ABCDEFAB',
    'BCDEFABC',
  ])
  // Put a row clearer in the middle of the board and detonate its cell.
  const seed = G.idx(3, 3)
  at(g, seed)!.power = 'rowClear'
  const { cleared, blasts } = expandClears(G, g, [seed])
  assert.equal(cleared.size, G.cols, 'a row clearer should take the whole row')
  for (let c = 0; c < G.cols; c++) assert.ok(cleared.has(G.idx(c, 3)))
  // The expansion also reports what fired, so the renderer can show the shot
  // leaving rather than the row simply ceasing to exist.
  assert.deepEqual(blasts, [{ cell: seed, kind: 'row' }])
})

test('gravity closes holes, preserves column order, and refills the top', () => {
  const g = grid([
    'ABCDEFAB',
    'BCDEFABC',
    'CDEFABCD',
    '...DEFAB', // three holes punched in the left of row 3
    'EFABCDEF',
    'FABCDEFA',
    'ABCDEFAB',
    'BCDEFABC',
  ])
  const columnBefore = [0, 1, 2, 4, 5, 6, 7].map((r) => at(g, G.idx(0, r))!.kind)
  const { maxDrop } = applyGravity(G, g, makeRng(1))

  assert.ok(!kindsOf(g).includes('.'), 'no holes may survive gravity')
  assert.equal(maxDrop, 1, 'each surviving gem above the hole falls exactly one row')

  // The gems that were above the hole keep their order, one row lower.
  const columnAfter = [1, 2, 3].map((r) => at(g, G.idx(0, r))!.kind)
  assert.deepEqual(columnAfter, columnBefore.slice(0, 3))
  // The new gem at the top is drawn off-board and eases down into place.
  assert.equal(at(g, G.idx(0, 0))!.oy, -1)
})

test('a swap is only legal when it actually makes a match', () => {
  const g = grid([
    'AABABCAB', // row 0 reads A A B A — sliding that B away completes four As
    'BCABCABC',
    'CABCABCA',
    'ABCABCAB',
    'BCABCABC',
    'CABCABCA',
    'ABCABCAB',
    'BCABCABC',
  ])
  assert.equal(findMatches(G, g).length, 0, 'the fixture must start clean')

  assert.ok(isLegalSwap(G, g, G.idx(2, 0), G.idx(2, 1)), 'this swap completes a line of four As')
  assert.ok(!isLegalSwap(G, g, G.idx(0, 0), G.idx(7, 7)), 'distant cells are never swappable')

  // isLegalSwap and findMoves must never disagree about the same pair.
  const listed = new Set(findMoves(G, g).map((m) => `${m.a}:${m.b}`))
  assert.ok(listed.size > 0)
  for (let r = 0; r < G.rows; r++) {
    for (let c = 0; c < G.cols; c++) {
      const a = G.idx(c, r)
      for (const b of [c + 1 < G.cols ? G.idx(c + 1, r) : -1, r + 1 < G.rows ? G.idx(c, r + 1) : -1]) {
        if (b < 0) continue
        assert.equal(
          isLegalSwap(G, g, a, b),
          listed.has(`${a}:${b}`),
          `disagreement about swapping ${a} with ${b}`,
        )
      }
    }
  }
})

test('a fresh board is playable: no free matches, at least one move', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const g = createBoard(G, makeRng(seed))
    assert.equal(findMatches(G, g).length, 0, `seed ${seed} started with a free match`)
    assert.ok(findMoves(G, g).length > 0, `seed ${seed} started deadlocked`)
    assert.ok(!kindsOf(g).includes('.'), `seed ${seed} left a hole`)
  }
})
