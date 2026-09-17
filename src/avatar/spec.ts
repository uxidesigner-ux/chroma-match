import {
  ACCESSORIES,
  BACKDROPS,
  HAIRS,
  HAIR_COLOURS,
  OUTFITS,
  OUTFIT_COLOURS,
  SKINS,
} from './parts.ts'
import type { AccessoryPart, ColourPart, HairPart, OutfitPart, Part } from './parts.ts'

/**
 * An avatar, as the seven choices that make it.
 *
 * Stored and shared as a string of part ids rather than as indices into the
 * lists, because an index is a promise never to reorder a catalogue and this
 * one will grow. An id that no longer exists — an older build, an event part
 * that has ended, a hand-edited save — falls back to the first entry in its
 * slot rather than throwing, so an avatar always draws as something.
 */
export interface AvatarSpec {
  backdrop: string
  skin: string
  hair: string
  hairColour: string
  outfit: string
  outfitColour: string
  accessory: string
}

/** The seven slots, in the order they are encoded. */
const SLOTS = [
  'backdrop',
  'skin',
  'hair',
  'hairColour',
  'outfit',
  'outfitColour',
  'accessory',
] as const

type Slot = (typeof SLOTS)[number]

const CATALOGUE: Record<Slot, readonly Part[]> = {
  backdrop: BACKDROPS,
  skin: SKINS,
  hair: HAIRS,
  hairColour: HAIR_COLOURS,
  outfit: OUTFITS,
  outfitColour: OUTFIT_COLOURS,
  accessory: ACCESSORIES,
}

export function catalogueFor(slot: Slot): readonly Part[] {
  return CATALOGUE[slot]
}

export type { Slot }
export { SLOTS }

/** Every id is lowercase letters and digits, so the encoding needs no escaping. */
const SEPARATOR = '-'

/** The longest an encoded avatar can be. Also the bound in firestore.rules. */
export const SPEC_MAX = 80

export const DEFAULT_SPEC: AvatarSpec = {
  backdrop: 'slate',
  skin: 'sand',
  hair: 'crop',
  hairColour: 'ink',
  outfit: 'crew',
  outfitColour: 'charcoal',
  accessory: 'none',
}

function firstId(slot: Slot): string {
  return CATALOGUE[slot][0]?.id ?? ''
}

/** Resolves a slot's chosen part, or the slot's default when it is unknown. */
function resolve(slot: Slot, id: string): Part {
  const list = CATALOGUE[slot]
  return list.find((part) => part.id === id) ?? (list[0] as Part)
}

export const backdropOf = (spec: AvatarSpec): ColourPart =>
  resolve('backdrop', spec.backdrop) as ColourPart
export const skinOf = (spec: AvatarSpec): ColourPart => resolve('skin', spec.skin) as ColourPart
export const hairOf = (spec: AvatarSpec): HairPart => resolve('hair', spec.hair) as HairPart
export const hairColourOf = (spec: AvatarSpec): ColourPart =>
  resolve('hairColour', spec.hairColour) as ColourPart
export const outfitOf = (spec: AvatarSpec): OutfitPart => resolve('outfit', spec.outfit) as OutfitPart
export const outfitColourOf = (spec: AvatarSpec): ColourPart =>
  resolve('outfitColour', spec.outfitColour) as ColourPart
export const accessoryOf = (spec: AvatarSpec): AccessoryPart =>
  resolve('accessory', spec.accessory) as AccessoryPart

/** The string that travels: a save, a profile document, a shared score. */
export function encodeSpec(spec: AvatarSpec): string {
  return SLOTS.map((slot) => resolve(slot, spec[slot]).id).join(SEPARATOR)
}

/**
 * Reads an encoded avatar back.
 *
 * Never fails. Anything unrecognised — a truncated string, a part from a build
 * that no longer exists, something a player typed into their own storage —
 * resolves slot by slot to whatever is valid, because the alternative is a
 * blank square where a face should be. A leaderboard row whose avatar is
 * nonsense should still have a face; it is the *score* that gets verified
 * around here, and an avatar cannot be cheated into being worth anything.
 */
export function decodeSpec(raw: string): AvatarSpec {
  const parts = typeof raw === 'string' ? raw.slice(0, SPEC_MAX).split(SEPARATOR) : []
  const spec = {} as AvatarSpec
  SLOTS.forEach((slot, index) => {
    const id = parts[index] ?? ''
    spec[slot] = resolve(slot, id).id || firstId(slot)
  })
  return spec
}

/** True when every slot names a part that actually exists. */
export function isKnownSpec(raw: string): boolean {
  const parts = raw.split(SEPARATOR)
  if (parts.length !== SLOTS.length) return false
  return SLOTS.every((slot, index) => CATALOGUE[slot].some((part) => part.id === parts[index]))
}

/** A random face, for a player who has not chosen one yet. */
export function randomSpec(random: () => number = Math.random): AvatarSpec {
  const pick = (slot: Slot): string => {
    // Only from what is obtainable: a starting avatar must never be wearing
    // something the shop would otherwise charge for.
    const free = CATALOGUE[slot].filter((part) => part.lock === 'free')
    const list = free.length > 0 ? free : CATALOGUE[slot]
    return (list[Math.floor(random() * list.length)] as Part).id
  }
  return {
    backdrop: pick('backdrop'),
    skin: pick('skin'),
    hair: pick('hair'),
    hairColour: pick('hairColour'),
    outfit: pick('outfit'),
    outfitColour: pick('outfitColour'),
    accessory: pick('accessory'),
  }
}
