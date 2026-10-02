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

/*
 * Encoding order, not reading order. The first three are the axes the studio
 * shipped with, so a code saved then is exactly a prefix of a code saved now
 * and decodes without a special case. The editor lays the rows out top-down.
 */
export const FIGURE_AXES = ['bust', 'waist', 'hip', 'shoulder', 'head'] as const
export type FigureAxis = (typeof FIGURE_AXES)[number]

/**
 * What the studio offers as a starting point, not the only shapes.
 *
 * One skeleton, read the four ways a silhouette usually is: even, shoulders
 * wider than hips, hips wider than shoulders, or slight under a large head.
 * They are a fast way in, not a claim about who may pick which — every axis
 * stays free afterwards, and a character that sits between two of them is the
 * normal outcome rather than an edge case.
 */
export const FIGURE_PRESETS = {
  even: { shoulder: 3, bust: 3, waist: 3, hip: 3, head: 3 },
  broad: { shoulder: 6, bust: 4, waist: 4, hip: 2, head: 2 },
  curved: { shoulder: 1, bust: 5, waist: 1, hip: 5, head: 3 },
  young: { shoulder: 1, bust: 2, waist: 2, hip: 2, head: 6 },
} as const satisfies Record<string, Record<FigureAxis, FigureStep>>

export interface AnimeSpec {
  model: 'seed-v1'
  /*
   * Which of the two the character is read as. It decides the one thing the
   * bones cannot do — whether the chest is sculpted — and seeds a matching
   * build when it is picked. It gates nothing: every axis, every hairstyle and
   * every colour stays available on either.
   */
  sex: 'male' | 'female'
  bust: FigureStep
  waist: FigureStep
  hip: FigureStep
  shoulder: FigureStep
  head: FigureStep
  hair: HairStyle
  expression: 'neutral' | 'happy' | 'relaxed' | 'angry' | 'sad' | 'surprised'
  pack: boolean
  arms: boolean
  visor: boolean
  hairColour: string
  eyeColour: string
  outfitColour: string
  top: TopStyle
  bottom: BottomStyle
  shoes: ShoeStyle
  bottomColour: string
  shoeColour: string
  skinColour: string
  backdrop: string
}

