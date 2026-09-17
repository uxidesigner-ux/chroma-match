import { language, t } from './index.ts'
import { styleFor } from '../render/theme.ts'
import type { StringKey } from './index.ts'

/**
 * What to call a gem colour inside a sentence about a level's goal.
 *
 * Each skin names its own palette, and those names are part of what the skin
 * is: the same kind is Mint under Jewel, Jade under Glass and Fern under
 * Paper. Translating them would mean inventing eighteen more names in each of
 * three languages, and the result would be worse than the plain hue — nobody
 * gains from "제이드" over "초록" when the job of the word is to point at the
 * green gems on the board.
 *
 * So English keeps the skin's own name and the rest get the hue family. The
 * hue is the part that is actually stable across skins — every palette here
 * runs red, yellow, green, blue, pink, purple in that order — which is what
 * makes one translated word correct for all three.
 */
const HUES: readonly StringKey[] = [
  'gemRed',
  'gemYellow',
  'gemGreen',
  'gemBlue',
  'gemPink',
  'gemPurple',
]

export function gemName(kind: number): string {
  if (language() === 'en') return styleFor(kind).name
  const key = HUES[kind % HUES.length]
  return key ? t(key) : styleFor(kind).name
}

/** The gem's paint colour, for the swatch beside the goal. */
export function gemColour(kind: number): string {
  return styleFor(kind).base
}
