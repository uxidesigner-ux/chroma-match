/** Local-only playground preferences. This module is also usable without a DOM. */
export interface RoyalSettings {
  level: number
  difficulty: 'easy' | 'normal' | 'hard'
  shape: 'auto' | 'rectangle' | 'courtyard' | 'bridge'
  obstacleDensity: number
  autoDensity: boolean
  moves: number
  seed: number
  unlimitedMoves: boolean
  unlimitedTools: boolean
  calm: boolean
  sound: boolean
}

export const DEFAULT_SETTINGS: Readonly<RoyalSettings> = Object.freeze({
  level: 1,
  difficulty: 'normal',
  shape: 'auto',
  obstacleDensity: 0.22,
  autoDensity: true,
  moves: 0,
  seed: 2026,
  unlimitedMoves: false,
  unlimitedTools: false,
  calm: false,
  sound: true,
})

/** Do not coerce strings, booleans, null, or non-finite numbers from saved data. */
export function normalizeSettings(value: unknown): RoyalSettings {
  const data = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
  const get = (key: keyof RoyalSettings): unknown => Object.hasOwn(data, key) ? data[key] : undefined
  const number = (key: keyof RoyalSettings, fallback: number, min: number, max: number, integer = true): number => {
    const candidate = get(key)
    if (typeof candidate !== 'number' || !Number.isFinite(candidate)) return fallback
    return Math.min(max, Math.max(min, integer ? Math.round(candidate) : candidate))
  }
  const boolean = (key: keyof RoyalSettings, fallback: boolean): boolean => {
    const candidate = get(key)
    return typeof candidate === 'boolean' ? candidate : fallback
  }
  const difficulty = get('difficulty')
  const shape = get('shape')
  const moves = number('moves', DEFAULT_SETTINGS.moves, 0, 99)
  return {
    level: number('level', DEFAULT_SETTINGS.level, 1, 999),
    difficulty: difficulty === 'easy' || difficulty === 'normal' || difficulty === 'hard'
      ? difficulty : DEFAULT_SETTINGS.difficulty,
    shape: shape === 'auto' || shape === 'rectangle' || shape === 'courtyard' || shape === 'bridge'
      ? shape : DEFAULT_SETTINGS.shape,
    obstacleDensity: number('obstacleDensity', DEFAULT_SETTINGS.obstacleDensity, 0, 0.4, false),
    autoDensity: boolean('autoDensity', DEFAULT_SETTINGS.autoDensity),
    moves: moves === 0 ? 0 : Math.max(5, moves),
    seed: number('seed', DEFAULT_SETTINGS.seed, 1, 2147483647),
    unlimitedMoves: boolean('unlimitedMoves', DEFAULT_SETTINGS.unlimitedMoves),
    unlimitedTools: boolean('unlimitedTools', DEFAULT_SETTINGS.unlimitedTools),
    calm: boolean('calm', DEFAULT_SETTINGS.calm),
    sound: boolean('sound', DEFAULT_SETTINGS.sound),
  }
}
