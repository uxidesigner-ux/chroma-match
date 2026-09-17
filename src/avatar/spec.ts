import {
  ACCESSORIES,
  BACKDROPS,
  BOTTOMS,
  BUILDS,
  CLOTH_SWATCHES,
  HAIRS,
  HAIR_COLOURS,
  OUTERS,
  OUTFITS,
  SHOES,
  SKINS,
} from './parts.ts'
import type {
  AccessoryPart,
  BottomPart,
  BuildPart,
  ColourPart,
  HairPart,
  OuterPart,
  OutfitPart,
  Part,
  ShoePart,
} from './parts.ts'

/**
 * An avatar, as the choices that make it.
 *
 * Two kinds of slot. A *part* slot names something from a catalogue — a
 * hairstyle, a pair of shoes — and resolves to whatever is valid if the name
 * is unknown. A *colour* slot holds six hex digits and is whatever the player
 * picked, because a wardrobe with eight allowed colours is a wardrobe where
 * two friends in the same jacket are wearing the same jacket.
 *
 * The first seven slots are the ones this has always had, with the same names
 * and the same meanings, so the 2D fallback renderer needs no changes and
 * every avatar anybody has already saved still resolves to the same face.
 */
export interface AvatarSpec {
  backdrop: string
  skin: string
  hair: string
  hairColour: string
  outfit: string
  accessory: string
  build: string
  bottom: string
  outer: string
  shoes: string
  /** Six hex digits, no hash. */
  topColour: string
  bottomColour: string
  outerColour: string
  shoeColour: string
}

/** The part slots, in the order they are encoded. Order is never re-sorted. */
const PART_SLOTS = [
  'backdrop',
  'skin',
  'hair',
  'hairColour',
  'build',
  'outfit',
  'bottom',
  'outer',
  'shoes',
  'accessory',
] as const

/** The free-colour slots, in the order they are encoded. */
const COLOUR_SLOTS = ['topColour', 'bottomColour', 'outerColour', 'shoeColour'] as const

export type PartSlot = (typeof PART_SLOTS)[number]
export type ColourSlot = (typeof COLOUR_SLOTS)[number]
export type Slot = PartSlot | ColourSlot

const CATALOGUE: Record<PartSlot, readonly Part[]> = {
  backdrop: BACKDROPS,
  skin: SKINS,
  hair: HAIRS,
  hairColour: HAIR_COLOURS,
  build: BUILDS,
  outfit: OUTFITS,
  bottom: BOTTOMS,
  outer: OUTERS,
  shoes: SHOES,
  accessory: ACCESSORIES,
}

export function catalogueFor(slot: PartSlot): readonly Part[] {
  return CATALOGUE[slot]
}

export function isColourSlot(slot: Slot): slot is ColourSlot {
  return (COLOUR_SLOTS as readonly string[]).includes(slot)
}

export { CLOTH_SWATCHES, COLOUR_SLOTS, PART_SLOTS }

/**
 * The longest an encoded avatar can be. Also the bound in firestore.rules,
 * which is the reason the encoding below is codes rather than ids: fourteen
 * slots of readable ids is a hundred and fifteen characters, the rule rejects
 * anything over eighty, and a rejected write is an avatar that silently never
 * reaches anybody's friends board.
 */
export const SPEC_MAX = 80

export const DEFAULT_SPEC: AvatarSpec = {
  backdrop: 'slate',
  skin: 'sand',
  hair: 'crop',
  hairColour: 'ink',
  build: 'average',
  outfit: 'crew',
  bottom: 'trousers',
  outer: 'none',
  shoes: 'sneaker',
  accessory: 'none',
  topColour: '32343C',
  bottomColour: '33456B',
  outerColour: '5C7A5E',
  shoeColour: 'F3F0EA',
}

function firstOf(slot: PartSlot): Part {
  return CATALOGUE[slot][0] as Part
}

/** Resolves a slot's chosen part, or the slot's default when it is unknown. */
function resolve(slot: PartSlot, id: string): Part {
  return CATALOGUE[slot].find((part) => part.id === id) ?? firstOf(slot)
}

export const backdropOf = (spec: AvatarSpec): ColourPart =>
  resolve('backdrop', spec.backdrop) as ColourPart
export const skinOf = (spec: AvatarSpec): ColourPart => resolve('skin', spec.skin) as ColourPart
export const hairOf = (spec: AvatarSpec): HairPart => resolve('hair', spec.hair) as HairPart
export const hairColourOf = (spec: AvatarSpec): ColourPart =>
  resolve('hairColour', spec.hairColour) as ColourPart
export const outfitOf = (spec: AvatarSpec): OutfitPart => resolve('outfit', spec.outfit) as OutfitPart
export const accessoryOf = (spec: AvatarSpec): AccessoryPart =>
  resolve('accessory', spec.accessory) as AccessoryPart
export const buildOf = (spec: AvatarSpec): BuildPart => resolve('build', spec.build) as BuildPart
export const bottomOf = (spec: AvatarSpec): BottomPart => resolve('bottom', spec.bottom) as BottomPart
export const outerOf = (spec: AvatarSpec): OuterPart => resolve('outer', spec.outer) as OuterPart
export const shoesOf = (spec: AvatarSpec): ShoePart => resolve('shoes', spec.shoes) as ShoePart

