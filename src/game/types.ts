/**
 * Board geometry and colour count.
 *
 * These were module constants until the board had to be sized for a thumb
 * rather than a desktop window. Gathering them into one value means the rules,
 * the renderer and the tuning harness all read the same numbers, a different
 * shape can be measured without touching the rules, and the tests can pin their
 * own board instead of breaking every time the shipping one is retuned.
 */
export interface Geom {
  readonly cols: number
  readonly rows: number
  readonly cells: number
  /** How many gem colours are in play. More colours makes matches rarer. */
  readonly kinds: number
  idx(c: number, r: number): number
  colOf(i: number): number
  rowOf(i: number): number
  inBounds(c: number, r: number): boolean
}

export function makeGeom(cols: number, rows: number, kinds: number): Geom {
  return {
    cols,
    rows,
    kinds,
    cells: cols * rows,
    idx: (c, r) => r * cols + c,
    colOf: (i) => i % cols,
    rowOf: (i) => Math.floor(i / cols),
    inBounds: (c, r) => c >= 0 && c < cols && r >= 0 && r < rows,
  }
}

/**
 * The shipping board, chosen by `npm run tune` rather than by taste — see the
 * table in that script's output.
 *
 * It is portrait-shaped and narrow on purpose. On a phone the board's width is
 * the binding constraint, so every column removed buys a bigger tap target;
 * the height that frees up goes into rows instead of the empty margins the
 * square board left above and below itself.
 */
export const BOARD = makeGeom(6, 9, 5)

/** Index into the palette, 0 .. kinds-1. */
export type Kind = number

/**
 * Powers are earned by matching more than three at once:
 *   4 in a row     -> rowClear   (clears the whole row)
 *   4 in a column  -> colClear   (clears the whole column)
 *   an L or T      -> bomb       (clears the surrounding 3x3)
 *   5 or more      -> rainbow    (swap it onto any gem to clear every gem of that colour)
 */
export type Power = 'none' | 'rowClear' | 'colClear' | 'bomb' | 'rainbow'

export interface Gem {
  /** Stable identity, so the renderer can follow a gem as it falls. */
  readonly id: number
  kind: Kind
  power: Power
  /**
   * Where the gem was, relative to the cell it now occupies, when the current
   * animation phase began — measured in cells. The renderer interpolates from
   * this back to zero, so a gem that fell three rows starts drawn three rows up.
   */
  ox: number
  oy: number
  /** True while the gem is playing its clear animation and about to be removed. */
  clearing: boolean
  /** Seconds of "just became a power gem" glow left to play. */
  flash: number
}

/** Row-major grid. A null cell is a hole waiting for gravity to fill it. */
export type Grid = (Gem | null)[]

/** Reads a cell without tripping over `noUncheckedIndexedAccess`. */
export const at = (grid: Grid, i: number): Gem | null => grid[i] ?? null
