import type { Power } from './types.ts'

export type RulesVersion = 1 | 2 | 3 | 4 | 5 | 6
export const CURRENT_RULES: RulesVersion = 5
/** v6 records a bounded authored mission before any action; endless stays v5. */
export const CAMPAIGN_HEADER = 'zu'
/** v5 adds a deterministic starting supply; older records keep their inventory. */
export const SUPPLIES_HEADER = 'zv'
export const VARIETY_HEADER = 'zw'
export const SQUARE_HEADER = 'zx'
/** Reserved, outside every supported board's action range; valid only at the start. */
export const FUSION_HEADER = 'zy'

export function canFuse(a: Power, b: Power, rules: RulesVersion): boolean {
  return rules >= 2 && a !== 'none' && b !== 'none'
}
