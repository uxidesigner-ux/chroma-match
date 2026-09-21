import type { Power } from './types.ts'

export type RulesVersion = 1 | 2
export const CURRENT_RULES: RulesVersion = 2
/** Reserved, outside every supported board's action range; valid only at the start. */
export const FUSION_HEADER = 'zy'

export function canFuse(a: Power, b: Power, rules: RulesVersion): boolean {
  return rules >= 2 && a !== 'none' && b !== 'none'
}
