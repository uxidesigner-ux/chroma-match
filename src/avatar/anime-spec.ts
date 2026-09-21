/** Seed v1 is immutable: a saved appearance must never refer to a different asset. */
export interface AnimeSpec {
  model: 'seed-v1'
  hair: 'tails' | 'bob'
  expression: 'neutral' | 'happy' | 'relaxed' | 'angry' | 'sad' | 'surprised'
  equipment: 'none' | 'gear'
  hairColour: string
  eyeColour: string
  outfitColour: string
  backdrop: string
}

export const DEFAULT_ANIME: AnimeSpec = {
  model: 'seed-v1',
  hair: 'tails',
  expression: 'neutral',
  equipment: 'none',
  hairColour: '67B7A3',
  eyeColour: 'A899E8',
  outfitColour: '91ADB8',
  backdrop: '202C3D',
}

export const ANIME_LOOKS: readonly AnimeSpec[] = [
  DEFAULT_ANIME,
  {
    ...DEFAULT_ANIME,
    hairColour: 'ED9560',
    eyeColour: 'B897ED',
    outfitColour: '9A8BCD',
    backdrop: '352C43',
  },
  {
    ...DEFAULT_ANIME,
    hair: 'bob',
    hairColour: 'A9C9EA',
    eyeColour: '69BDAF',
    outfitColour: '739BB0',
    backdrop: '263A46',
  },
  {
    ...DEFAULT_ANIME,
    hairColour: 'DD9FAB',
    eyeColour: 'AD8DE3',
    outfitColour: 'BC939D',
    backdrop: '422F3D',
  },
]

const colours = ['hairColour', 'eyeColour', 'outfitColour', 'backdrop'] as const
export const EXPRESSIONS = ['neutral', 'happy', 'relaxed', 'angry', 'sad', 'surprised'] as const
const expressionCodes = { neutral: 'N', happy: 'H', relaxed: 'R', angry: 'A', sad: 'S', surprised: 'U' } as const

export function encodeAnime(spec: AnimeSpec): string {
  return (
    'S' +
    (spec.hair === 'bob' ? 'B' : 'T') +
    (expressionCodes[spec.expression] ?? 'N') +
    (spec.equipment === 'gear' ? 'G' : 'N') +
    colours
      .map((key) =>
        /^[0-9a-f]{6}$/i.test(spec[key]) ? spec[key].toUpperCase() : DEFAULT_ANIME[key],
      )
      .join('')
  )
}

/** Reject malformed/newer model data; callers can show the safe starter appearance. */
export function decodeAnime(raw: string): AnimeSpec | undefined {
  if (!/^S[BT][NHRASU][NG][0-9A-F]{24}$/.test(raw)) return undefined
  return {
    model: 'seed-v1',
    hair: raw[1] === 'B' ? 'bob' : 'tails',
    expression: EXPRESSIONS.find(key => expressionCodes[key] === raw[2])!,
    equipment: raw[3] === 'G' ? 'gear' : 'none',
    hairColour: raw.slice(4, 10),
    eyeColour: raw.slice(10, 16),
    outfitColour: raw.slice(16, 22),
    backdrop: raw.slice(22, 28),
  }
}
