import { coins, setCoins } from './meta.ts'
import { dayOf } from './daily.ts'

/**
 * Three things to do today.
 *
 * The daily reward pays for opening the game; these pay for playing it a
 * particular way. That matters more than it sounds: without them, every run is
 * the same run, and the only variable a player can move is how long they last.
 * A mission that asks for a five-chain or for three items spent is a different
 * question than "score more", and it is answered by playing differently rather
 * than by playing longer.
 *
 * Which three appear is a pure function of the date, so it is the same set on
 * every device without anything being stored or synced, and it can be tested
 * without a clock.
 */

const PROGRESS_KEY = 'chroma-match:missions'

export type MissionKind = 'score' | 'gems' | 'chain' | 'power' | 'item' | 'level'

export interface Mission {
  id: string
  kind: MissionKind
  need: number
  reward: number
}

/**
 * How a kind of progress accumulates.
 *
 * 'add' counts across every run of the day; 'max' is the best single run. The
 * distinction is the whole difficulty of a mission: "clear 150 gems" is a
 * matter of time, "reach a five-chain" is a matter of play, and treating the
 * second like the first would let it be completed by grinding it one at a time.
 */
export const ACCUMULATION: Record<MissionKind, 'add' | 'max'> = {
  score: 'max',
  gems: 'add',
  chain: 'max',
  power: 'add',
  item: 'add',
  level: 'max',
}

/** The pool. Each entry is one mission with its target and what it pays. */
const POOL: readonly Mission[] = [
  { id: 'score-6k', kind: 'score', need: 6000, reward: 90 },
  { id: 'score-10k', kind: 'score', need: 10000, reward: 150 },
  { id: 'gems-200', kind: 'gems', need: 200, reward: 80 },
  { id: 'gems-350', kind: 'gems', need: 350, reward: 130 },
  { id: 'chain-4', kind: 'chain', need: 4, reward: 80 },
  { id: 'chain-5', kind: 'chain', need: 5, reward: 140 },
  { id: 'power-6', kind: 'power', need: 6, reward: 90 },
  { id: 'power-10', kind: 'power', need: 10, reward: 140 },
  { id: 'item-3', kind: 'item', need: 3, reward: 70 },
  { id: 'item-6', kind: 'item', need: 6, reward: 120 },
  { id: 'level-6', kind: 'level', need: 6, reward: 100 },
  { id: 'level-9', kind: 'level', need: 9, reward: 170 },
]

export const MISSIONS_PER_DAY = 3

function hash(input: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/**
 * Today's three, chosen from the date alone.
 *
 * No two of them share a kind. Three score missions on the same day would read
 * as one mission worth three rewards, which is exactly the sameness these are
 * here to break up.
 */
export function missionsForDay(day: string): Mission[] {
  const picked: Mission[] = []
  const usedKinds = new Set<MissionKind>()

  // Walks the pool from a date-derived starting point rather than sampling at
  // random: a deterministic walk cannot loop forever looking for a kind it has
  // already used, and it visits every entry before repeating any.
  for (let step = 0; step < POOL.length && picked.length < MISSIONS_PER_DAY; step++) {
    const mission = POOL[(hash(`${day}:${step}`) + step) % POOL.length]
    if (!mission || usedKinds.has(mission.kind)) continue
    usedKinds.add(mission.kind)
    picked.push(mission)
  }

  // A day whose hash happens to collide on kinds falls back to filling from the
  // top, so there are always three rather than sometimes two.
  for (const mission of POOL) {
    if (picked.length >= MISSIONS_PER_DAY) break
    if (usedKinds.has(mission.kind)) continue
    usedKinds.add(mission.kind)
    picked.push(mission)
  }
  return picked
}

interface Stored {
  day: string
  progress: Record<string, number>
  claimed: string[]
}

function read(): Stored {
  const empty: Stored = { day: '', progress: {}, claimed: [] }
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    if (!raw) return empty
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return empty
    const value = parsed as Partial<Stored>
    return {
      day: typeof value.day === 'string' ? value.day : '',
      progress:
        value.progress && typeof value.progress === 'object'
          ? (value.progress as Record<string, number>)
          : {},
      claimed: Array.isArray(value.claimed)
        ? value.claimed.filter((id): id is string => typeof id === 'string')
        : [],
    }
  } catch {
    return empty
  }
}

function write(state: Stored): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(state))
  } catch {
    /* progress simply will not persist */
  }
}

/** Reads today's state, wiping yesterday's the first time it is asked for. */
function today(at: Date): Stored {
  const day = dayOf(at)
  const held = read()
  if (held.day === day) return held
  // Rolled over rather than merged: yesterday's progress towards a mission that
  // is not on today's list is not progress towards anything.
  const fresh: Stored = { day, progress: {}, claimed: [] }
  write(fresh)
  return fresh
}

export interface MissionState extends Mission {
  progress: number
  done: boolean
  claimed: boolean
}

export function todayMissions(at: Date = new Date()): MissionState[] {
  const state = today(at)
  return missionsForDay(state.day).map((mission) => {
    const progress = Math.max(0, Math.floor(state.progress[mission.kind] ?? 0))
    return {
      ...mission,
      progress: Math.min(progress, mission.need),
      done: progress >= mission.need,
      claimed: state.claimed.includes(mission.id),
    }
  })
}

/**
 * Records progress of one kind.
 *
 * Keyed by kind rather than by mission id, so a counter kept while a mission is
 * not on today's list still counts the moment it is — and so the game screen
 * never has to know which missions are running. It reports what happened; this
 * decides whether it mattered.
 */
export function report(kind: MissionKind, value: number, at: Date = new Date()): void {
  if (!Number.isFinite(value) || value <= 0) return
  const state = today(at)
  const held = state.progress[kind] ?? 0
  state.progress[kind] =
    ACCUMULATION[kind] === 'add' ? held + Math.floor(value) : Math.max(held, Math.floor(value))
  write(state)
}

/** Takes a finished mission's reward. Returns the coins paid, or 0. */
export function claimMission(id: string, at: Date = new Date()): number {
  const state = today(at)
  const mission = todayMissions(at).find((entry) => entry.id === id)
  if (!mission || !mission.done || mission.claimed) return 0

  state.claimed.push(id)
  write(state)
  setCoins(coins() + mission.reward)
  return mission.reward
}

/** How many rewards are sitting there waiting. Drives the badge on the home screen. */
export function claimable(at: Date = new Date()): number {
  return todayMissions(at).filter((mission) => mission.done && !mission.claimed).length
}
