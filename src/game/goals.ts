import type { Kind } from './types.ts'

/**
 * What a level asks for.
 *
 * Every level used to ask the same question — reach a score — with the number
 * going up. That is a difficulty curve, not variety: the best way to play level
 * twelve was exactly the best way to play level one, only for longer. A goal
 * that changes what a good move *is* changes the game; a goal that only changes
 * how many of them you need changes the wait.
 *
 * Three kinds, because each one rewards a different read of the board:
 *
 *   - `score` rewards cascades: the biggest number comes from the deepest chain.
 *   - `colour` rewards ignoring cascades when they are the wrong colour, which
 *     is the first time this game asks a player to turn a good match down.
 *   - `power` rewards building fours and fives instead of taking every three on
 *     offer, so it pulls against the habit the other two build.
 *
 * All of it is a pure function of the level number. That is not a stylistic
 * choice: a run is verified by replaying it, so a goal decided by a dice roll
 * would have to be recorded and trusted, and a goal derived from the level is
 * simply recomputed by anyone replaying it.
 */
export type Goal =
  | { kind: 'score'; need: number }
  | { kind: 'colour'; colour: Kind; need: number }
  | { kind: 'power'; need: number }

export type GoalKind = Goal['kind']

const BASE_TARGET = 1800
const TARGET_STEP = 200

/**
 * The order goals arrive in.
 *
 * Score twice at the front so a new player learns the board before the game
 * asks them to do anything clever with it, then one of each with score in
 * between as the rest. The cycle repeats; the numbers do not.
 */
const CYCLE: readonly GoalKind[] = ['score', 'score', 'colour', 'score', 'power', 'score']

export function scoreTargetForLevel(level: number): number {
  return BASE_TARGET + (level - 1) * TARGET_STEP
}

/*
 * The two counts below are measured, not argued.
 *
 * They started from a guess about what felt reasonable — a fifth of the board,
 * power gems being rare — and `npm run tune` says the guess was wrong in the
 * same direction twice. A colour level finished in 13 of its 25 moves and a
 * power level in 8.5, against 19 for the score level either of them sat next
 * to. They were not variety, they were a rest stop that still paid an item.
 *
 * Both curves now aim to use around three quarters of the move budget, which
 * puts their clear rates alongside the score levels rather than well above
 * them. The sweep's third table is what these are checked against.
 */

/** Gems of one colour. The board gives up roughly 1.3 a move at this level. */
function colourNeed(level: number): number {
  return 21 + level + Math.floor(level / 3)
}

/** Power gems. About two moves each, so this climbs faster than it looks. */
function powerNeed(level: number): number {
  return 7 + Math.floor(level / 3)
}

export function goalForLevel(level: number, kinds: number): Goal {
  const kind = CYCLE[(level - 1) % CYCLE.length] as GoalKind
  if (kind === 'colour') {
    // Spread across the palette rather than always picking the same colour: a
    // multiplier that shares a factor with the palette size would keep landing
    // on the same one, so this steps by a number coprime with it for 5 and 6.
    const colour = (level * 7) % kinds
    return { kind: 'colour', colour: colour as Kind, need: colourNeed(level) }
  }
  if (kind === 'power') return { kind: 'power', need: powerNeed(level) }
  return { kind: 'score', need: scoreTargetForLevel(level) }
}

/** One line for the HUD, in the player's terms rather than the type's. */
export function goalLabel(
  goal: Goal,
  colourName: (colour: Kind) => string,
  words: { score: string; power: string; gems: (colour: string) => string } = DEFAULT_WORDS,
): string {
  if (goal.kind === 'score') return words.score
  if (goal.kind === 'power') return words.power
  return words.gems(colourName(goal.colour))
}

/**
 * English, for the tests and for any caller with nothing better.
 *
 * The words are a parameter rather than an import because this module is the
 * rules of the game — what a level asks for — and the rules do not depend on
 * what language somebody is reading them in. The tests assert on these
 * directly, which is the other reason they stay here.
 */
const DEFAULT_WORDS = {
  score: 'Score',
  power: 'Power gems',
  gems: (colour: string) => `${colour} gems`,
}
