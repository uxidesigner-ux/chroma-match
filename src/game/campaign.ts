import type { Goal } from './goals.ts'
import type { BonusRound } from './variety.ts'

export const REGIONS = ['forest', 'volcano', 'prism', 'relay'] as const
export type Region = typeof REGIONS[number]
export interface Mission {
  readonly id: string
  readonly region: Region
  readonly step: number
  readonly seed: number
  readonly moves: number
  readonly reward: number
  readonly goal: Readonly<Goal>
}
const goals: Record<Region, readonly Goal[]> = {
  forest: [{ kind: 'score', need: 900 }, { kind: 'colour', colour: 3, need: 20 },
    { kind: 'power', need: 7 }, { kind: 'colour', colour: 0, need: 27 }, { kind: 'score', need: 2400 }],
  volcano: [{ kind: 'score', need: 2000 }, { kind: 'colour', colour: 0, need: 30 },
    { kind: 'power', need: 12 }, { kind: 'score', need: 4200 }, { kind: 'colour', colour: 3, need: 36 }],
  prism: [{ kind: 'score', need: 2800 }, { kind: 'colour', colour: 2, need: 45 },
    { kind: 'power', need: 16 }, { kind: 'colour', colour: 1, need: 52 }, { kind: 'score', need: 7000 }],
  relay: [{ kind: 'score', need: 2500 }, { kind: 'colour', colour: 3, need: 30 },
    { kind: 'power', need: 14 }, { kind: 'colour', colour: 0, need: 38 }, { kind: 'score', need: 5000 }],
}
const budgets: Record<Region, readonly number[]> = {
  forest: [20, 24, 24, 25, 26], volcano: [20, 22, 24, 25, 26],
  prism: [18, 20, 22, 22, 24], relay: [20, 22, 24, 24, 26],
}
/** Stable v6 encoding order. Never reorder or edit shipped v6 goals/seeds. */
export const MISSIONS: readonly Mission[] = Object.freeze(REGIONS.flatMap((region, r) =>
  goals[region].map((goal, i) => Object.freeze({
    id: `${region}-${i + 1}`, region, step: i + 1,
    seed: (18 + r * 1009 + i * 137) >>> 0, moves: budgets[region][i]!,
    reward: 40 + i * 15 + (r ? 20 : 0), goal: Object.freeze(goal),
  }))))
export function missionFor(id: unknown): Mission | null {
  return typeof id === 'string' ? MISSIONS.find(m => m.id === id) ?? null : null
}
export function missionMode(mission: Mission): BonusRound | null {
  return mission.region === 'forest' ? null : mission.region === 'volcano' ? 'factory'
    : mission.region === 'prism' ? 'festival' : 'relay'
}
export function missionGoal(mission: Mission, kinds: number): Goal {
  const goal = mission.goal
  return goal.kind === 'colour' ? { ...goal, colour: goal.colour % kinds } : { ...goal }
}
