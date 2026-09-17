/**
 * Everything an avatar can be made of.
 *
 * The whole game is drawn from canvas primitives and ships no image files, and
 * an avatar is no exception: a part is not a picture, it is an entry in a list
 * that the renderer knows how to draw. That is what makes the combinations free
 * — seven slots at six to eight options each is about seven million faces for
 * no bytes at all — and it is also what makes an avatar shareable as a string
 * rather than as an upload.
 *
 * Every part carries how it is obtained. Today every one of them says `free`,
 * because a customiser whose first screen is mostly padlocks is a worse
 * introduction than one that is entirely open. The field exists now so that
 * locking something later is a one-word edit here rather than a new concept
 * everywhere: the editor already dims what it cannot offer, and the renderer
 * already draws whatever it is handed, earned or not.
 */

export type Lock =
  /** Anyone, straight away. */
  | 'free'
  /** Bought with real money, once that exists. */
  | 'paid'
  /** Handed out by finishing something specific. */
  | 'quest'
  /** Available for a while, then not. */
  | 'event'

export interface Part {
  id: string
  name: string
  lock: Lock
}

/** A part that is only a colour: backdrops, skin, hair and cloth. */
export interface ColourPart extends Part {
  colour: string
}

export type HairStyle = 'none' | 'buzz' | 'crop' | 'curls' | 'bun' | 'bob' | 'long' | 'wave'
export type OutfitStyle = 'crew' | 'collar' | 'tie' | 'blazer' | 'turtle' | 'hoodie'
export type AccessoryStyle = 'none' | 'square' | 'round' | 'studs' | 'roundStuds'

export interface HairPart extends Part {
  style: HairStyle
}

export interface OutfitPart extends Part {
  style: OutfitStyle
}

export interface AccessoryPart extends Part {
  style: AccessoryStyle
}

/**
 * The flat card behind the figure.
 *
 * Deliberately desaturated. These sit behind a face at thumbnail size all over
 * the game — a leaderboard row, a profile card, a shared score — and a
 * saturated backdrop at that size stops reading as a backdrop and starts
 * competing with the gems, which are the only thing on screen allowed to be
 * loud.
 */
export const BACKDROPS: readonly ColourPart[] = [
  { id: 'slate', name: 'Slate', colour: '#C6D4E4', lock: 'free' },
  { id: 'sand', name: 'Sand', colour: '#DCD6C8', lock: 'free' },
  { id: 'rose', name: 'Rose', colour: '#E2C9C9', lock: 'free' },
  { id: 'sage', name: 'Sage', colour: '#CBD8CB', lock: 'free' },
  { id: 'cream', name: 'Cream', colour: '#E6DEC2', lock: 'free' },
  { id: 'lilac', name: 'Lilac', colour: '#D0C9E8', lock: 'free' },
  { id: 'mint', name: 'Mint', colour: '#C4DCD8', lock: 'free' },
  { id: 'clay', name: 'Clay', colour: '#E3CBB8', lock: 'free' },
]

export const SKINS: readonly ColourPart[] = [
  { id: 'porcelain', name: 'Porcelain', colour: '#FAD9C0', lock: 'free' },
  { id: 'sand', name: 'Sand', colour: '#F2C49E', lock: 'free' },
  { id: 'honey', name: 'Honey', colour: '#E0A97C', lock: 'free' },
  { id: 'amber', name: 'Amber', colour: '#C4885C', lock: 'free' },
  { id: 'umber', name: 'Umber', colour: '#9A6440', lock: 'free' },
  { id: 'espresso', name: 'Espresso', colour: '#6D432A', lock: 'free' },
]

export const HAIRS: readonly HairPart[] = [
  { id: 'crop', name: 'Crop', style: 'crop', lock: 'free' },
  { id: 'curls', name: 'Curls', style: 'curls', lock: 'free' },
  { id: 'buzz', name: 'Buzz', style: 'buzz', lock: 'free' },
  { id: 'bob', name: 'Bob', style: 'bob', lock: 'free' },
  { id: 'long', name: 'Long', style: 'long', lock: 'free' },
  { id: 'wave', name: 'Waves', style: 'wave', lock: 'free' },
  { id: 'bun', name: 'Bun', style: 'bun', lock: 'free' },
  { id: 'none', name: 'None', style: 'none', lock: 'free' },
]

export const HAIR_COLOURS: readonly ColourPart[] = [
  { id: 'ink', name: 'Ink', colour: '#2B2522', lock: 'free' },
  { id: 'cocoa', name: 'Cocoa', colour: '#4A3327', lock: 'free' },
  { id: 'chestnut', name: 'Chestnut', colour: '#6E4A31', lock: 'free' },
  { id: 'auburn', name: 'Auburn', colour: '#A9683A', lock: 'free' },
  { id: 'wheat', name: 'Wheat', colour: '#D6A855', lock: 'free' },
  { id: 'silver', name: 'Silver', colour: '#B4B4C0', lock: 'free' },
  { id: 'rosewood', name: 'Rosewood', colour: '#B25774', lock: 'free' },
  { id: 'violet', name: 'Violet', colour: '#7C5BD0', lock: 'free' },
]

export const OUTFITS: readonly OutfitPart[] = [
  { id: 'crew', name: 'Crew neck', style: 'crew', lock: 'free' },
  { id: 'collar', name: 'Shirt', style: 'collar', lock: 'free' },
  { id: 'tie', name: 'Shirt and tie', style: 'tie', lock: 'free' },
  { id: 'blazer', name: 'Blazer', style: 'blazer', lock: 'free' },
  { id: 'turtle', name: 'Turtleneck', style: 'turtle', lock: 'free' },
  { id: 'hoodie', name: 'Hoodie', style: 'hoodie', lock: 'free' },
]

export const OUTFIT_COLOURS: readonly ColourPart[] = [
  { id: 'chalk', name: 'Chalk', colour: '#F3F0EA', lock: 'free' },
  { id: 'charcoal', name: 'Charcoal', colour: '#32343C', lock: 'free' },
  { id: 'navy', name: 'Navy', colour: '#33456B', lock: 'free' },
  { id: 'sky', name: 'Sky', colour: '#93B4DC', lock: 'free' },
  { id: 'moss', name: 'Moss', colour: '#5C7A5E', lock: 'free' },
  { id: 'rust', name: 'Rust', colour: '#B4643C', lock: 'free' },
  { id: 'plum', name: 'Plum', colour: '#7A5F94', lock: 'free' },
  { id: 'butter', name: 'Butter', colour: '#E4C06A', lock: 'free' },
]

export const ACCESSORIES: readonly AccessoryPart[] = [
  { id: 'none', name: 'None', style: 'none', lock: 'free' },
  { id: 'square', name: 'Square frames', style: 'square', lock: 'free' },
  { id: 'round', name: 'Round frames', style: 'round', lock: 'free' },
  { id: 'studs', name: 'Studs', style: 'studs', lock: 'free' },
  { id: 'roundStuds', name: 'Frames and studs', style: 'roundStuds', lock: 'free' },
]
