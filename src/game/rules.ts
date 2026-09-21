import type { Power } from './types.ts'

export type RulesVersion = 1 | 2 | 3
export const CURRENT_RULES: RulesVersion = 3
export const SQUARE_HEADER = 'zx'
/** Reserved, outside every supported board's action range; valid only at the start. */
export const FUSION_HEADER = 'zy'

export function canFuse(a: Power, b: Power, rules: RulesVersion): boolean {
  return rules >= 2 && a !== 'none' && b !== 'none'
}
