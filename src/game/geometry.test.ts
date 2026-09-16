import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyGravity,
  blastRadius,
  createBoard,
  findMatches,
  findMoves,
  makeGem,
} from './board.ts'
import { makeRng } from './rng.ts'
import { at, makeGeom } from './types.ts'
import type { Geom, Grid } from './types.ts'

/**
 * Every other rules test pins a square 8x8 board, which is exactly the shape
 * that cannot catch the mistake this whole refactor made possible: while cols
 * and rows were the same number, swapping them was invisible. These run on
 * boards where the two differ, in both orientations, so a transposed index or a
 * loop bounded by the wrong axis shows up as a wrong count rather than as
 * nothing at all.
 */
const TALL = makeGeom(5, 8, 5) // cols < rows, like the shipping board
const WIDE = makeGeom(8, 5, 5) // cols > rows, the opposite mistake

/** A gem colour that appears nowhere in `cleanGrid`, for stamping runs. */
const MARK = 3

/**
 * A full board with no matches on any geometry: stepping the colour by one
 * across a row and by two down a column means neither direction can repeat
 * within three cells.
 */
function cleanGrid(geom: Geom): Grid {
  const grid: Grid = []
  for (let r = 0; r < geom.rows; r++) {
    for (let c = 0; c < geom.cols; c++) grid.push(makeGem((c + 2 * r) % 3))
  }
  return grid
}

function stamp(geom: Geom, grid: Grid, cells: ReadonlyArray<readonly [number, number]>): number[] {
  const indices = cells.map(([c, r]) => geom.idx(c, r))
  for (const i of indices) grid[i] = makeGem(MARK)
  return indices
}

test('a clean board really is clean on every shape tested', () => {
  for (const geom of [TALL, WIDE]) {
    assert.equal(findMatches(geom, cleanGrid(geom)).length, 0, `${geom.cols}x${geom.rows}`)
  }
})

test('horizontal and vertical runs land on the cells they actually occupy', () => {
  for (const geom of [TALL, WIDE]) {
    const label = `${geom.cols}x${geom.rows}`

    const across = cleanGrid(geom)
    const acrossCells = stamp(geom, across, [
      [1, 3],
      [2, 3],
      [3, 3],
    ])
    const acrossGroups = findMatches(geom, across)
    assert.equal(acrossGroups.length, 1, `${label}: one horizontal group`)
    assert.deepEqual(
      [...(acrossGroups[0]?.cells ?? [])].sort((a, b) => a - b),
      acrossCells,
      `${label}: a transposed index would report a different set of cells`,
    )
    assert.equal(acrossGroups[0]?.hasHorizontal, true, label)
    assert.equal(acrossGroups[0]?.hasVertical, false, label)

    const down = cleanGrid(geom)
    const downCells = stamp(geom, down, [
      [2, 0],
      [2, 1],
      [2, 2],
    ])
    const downGroups = findMatches(geom, down)
    assert.equal(downGroups.length, 1, `${label}: one vertical group`)
    assert.deepEqual(
      [...(downGroups[0]?.cells ?? [])].sort((a, b) => a - b),
      downCells,
      label,
    )
    assert.equal(downGroups[0]?.hasVertical, true, label)
    assert.equal(downGroups[0]?.hasHorizontal, false, label)
  }
})

test('a line clearer takes its own axis, not the other one', () => {
  for (const geom of [TALL, WIDE]) {
    const label = `${geom.cols}x${geom.rows}`
    const grid = cleanGrid(geom)
    const where = geom.idx(2, 2)

    // The two axes have different lengths here, so clearing the wrong one is a
    // wrong count rather than a coincidence.
    ;(at(grid, where) as NonNullable<ReturnType<typeof at>>).power = 'rowClear'
    const row = blastRadius(geom, grid, where)
    assert.equal(row.length, geom.cols, `${label}: a row is ${geom.cols} wide`)
    assert.ok(row.every((i) => geom.rowOf(i) === 2), `${label}: every cell is in row 2`)
    ;(at(grid, where) as NonNullable<ReturnType<typeof at>>).power = 'colClear'
    const column = blastRadius(geom, grid, where)
    assert.equal(column.length, geom.rows, `${label}: a column is ${geom.rows} tall`)
    assert.ok(column.every((i) => geom.colOf(i) === 2), `${label}: every cell is in column 2`)
  }
})

