import type { LightballRay } from './model.ts'
/** Simulation seconds, shared by the engine and the renderer's animation clock. */
export const SWAP_DURATION = .12
export const INVALID_SWAP_DURATION = .18
export const MATCH_CONVERGE_DURATION = .15
export const POWER_CREATION_DURATION = .30
export const CLEAR_DURATION = .10
export const TNT_WINDUP = .10
export const TNT_FLASH_DURATION = .20
export const PROPELLER_LIFT_DURATION = .25
export const LIGHTBALL_CHARGE_DURATION = .24
/** Upper bound for a volley; every impact uses its own ray's arrival time. */
export const LIGHTBALL_RAY_DURATION = .72
export const ROCKET_WINDUP = .06
export const SUPER_REPEAT_DELAY = .14
export const fallDuration = (rows: number): number => Math.min(.44, .10 + .045 * Math.sqrt(Math.max(1, rows)) + .018 * Math.max(1, rows))
export const propellerDuration = (distance: number): number => Math.min(.75, .55 + Math.max(0, distance) * .015)
export const rocketDuration = (distance: number): number => Math.min(.26, .10 + Math.max(0, distance) * .012)
export function lightballRays(from: number, cells: readonly number[], cols: number): LightballRay[] {
  const distance = (cell: number) => Math.hypot(cell % cols - from % cols, Math.floor(cell / cols) - Math.floor(from / cols))
  const targets = [...new Set(cells)].filter(cell => cell !== from).sort((a, b) => distance(a) - distance(b) || a - b)
  const spacing = Math.min(.018, .36 / Math.max(1, targets.length - 1))
  return targets.map((cell, i) => ({ cell, delay: i * spacing, duration: Math.min(.36, .22 + distance(cell) * .018) }))
}
