/**
 * Items: the things a player spends, as opposed to the power gems the board
 * hands them.
 *
 * The distinction matters. A power gem is made by a match and has to be swapped
 * to fire, so it is a board state the player works with. An item is held, aimed
 * anywhere, and costs no move — it is the player acting on the board directly.
 * New v5 games supply three of each up front, then replenish through play.
 * That starting supply is part of the rules, not a mutable account balance.
 *
 * WHY THE RUN SUPPLY IS REPLAYABLE
 *
 * Supplied/earned run stock expires with the run. The engine never reads an
 * account or stash balance: starting supply follows the recorded rules version,
 * and optional carried extras are bounded booster actions at the record's head.
 * Seed, version and actions reconstruct every remaining item. Verification can
 * therefore reject unearned spending without trusting mutable local balances.
 */

import type { RulesVersion } from './rules.ts'

export type Item = 'hammer' | 'rocket' | 'bomb'

/** Order is the encoding: an item's index is written into the run record. */
export const ITEMS: readonly Item[] = ['hammer', 'rocket', 'bomb']

/** Legacy v1-v4 capacity per item. */
export const MAX_HELD = 3
/** Guaranteed in every new v5 run, independently of the optional stash. */
export const START_HELD = 3
/** Room for the standard supply plus the two existing optional boosters. */
export const SUPPLIED_MAX_HELD = 5

export const inventoryCap = (rules: RulesVersion): number => rules >= 5 ? SUPPLIED_MAX_HELD : MAX_HELD

/** The chain that pays out a bomb. Reachable, but not by accident. */
export const CHAIN_REWARD_AT = 5

export type Inventory = Record<Item, number>

export function emptyInventory(): Inventory {
  return { hammer: 0, rocket: 0, bomb: 0 }
}

export function startingInventory(rules: RulesVersion): Inventory {
  return rules >= 5 ? { hammer: START_HELD, rocket: START_HELD, bomb: START_HELD } : emptyInventory()
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
