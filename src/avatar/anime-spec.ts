/** Seed v1 is immutable: a saved appearance must never refer to a different asset. */
/**
 * A figure axis, 0 to 6.
 *
 * 3 is the model exactly as it ships, so an appearance saved before these
 * existed decodes to a character that has not moved. Below 3 narrows, above 3
 * fills out; the studio pairs them into presets and also lets them be set one
 * at a time, because a body is not two options.
 */
export type FigureStep = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const FIGURE_AXES = ['bust', 'waist', 'hip'] as const
export type FigureAxis = (typeof FIGURE_AXES)[number]

/** What the studio offers as a starting point, not the only two shapes. */
export const FIGURE_PRESETS = {
  even: { bust: 3, waist: 3, hip: 3 },
  full: { bust: 5, waist: 1, hip: 5 },
} as const satisfies Record<string, Record<FigureAxis, FigureStep>>

export interface AnimeSpec {
  model: 'seed-v1'
  bust: FigureStep
  waist: FigureStep
  hip: FigureStep
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
  ...FIGURE_PRESETS.even,
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

const figureStep = (value: number): FigureStep =>
  (Number.isInteger(value) && value >= 0 && value <= 6 ? value : 3) as FigureStep

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
      .join('') +
    /*
     * The figure is appended rather than woven in, so every appearance saved
     * before it existed is still a valid code — it simply has no figure on the
     * end and decodes to the shape the model already had.
     */
    FIGURE_AXES.map((axis) => String(figureStep(spec[axis]))).join('')
  )
}

/** Reject malformed/newer model data; callers can show the safe starter appearance. */
export function decodeAnime(raw: string): AnimeSpec | undefined {
  // The figure suffix is optional: without it, a code from before figures
  // existed reads as the model's own proportions, which is what it drew.
  if (!/^S[BT][NHRASU][NG1-6][0-9A-F]{24}([0-6]{3})?$/.test(raw)) return undefined
  const mark = raw[3]!
  const bits = mark === 'G' ? 7 : mark === 'N' ? 0 : Number(mark)
  const figure = raw.slice(28)
  return {
    model: 'seed-v1',
    ...(figure.length === 3
      ? { bust: figureStep(Number(figure[0])), waist: figureStep(Number(figure[1])), hip: figureStep(Number(figure[2])) }
      : FIGURE_PRESETS.even),
    hair: raw[1] === 'B' ? 'bob' : 'tails',
    expression: EXPRESSIONS.find((key) => expressionCodes[key] === raw[2])!,
    ...gearFromBits(bits),
    hairColour: raw.slice(4, 10),
    eyeColour: raw.slice(10, 16),
    outfitColour: raw.slice(16, 22),
    backdrop: raw.slice(22, 28),
  }
}
