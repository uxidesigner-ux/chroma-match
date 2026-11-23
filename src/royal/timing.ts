/** Simulation seconds, shared by the engine and the renderer's animation clock. */
export const SWAP_DURATION = .12
export const INVALID_SWAP_DURATION = .18
export const MATCH_CONVERGE_DURATION = .15
export const POWER_CREATION_DURATION = .30
export const CLEAR_DURATION = .10
export const TNT_WINDUP = .10
export const TNT_FLASH_DURATION = .20
export const PROPELLER_LIFT_DURATION = .25
export const LIGHTBALL_CHARGE_DURATION = .12
export const LIGHTBALL_RAY_DURATION = .20
export const ROCKET_WINDUP = .06
export const SUPER_REPEAT_DELAY = .14
export const fallDuration = (rows: number): number => Math.min(.44, .10 + .045 * Math.sqrt(Math.max(1, rows)) + .018 * Math.max(1, rows))
export const propellerDuration = (distance: number): number => Math.min(.75, .55 + Math.max(0, distance) * .015)
export const rocketDuration = (distance: number): number => Math.min(.26, .10 + Math.max(0, distance) * .012)
