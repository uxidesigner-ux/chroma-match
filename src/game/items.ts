/**
 * Items: the things a player spends, as opposed to the power gems the board
 * hands them.
 *
 * The distinction matters. A power gem is made by a match and has to be swapped
 * to fire, so it is a board state the player works with. An item is held, aimed
 * anywhere, and costs no move — it is the player acting on the board directly.
 * That is the whole appeal, and it is also why the supply has to be earned
 * rather than bought.
 *
 * WHY THERE IS NO PERSISTENT INVENTORY
 *
 * Items are earned inside a run and die with it. This is not a scope cut, it is
 * what the leaderboard requires. A posted run is verified by replaying its seed
 * and its actions, so everything a run depends on has to be inside that record:
 * an inventory carried in from previous sessions would make two players with
 * identical seeds and identical moves score differently, and the replay would
 * have no way to tell an honest run from a forged one. It would also mean the
 * top of the board belongs to whoever hoarded the longest, which is a different
 * game from the one this is.
 */

export type Item = 'hammer' | 'rocket' | 'bomb'

/** Order is the encoding: an item's index is written into the run record. */
export const ITEMS: readonly Item[] = ['hammer', 'rocket', 'bomb']

/** How many of one item can be held at once. */
export const MAX_HELD = 3

/** The chain that pays out a bomb. Reachable, but not by accident. */
export const CHAIN_REWARD_AT = 5

export type Inventory = Record<Item, number>

export function emptyInventory(): Inventory {
  return { hammer: 0, rocket: 0, bomb: 0 }
}

/**
 * What finishing a level pays.
 *
 * A fixed rotation rather than a roll of the dice: on a board that is chased for
 * score, a player who can see that the next level pays a rocket can plan around
 * it, and planning is the part worth rewarding. It is also one less thing that
 * has to be deterministic for the replay to work — there is no RNG here to keep
 * in step.
 */
export function itemForLevel(level: number): Item {
  return ITEMS[(level - 1) % ITEMS.length] as Item
}

/** What a gem is worth to each item, as a set of cells to clear. */
export function blastCells(
  item: Item,
  cell: number,
  geom: { cols: number; rows: number; idx(c: number, r: number): number; colOf(i: number): number; rowOf(i: number): number },
): number[] {
  const col = geom.colOf(cell)
  const row = geom.rowOf(cell)
  const cells: number[] = []

  if (item === 'hammer') {
    cells.push(cell)
  } else if (item === 'rocket') {
    for (let c = 0; c < geom.cols; c++) cells.push(geom.idx(c, row))
  } else {
    for (let r = row - 1; r <= row + 1; r++) {
      for (let c = col - 1; c <= col + 1; c++) {
        if (c < 0 || c >= geom.cols || r < 0 || r >= geom.rows) continue
        cells.push(geom.idx(c, r))
      }
    }
  }
  return cells
}
