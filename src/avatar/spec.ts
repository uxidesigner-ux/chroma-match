import { DEFAULT_ANIME, decodeAnime, encodeAnime } from './anime-spec.ts'
import type { AnimeSpec } from './anime-spec.ts'

export type AvatarSpec = AnimeSpec
export const DEFAULT_SPEC: AvatarSpec = DEFAULT_ANIME
/** Existing profile storage permits at most 80 alphanumeric characters. */
export const SPEC_MAX = 80

/** Existing expressions keep V4; V5 adds three expressions without changing payload length. */
export function encodeSpec(spec: AvatarSpec): string {
  return (['neutral', 'happy', 'relaxed'].includes(spec.expression) ? '4' : '5') + encodeAnime(spec)
}

/** Read existing anime appearances without retaining any removed renderer or catalogue. */
export function decodeSpec(raw: string): AvatarSpec {
  if (typeof raw !== 'string') return { ...DEFAULT_SPEC }
  if (raw.startsWith('4')) return decodeAnime(raw.slice(1)) ?? { ...DEFAULT_SPEC }
  if (raw.startsWith('5')) return decodeAnime(raw.slice(1)) ?? { ...DEFAULT_SPEC }
  // The previous envelope put the same anime payload at offset 46. Its unused
  // prefix is discarded, never decoded or recreated in new saves.
  if (/^32[a-zA-Z0-9]{72}$/.test(raw)) {
    return decodeAnime(raw.slice(46)) ?? { ...DEFAULT_SPEC }
  }
  return { ...DEFAULT_SPEC }
}

export function isKnownSpec(raw: string): boolean {
  return encodeSpec(decodeSpec(raw)) === raw
}
