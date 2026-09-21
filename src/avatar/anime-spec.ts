/** Seed v1 is immutable: a saved appearance must never refer to a different asset. */
export interface AnimeSpec {
  model: 'seed-v1'
  hair: 'tails' | 'bob'
  expression: 'neutral' | 'happy' | 'relaxed' | 'angry' | 'sad' | 'surprised'
  pack: boolean
  arms: boolean
  visor: boolean
  hairColour: string
  eyeColour: string
  outfitColour: string
  backdrop: string
}

export const DEFAULT_ANIME: AnimeSpec = {
  model: 'seed-v1',
  hair: 'tails',
  expression: 'neutral',
  pack: false,
  arms: false,
  visor: false,
  hairColour: '67B7A3',
  eyeColour: 'A899E8',
  outfitColour: '91ADB8',
  backdrop: '202C3D',
}

const kit = (all: boolean, extra: Partial<AnimeSpec> = {}): AnimeSpec => ({
  ...DEFAULT_ANIME,
  pack: all,
  arms: all,
  visor: all,
  ...extra,
})

export const ANIME_LOOKS: readonly AnimeSpec[] = [
  kit(false),
  kit(false, {
    hairColour: 'ED9560',
    eyeColour: 'B897ED',
    outfitColour: '9A8BCD',
    backdrop: '352C43',
  }),
  kit(false, {
    hair: 'bob',
    hairColour: 'A9C9EA',
    eyeColour: '69BDAF',
    outfitColour: '739BB0',
    backdrop: '263A46',
  }),
  kit(false, {
    hairColour: 'DD9FAB',
    eyeColour: 'AD8DE3',
    outfitColour: 'BC939D',
    backdrop: '422F3D',
  }),
  kit(true, {
    hairColour: 'C47A4A',
    eyeColour: '6EA4D4',
    outfitColour: 'B8734A',
    backdrop: '3A2A22',
  }),
  kit(false, {
    visor: true,
    hair: 'bob',
    hairColour: '4A5A72',
    eyeColour: '7EC8FF',
    outfitColour: '3D4C63',
    backdrop: '141820',
  }),
  kit(false, {
    arms: true,
    pack: true,
    hairColour: '8B6AD4',
    eyeColour: 'E0A0FF',
    outfitColour: '6A5A9A',
    backdrop: '2A2040',
  }),
  kit(false, {
    visor: true,
    arms: true,
    hairColour: '8FCB5A',
    eyeColour: 'FFE08A',
    outfitColour: '4E8A4A',
    backdrop: '1C2A18',
  }),
]

const colours = ['hairColour', 'eyeColour', 'outfitColour', 'backdrop'] as const
export const EXPRESSIONS = ['neutral', 'happy', 'relaxed', 'angry', 'sad', 'surprised'] as const
const expressionCodes = { neutral: 'N', happy: 'H', relaxed: 'R', angry: 'A', sad: 'S', surprised: 'U' } as const

export function gearBits(spec: AnimeSpec): number {
  return (spec.pack ? 1 : 0) + (spec.arms ? 2 : 0) + (spec.visor ? 4 : 0)
}

export function gearFromBits(bits: number): Pick<AnimeSpec, 'pack' | 'arms' | 'visor'> {
  return { pack: Boolean(bits & 1), arms: Boolean(bits & 2), visor: Boolean(bits & 4) }
}

function gearChar(spec: AnimeSpec): string {
  const bits = gearBits(spec)
  if (bits === 0) return 'N'
  if (bits === 7) return 'G'
  return String(bits)
}

export function encodeAnime(spec: AnimeSpec): string {
  return (
    'S' +
    (spec.hair === 'bob' ? 'B' : 'T') +
    (expressionCodes[spec.expression] ?? 'N') +
    gearChar(spec) +
    colours
      .map((key) =>
        /^[0-9a-f]{6}$/i.test(spec[key]) ? spec[key].toUpperCase() : DEFAULT_ANIME[key],
      )
      .join('')
  )
}

/** Reject malformed/newer model data; callers can show the safe starter appearance. */
export function decodeAnime(raw: string): AnimeSpec | undefined {
  if (!/^S[BT][NHRASU][NG1-6][0-9A-F]{24}$/.test(raw)) return undefined
  const mark = raw[3]!
  const bits = mark === 'G' ? 7 : mark === 'N' ? 0 : Number(mark)
  return {
    model: 'seed-v1',
    hair: raw[1] === 'B' ? 'bob' : 'tails',
    expression: EXPRESSIONS.find((key) => expressionCodes[key] === raw[2])!,
    ...gearFromBits(bits),
    hairColour: raw.slice(4, 10),
    eyeColour: raw.slice(10, 16),
    outfitColour: raw.slice(16, 22),
    backdrop: raw.slice(22, 28),
  }
}
