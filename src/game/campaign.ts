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
  readonly mode?: BonusRound | null
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
/** Authored, replay-versioned forest chapters. A breather follows each finale. */
const forestChapters: readonly (readonly [number, number, Goal, BonusRound | null])[] = [
  [6, 22, { kind: 'colour', colour: 1, need: 25 }, null],
  [7, 20, { kind: 'power', need: 10 }, 'factory'],
  [8, 22, { kind: 'colour', colour: 2, need: 36 }, 'festival'],
  [9, 23, { kind: 'power', need: 12 }, 'relay'],
  [10, 22, { kind: 'score', need: 3800 }, 'festival'],
  [11, 24, { kind: 'score', need: 1700 }, null],
  [12, 23, { kind: 'colour', colour: 3, need: 32 }, null],
  [13, 21, { kind: 'power', need: 16 }, 'factory'],
  [14, 22, { kind: 'colour', colour: 0, need: 40 }, 'relay'],
  [15, 22, { kind: 'score', need: 5200 }, 'festival'],
  [16, 24, { kind: 'colour', colour: 2, need: 28 }, null],
  [17, 23, { kind: 'power', need: 14 }, 'relay'],
  [18, 22, { kind: 'colour', colour: 1, need: 48 }, 'festival'],
  [19, 22, { kind: 'score', need: 4100 }, 'factory'],
  [20, 23, { kind: 'power', need: 22 }, 'relay'],
  [21, 24, { kind: 'score', need: 2200 }, null],
  [22, 24, { kind: 'colour', colour: 0, need: 36 }, null],
  [23, 22, { kind: 'power', need: 22 }, 'factory'],
  [24, 23, { kind: 'colour', colour: 2, need: 56 }, 'festival'],
  [25, 23, { kind: 'score', need: 6400 }, 'relay'],
  [26, 25, { kind: 'colour', colour: 3, need: 32 }, null],
  [27, 23, { kind: 'score', need: 5200 }, 'factory'],
  [28, 23, { kind: 'power', need: 24 }, 'relay'],
  [29, 24, { kind: 'colour', colour: 1, need: 62 }, 'festival'],
  [30, 25, { kind: 'score', need: 8000 }, 'festival'],
]
export const WORLD_MISSIONS: readonly Mission[] = Object.freeze([
  ...MISSIONS.filter(m => m.region === 'forest'),
  ...forestChapters.map(([step, moves, goal, mode]) => Object.freeze({
    id: `forest-${step}`, region: 'forest' as const, step, moves, goal: Object.freeze(goal), mode,
    seed: (431 + step * 719) >>> 0, reward: step % 5 === 0 ? 150 : 70 + Math.floor(step / 5) * 10,
  })),
  ...MISSIONS.filter(m => m.region !== 'forest'),
  // Append only: the first 45 v7 indices are already encoded in saved replays.
  ...(['volcano', 'prism', 'relay'] as const).flatMap((region, r) => {
    const chapters: readonly (readonly [number, Goal])[] = region === 'volcano' ? [
      [24,{kind:'score',need:2400}],[23,{kind:'colour',colour:0,need:34}],[23,{kind:'power',need:16}],[24,{kind:'colour',colour:3,need:38}],[25,{kind:'score',need:5200}],
      [25,{kind:'colour',colour:0,need:30}],[24,{kind:'power',need:18}],[24,{kind:'score',need:4400}],[25,{kind:'colour',colour:1,need:46}],[26,{kind:'power',need:24}],
      [25,{kind:'score',need:3200}],[24,{kind:'colour',colour:3,need:42}],[25,{kind:'power',need:24}],[25,{kind:'colour',colour:0,need:52}],[26,{kind:'score',need:7400}],
      [26,{kind:'colour',colour:1,need:36}],[25,{kind:'score',need:5800}],[25,{kind:'power',need:28}],[26,{kind:'colour',colour:3,need:58}],[26,{kind:'score',need:9000}],
      [26,{kind:'score',need:4200}],[25,{kind:'colour',colour:0,need:52}],[26,{kind:'power',need:32}],[26,{kind:'colour',colour:1,need:62}],[27,{kind:'score',need:11000}],
    ] : region === 'prism' ? [
      [24,{kind:'colour',colour:2,need:38}],[23,{kind:'score',need:3800}],[23,{kind:'colour',colour:1,need:48}],[24,{kind:'power',need:20}],[25,{kind:'score',need:7800}],
      [25,{kind:'score',need:3400}],[24,{kind:'colour',colour:0,need:50}],[24,{kind:'power',need:22}],[25,{kind:'colour',colour:2,need:60}],[26,{kind:'score',need:9000}],
      [25,{kind:'colour',colour:1,need:44}],[24,{kind:'power',need:24}],[25,{kind:'score',need:6200}],[25,{kind:'colour',colour:0,need:68}],[26,{kind:'score',need:10400}],
      [26,{kind:'score',need:4200}],[25,{kind:'colour',colour:2,need:58}],[25,{kind:'power',need:28}],[26,{kind:'colour',colour:1,need:76}],[26,{kind:'score',need:11600}],
      [26,{kind:'colour',colour:0,need:50}],[25,{kind:'score',need:8200}],[26,{kind:'power',need:32}],[26,{kind:'colour',colour:2,need:84}],[27,{kind:'score',need:13000}],
    ] : [
      [24,{kind:'power',need:14}],[23,{kind:'colour',colour:3,need:34}],[23,{kind:'score',need:3800}],[24,{kind:'power',need:20}],[25,{kind:'score',need:5800}],
      [25,{kind:'score',need:2800}],[24,{kind:'power',need:20}],[24,{kind:'colour',colour:0,need:44}],[25,{kind:'score',need:4800}],[26,{kind:'power',need:26}],
      [25,{kind:'colour',colour:3,need:36}],[24,{kind:'score',need:5200}],[25,{kind:'power',need:26}],[25,{kind:'colour',colour:1,need:52}],[26,{kind:'score',need:7800}],
      [26,{kind:'power',need:20}],[25,{kind:'colour',colour:0,need:44}],[25,{kind:'score',need:6400}],[26,{kind:'power',need:30}],[26,{kind:'score',need:9400}],
      [26,{kind:'score',need:4000}],[25,{kind:'power',need:28}],[26,{kind:'colour',colour:3,need:56}],[26,{kind:'power',need:34}],[27,{kind:'score',need:11500}],
    ]
    return chapters.map(([moves, goal], i) => Object.freeze({
      id: `${region}-${i+6}`, region, step: i+6, moves, goal:Object.freeze(goal),
      seed: (84017 + r*15485863 + (i+6)*719) >>> 0,
      reward: (i+6)%5===0 ? 150+Math.floor((i+6)/5)*10 : 70+Math.floor((i+6)/5)*10,
    }))
  }),
])
export function missionFor(id: unknown): Mission | null {
  return typeof id === 'string' ? WORLD_MISSIONS.find(m => m.id === id) ?? null : null
}
export function missionMode(mission: Mission): BonusRound | null {
  if (mission.mode !== undefined) return mission.mode
  return mission.region === 'forest' ? null : mission.region === 'volcano' ? 'factory'
    : mission.region === 'prism' ? 'festival' : 'relay'
}
export function missionGoal(mission: Mission, kinds: number): Goal {
  const goal = mission.goal
  return goal.kind === 'colour' ? { ...goal, colour: goal.colour % kinds } : { ...goal }
}
