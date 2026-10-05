import { goalForLevel, scoreTargetForLevel } from './goals.ts'
import type { Goal } from './goals.ts'
import type { RulesVersion } from './rules.ts'
import type { Geom } from './types.ts'

export const FEVER_CHARGE = 100
export const FEVER_TURNS = 3
export const UPGRADES = ['blast', 'stripe', 'echo'] as const
export type Upgrade = typeof UPGRADES[number]
export type Upgrades = Record<Upgrade, number>
export const UPGRADE_CAP = 2
export type BonusRound = 'factory' | 'festival' | 'relay'
export const emptyUpgrades = (): Upgrades => ({ blast: 0, stripe: 0, echo: 0 })

export function bonusForLevel(level: number, rules: RulesVersion): BonusRound | null {
  if (rules < 4 || level % 5 !== 0) return null
  return (['factory', 'festival', 'relay'] as const)[(level / 5 - 1) % 3] ?? null
}
export function stageGoal(level: number, kinds: number, rules: RulesVersion): Goal {
  return bonusForLevel(level, rules)
    ? { kind: 'score', need: Math.round(scoreTargetForLevel(level) * .8) }
    : goalForLevel(level, kinds)
}
export function areaCells(geom: Geom, cell: number, radius: number): number[] {
  const out: number[] = []
  for (let y = geom.rowOf(cell) - radius; y <= geom.rowOf(cell) + radius; y++)
    for (let x = geom.colOf(cell) - radius; x <= geom.colOf(cell) + radius; x++)
      if (geom.inBounds(x, y)) out.push(geom.idx(x, y))
  return out
}