/** Six hex digits back to a `#rrggbb`, or the default when it is malformed. */
function hexOf(value: string, fallback: string): string {
  return /^[0-9a-fA-F]{6}$/.test(value) ? `#${value}` : `#${fallback}`
}

export const topColourOf = (spec: AvatarSpec): string =>
  hexOf(spec.topColour, DEFAULT_SPEC.topColour)
export const bottomColourOf = (spec: AvatarSpec): string =>
  hexOf(spec.bottomColour, DEFAULT_SPEC.bottomColour)
export const outerColourOf = (spec: AvatarSpec): string =>
  hexOf(spec.outerColour, DEFAULT_SPEC.outerColour)
export const shoeColourOf = (spec: AvatarSpec): string =>
  hexOf(spec.shoeColour, DEFAULT_SPEC.shoeColour)

/** Kept so the 2D fallback, which only draws a portrait, needs no changes. */
export const outfitColourOf = (spec: AvatarSpec): { colour: string } => ({
  colour: topColourOf(spec),
})

/* ---- the string that travels ------------------------------------------- */

const VERSION = '2'

/**
 * The string that travels: a save, a profile document, a shared score.
 *
 * Ten two-character part codes and four six-digit colours behind a version
 * character — forty-five characters, against an eighty-character bound that
 * cannot currently be raised. The old format was the ids joined by hyphens,
 * which read beautifully in a debugger and does not fit.
 */
export function encodeSpec(spec: AvatarSpec): string {
  const parts = PART_SLOTS.map((slot) => resolve(slot, spec[slot]).code).join('')
  const colours = COLOUR_SLOTS.map((slot) => hexOf(spec[slot], DEFAULT_SPEC[slot]).slice(1)).join('')
  return VERSION + parts + colours
}

/** The seven slots the first format had, in the order it had them. */
const V1_SLOTS = [
  'backdrop',
  'skin',
  'hair',
  'hairColour',
  'outfit',
  'outfitColour',
  'accessory',
] as const

/** The palette the old `outfitColour` slot chose from, by id. */
const V1_CLOTH: Record<string, string> = {
  chalk: 'F3F0EA',
  charcoal: '32343C',
  navy: '33456B',
  sky: '93B4DC',
  moss: '5C7A5E',
  rust: 'B4643C',
  plum: '7A5F94',
  butter: 'E4C06A',
}

/**
 * Reads an encoded avatar back.
 *
 * Never fails. Anything unrecognised — a truncated string, a part from a build
 * that no longer exists, something a player typed into their own storage —
 * resolves slot by slot to whatever is valid, because the alternative is a
 * blank square where a face should be.
 *
 * The first format is still read, and has to be: it is what is in every
 * existing player's localStorage and in every profile document written so far.
 * Its seven slots map onto the first seven here, the clothing colour it chose
 * from a palette becomes the hex that palette entry was, and the slots it
 * never had take their defaults. Somebody who comes back after this ships
 * keeps their face and gains a pair of trousers.
 */
export function decodeSpec(raw: string): AvatarSpec {
  const text = typeof raw === 'string' ? raw.slice(0, SPEC_MAX) : ''
  return text.startsWith(VERSION) && !text.includes('-') ? decodeV2(text) : decodeV1(text)
}

function decodeV2(text: string): AvatarSpec {
  const body = text.slice(VERSION.length)
  const spec = { ...DEFAULT_SPEC }
  PART_SLOTS.forEach((slot, index) => {
    const code = body.slice(index * 2, index * 2 + 2)
    const part = CATALOGUE[slot].find((entry) => entry.code === code)
    spec[slot] = (part ?? firstOf(slot)).id
  })
  const base = PART_SLOTS.length * 2
  COLOUR_SLOTS.forEach((slot, index) => {
    const hex = body.slice(base + index * 6, base + index * 6 + 6)
    spec[slot] = /^[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : DEFAULT_SPEC[slot]
  })
  return spec
}

function decodeV1(text: string): AvatarSpec {
  const fields = text.split('-')
  const spec = { ...DEFAULT_SPEC }
  V1_SLOTS.forEach((slot, index) => {
    const id = fields[index] ?? ''
    if (slot === 'outfitColour') {
      spec.topColour = V1_CLOTH[id] ?? DEFAULT_SPEC.topColour
      return
    }
    spec[slot] = resolve(slot, id).id
  })
  return spec
}

/** True when every slot names a part that actually exists. */
export function isKnownSpec(raw: string): boolean {
  return encodeSpec(decodeSpec(raw)) === raw
}

/** A random avatar, for a player who has not chosen one yet. */
export function randomSpec(random: () => number = Math.random): AvatarSpec {
  const pick = (slot: PartSlot): string => {
    // Only from what is obtainable: a starting avatar must never be wearing
    // something the shop would otherwise charge for.
    const free = CATALOGUE[slot].filter((part) => part.lock === 'free')
    const list = free.length > 0 ? free : CATALOGUE[slot]
    return (list[Math.floor(random() * list.length)] as Part).id
  }
  const colour = (): string => {
    const swatch = CLOTH_SWATCHES[Math.floor(random() * CLOTH_SWATCHES.length)]
    return (swatch ?? `#${DEFAULT_SPEC.topColour}`).slice(1).toUpperCase()
  }
  const spec = { ...DEFAULT_SPEC }
  for (const slot of PART_SLOTS) spec[slot] = pick(slot)
  for (const slot of COLOUR_SLOTS) spec[slot] = colour()
  return spec
}
