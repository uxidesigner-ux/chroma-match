export const COLS = 8
export const ROWS = 8
export const CELLS = COLS * ROWS

/** How many gem colours are in play. Raising this makes matches rarer. */
export const KINDS = 6

/** Index into the palette, 0 .. KINDS-1. */
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

export const idx = (c: number, r: number): number => r * COLS + c
export const colOf = (i: number): number => i % COLS
export const rowOf = (i: number): number => Math.floor(i / COLS)
export const inBounds = (c: number, r: number): boolean =>
  c >= 0 && c < COLS && r >= 0 && r < ROWS

/** Reads a cell without tripping over `noUncheckedIndexedAccess`. */
export const at = (grid: Grid, i: number): Gem | null => grid[i] ?? null