export const DEFAULT_ANIME: AnimeSpec = {
  model: 'seed-v1',
  // The model as it ships, so nothing saved before this existed changes shape.
  sex: 'male',
  ...FIGURE_PRESETS.even,
  hair: 'tails',
  expression: 'neutral',
  pack: false,
  arms: false,
  visor: false,
  hairColour: '67B7A3',
  eyeColour: 'A899E8',
  outfitColour: '91ADB8',
  top: 'seed',
  bottom: 'seed',
  shoes: 'bare',
  bottomColour: '35465D',
  shoeColour: 'EBE8E2',
  /*
   * White is not a skin tone; it is no tint at all, which is the model's own
   * baked skin. Every other value multiplies that texture, so the default is
   * also what an appearance saved before this existed decodes back to.
   */
  skinColour: 'FFFFFF',
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

/*
 * Six tints for the one baked skin, light to deep.
 *
 * They are offered as swatches because picking a skin tone out of a colour
 * wheel is a job nobody wants; the free picker stays next to them, so this is
 * a shortcut rather than the whole range. White is first because it is the
 * model untouched, not a tone.
 */
export const SKIN_TONES = ['FFFFFF', 'FFE0C8', 'F0C39B', 'D19A6E', 'A9714B', '6F4530'] as const

/*
 * Six backdrops, daylight to night.
 *
 * All eight starter looks carry a dark backdrop, because each was built as a
 * whole palette and they are all night palettes — so the only way to stand a
 * character against daylight was to find the colour wheel and know what to
 * type into it. The backdrop is its own axis: it is behind the character
 * rather than on them, and it is the one colour that fills the circle on the
 * launch screen. Six, because that is the row the skin tones already use and
 * a shortcut row that wraps is not a row; the free picker beside them still
 * reaches everything these do not. The last is the default, so getting back
 * is a tap rather than a memory.
 */
export const BACKDROPS = ['F4F1EA', 'D8E6EF', 'E6D7C4', 'A8B6A4', '5A6E86', '202C3D'] as const

/*
 * The hairstyles, and the one letter each is saved as.
 *
 * The licensed ponytail keeps its own rig. Bob and long use dedicated closed
 * geometry beneath its crown/fringe; the asset's tiny tip chains cannot shape
 * these cuts. Their implementation lives in hair-strands.ts, independently of
 * the stable appearance letters here.
 *
 * Bob and ponytail keep the letters they have always had, so every code saved
 * before the long ponytail existed still names the style it named.
 */
export const HAIR_STYLES = { tails: 'T', bob: 'B', long: 'L' } as const
export type HairStyle = keyof typeof HAIR_STYLES

/** Original appearances keep their complete Seed outfit until deliberately changed. */
export const TOP_STYLES = { roundShort: 'R', roundLong: 'L', vShort: 'V', vLong: 'W' } as const
export const BOTTOM_STYLES = { trousers: 'P', shorts: 'S', skirtLong: 'L', skirtShort: 'K' } as const
export const SHOE_STYLES = { bare: 'N', basketball: 'B', dress: 'D', heels: 'H' } as const
export type TopStyle = 'seed' | keyof typeof TOP_STYLES
export type BottomStyle = 'seed' | keyof typeof BOTTOM_STYLES
export type ShoeStyle = keyof typeof SHOE_STYLES

export function hasWardrobe(spec: AnimeSpec): boolean { return spec.top !== 'seed' && spec.bottom !== 'seed' }

/** Enter the fitted pack once; subsequent choices affect only their own slot. */
export function wear(spec: AnimeSpec, part: Partial<Pick<AnimeSpec, 'top' | 'bottom' | 'shoes'>>): AnimeSpec {
  return {
    ...spec,
    ...(hasWardrobe(spec) ? {} : { top: 'roundShort', bottom: 'trousers', shoes: 'basketball' }),
    ...part,
  }
}

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
  const base = (
    'S' +
    (HAIR_STYLES[spec.hair] ?? 'T') +
    (expressionCodes[spec.expression] ?? 'N') +
    gearChar(spec) +
    colours
      .map((key) =>
        /^[0-9a-f]{6}$/i.test(spec[key]) ? spec[key].toUpperCase() : DEFAULT_ANIME[key],
      )
      .join('') +
    /*
     * The figure and the skin are appended rather than woven in, so every
     * appearance saved before either existed is still a valid code — it simply
     * runs out early and decodes to the shape and skin the model already had.
     */
    FIGURE_AXES.map((axis) => String(figureStep(spec[axis]))).join('') +
    (/^[0-9a-f]{6}$/i.test(spec.skinColour) ? spec.skinColour.toUpperCase() : DEFAULT_ANIME.skinColour) +
    (spec.sex === 'female' ? 'F' : 'M')
  )
  if (!hasWardrobe(spec)) return base
  const colour = (value: string, fallback: string) => /^[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback
  return base + 'W' + TOP_STYLES[spec.top as keyof typeof TOP_STYLES] +
    BOTTOM_STYLES[spec.bottom as keyof typeof BOTTOM_STYLES] + SHOE_STYLES[spec.shoes] +
    colour(spec.bottomColour, DEFAULT_ANIME.bottomColour) + colour(spec.shoeColour, DEFAULT_ANIME.shoeColour)
}

/*
 * The hairstyle letter is a fixed position rather than an appended one, so
 * widening its alphabet costs nothing: B and T still mean what they meant, and
 * a code carrying L simply could not be written before. Everything after the
 * head is optional, and each stage is a prefix of
 * the next — no tail, the three axes the studio first shipped, all five, the
 * skin, then which of the two the character is.
 */
const CODE = new RegExp(
  `^S[${Object.values(HAIR_STYLES).join('')}][NHRASU][NG1-6][0-9A-F]{24}` +
    '(?:[0-6]{3}(?:[0-6]{2}(?:[0-9A-F]{6}[MF]?)?)?)?$',
)
const WARDROBE_CODE = /^S[TBL][NHRASU][NG1-6][0-9A-F]{24}[0-6]{5}[0-9A-F]{6}[MF]W[RLVW][PSLK][NBDH][0-9A-F]{12}$/

/** Reject malformed/newer model data; callers can show the safe starter appearance. */
export function decodeAnime(raw: string): AnimeSpec | undefined {
  if (!CODE.test(raw) && !WARDROBE_CODE.test(raw)) return undefined
  const mark = raw[3]!
  const bits = mark === 'G' ? 7 : mark === 'N' ? 0 : Number(mark)
  const tail = raw.slice(28)
  // An axis the code stops short of keeps the model's own proportion, so a
  // three-axis code widens nothing it never knew about.
  const figure = Object.fromEntries(
    FIGURE_AXES.map((axis, index) => [
      axis,
      index < tail.length ? figureStep(Number(tail[index])) : DEFAULT_ANIME[axis],
    ]),
  ) as Record<FigureAxis, FigureStep>
  return {
    model: 'seed-v1',
    ...figure,
    hair: (Object.keys(HAIR_STYLES) as HairStyle[]).find((key) => HAIR_STYLES[key] === raw[1]) ?? 'tails',
    expression: EXPRESSIONS.find((key) => expressionCodes[key] === raw[2])!,
    ...gearFromBits(bits),
    hairColour: raw.slice(4, 10),
    eyeColour: raw.slice(10, 16),
    outfitColour: raw.slice(16, 22),
    top: raw[40] === 'W' ? (Object.keys(TOP_STYLES) as (keyof typeof TOP_STYLES)[]).find(key => TOP_STYLES[key] === raw[41])! : 'seed',
    bottom: raw[40] === 'W' ? (Object.keys(BOTTOM_STYLES) as (keyof typeof BOTTOM_STYLES)[]).find(key => BOTTOM_STYLES[key] === raw[42])! : 'seed',
    shoes: raw[40] === 'W' ? (Object.keys(SHOE_STYLES) as ShoeStyle[]).find(key => SHOE_STYLES[key] === raw[43])! : 'bare',
    bottomColour: raw[40] === 'W' ? raw.slice(44, 50) : DEFAULT_ANIME.bottomColour,
    shoeColour: raw[40] === 'W' ? raw.slice(50, 56) : DEFAULT_ANIME.shoeColour,
    skinColour: tail.length > FIGURE_AXES.length
      ? tail.slice(FIGURE_AXES.length, FIGURE_AXES.length + 6)
      : DEFAULT_ANIME.skinColour,
    /*
     * Read by position, never by suffix. 'F' is also a hex digit, so a code
     * written before the character was a choice and carrying a skin colour
     * ending in F would otherwise come back female.
     */
    sex: tail[FIGURE_AXES.length + 6] === 'F' ? 'female' : 'male',
    backdrop: raw.slice(22, 28),
  }
}