test('a bomb clips against whichever edge it is against', () => {
  for (const geom of [TALL, WIDE]) {
    const label = `${geom.cols}x${geom.rows}`
    const grid = cleanGrid(geom)

    const corner = geom.idx(0, 0)
    ;(at(grid, corner) as NonNullable<ReturnType<typeof at>>).power = 'bomb'
    assert.equal(blastRadius(geom, grid, corner).length, 4, `${label}: a corner bomb`)

    const middle = geom.idx(2, 2)
    ;(at(grid, middle) as NonNullable<ReturnType<typeof at>>).power = 'bomb'
    assert.equal(blastRadius(geom, grid, middle).length, 9, `${label}: a bomb in the open`)

    const lastCol = geom.idx(geom.cols - 1, 2)
    ;(at(grid, lastCol) as NonNullable<ReturnType<typeof at>>).power = 'bomb'
    assert.equal(blastRadius(geom, grid, lastCol).length, 6, `${label}: against the right edge`)

    const lastRow = geom.idx(2, geom.rows - 1)
    ;(at(grid, lastRow) as NonNullable<ReturnType<typeof at>>).power = 'bomb'
    assert.equal(blastRadius(geom, grid, lastRow).length, 6, `${label}: against the bottom`)
  }
})

test('gravity falls down columns, whichever way the board is stretched', () => {
  for (const geom of [TALL, WIDE]) {
    const label = `${geom.cols}x${geom.rows}`
    const grid = cleanGrid(geom)

    // Punch a hole halfway down column 1 and remember what sits above it.
    const hole = geom.idx(1, 2)
    const above = [0, 1].map((r) => at(grid, geom.idx(1, r))?.kind)
    grid[hole] = null

    const { maxDrop } = applyGravity(geom, grid, makeRng(7))
    assert.equal(maxDrop, 1, `${label}: the stack above a single hole falls one row`)
    assert.ok(
      grid.every((cell) => cell !== null),
      `${label}: gravity must leave no holes`,
    )
    assert.equal(grid.length, geom.cells, `${label}: and must not resize the board`)
    assert.deepEqual(
      [1, 2].map((r) => at(grid, geom.idx(1, r))?.kind),
      above,
      `${label}: the gems above the hole keep their order, one row lower`,
    )
    // Untouched columns must not have moved at all.
    assert.equal(at(grid, geom.idx(3, 0))?.kind, (3 + 0) % 3, label)
  }
})

test('a dealt board is playable on either orientation', () => {
  for (const geom of [TALL, WIDE]) {
    for (let seed = 1; seed <= 60; seed++) {
      const grid = createBoard(geom, makeRng(seed))
      const label = `${geom.cols}x${geom.rows} seed ${seed}`
      assert.equal(grid.length, geom.cells, label)
      assert.ok(!grid.includes(null), `${label}: dealt a hole`)
      assert.equal(findMatches(geom, grid).length, 0, `${label}: dealt a free match`)
      assert.ok(findMoves(geom, grid).length > 0, `${label}: dealt a deadlock`)
    }
  }
})

test('makeGeom refuses boards the rest of the game cannot render or play', () => {
  assert.throws(() => makeGeom(2, 8, 5), /cannot hold a match/)
  assert.throws(() => makeGeom(6, 2, 5), /cannot hold a match/)
  // The renderer wraps kinds around the palette, so too many colours would deal
  // two gems that are pixel-identical and impossible to tell apart.
  assert.throws(() => makeGeom(6, 9, 7), /3 to 6 colours/)
  assert.throws(() => makeGeom(6, 9, 2), /3 to 6 colours/)
})
