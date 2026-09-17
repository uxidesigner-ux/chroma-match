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
  /**
   * Two characters, assigned once and never reused.
   *
   * The encoded avatar used to be the ids joined by hyphens, which was honest
   * and far too long: the firestore rules bound the whole string at eighty
   * characters, and fourteen slots of readable ids is a hundred and fifteen.
   * Over the bound means every profile write is rejected, and that rule cannot
   * currently be redeployed — so the encoding had to shrink rather than the
   * bound grow.
   *
   * A code is not an index. Indices are a promise never to reorder a
   * catalogue; a code is attached to the part, so the lists below can be
   * sorted, split or interleaved without touching a single saved avatar. The
   * one rule is that a code is never reused for a different part.
   */
  code: string
  name: string
  lock: Lock
}

/** A part that is only a colour: backdrops, skin, hair and cloth. */
export interface ColourPart extends Part {
  colour: string
}

export type HairStyle = 'none' | 'buzz' | 'crop' | 'curls' | 'bun' | 'bob' | 'long' | 'wave'
export type BuildStyle = 'slim' | 'average' | 'broad'
export type BottomStyle = 'trousers' | 'shorts' | 'wide' | 'skirt'
export type OuterStyle = 'none' | 'jacket' | 'hoodie' | 'coat'
export type ShoeStyle = 'bare' | 'sneaker' | 'boot'
export type OutfitStyle = 'crew' | 'collar' | 'tie' | 'blazer' | 'turtle' | 'hoodie'
export type AccessoryStyle = 'none' | 'square' | 'round' | 'studs' | 'roundStuds'

export interface HairPart extends Part {
  style: HairStyle
}

/** How heavy the figure is, as the 0..1 the shader interpolates between. */
export interface BuildPart extends Part {
  style: BuildStyle
  weight: number
}

export interface BottomPart extends Part {
  style: BottomStyle
}

export interface OuterPart extends Part {
  style: OuterStyle
}

export interface ShoePart extends Part {
  style: ShoeStyle
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
  { id: 'slate', code: 'ba', name: 'Slate', colour: '#C6D4E4', lock: 'free' },
  { id: 'sand', code: 'bb', name: 'Sand', colour: '#DCD6C8', lock: 'free' },
  { id: 'rose', code: 'bc', name: 'Rose', colour: '#E2C9C9', lock: 'free' },
  { id: 'sage', code: 'bd', name: 'Sage', colour: '#CBD8CB', lock: 'free' },
  { id: 'cream', code: 'be', name: 'Cream', colour: '#E6DEC2', lock: 'free' },
  { id: 'lilac', code: 'bf', name: 'Lilac', colour: '#D0C9E8', lock: 'free' },
  { id: 'mint', code: 'bg', name: 'Mint', colour: '#C4DCD8', lock: 'free' },
  { id: 'clay', code: 'bh', name: 'Clay', colour: '#E3CBB8', lock: 'free' },
]

export const SKINS: readonly ColourPart[] = [
  { id: 'porcelain', code: 'sa', name: 'Porcelain', colour: '#FAD9C0', lock: 'free' },
  { id: 'sand', code: 'sb', name: 'Sand', colour: '#F2C49E', lock: 'free' },
  { id: 'honey', code: 'sc', name: 'Honey', colour: '#E0A97C', lock: 'free' },
  { id: 'amber', code: 'sd', name: 'Amber', colour: '#C4885C', lock: 'free' },
  { id: 'umber', code: 'se', name: 'Umber', colour: '#9A6440', lock: 'free' },
  { id: 'espresso', code: 'sf', name: 'Espresso', colour: '#6D432A', lock: 'free' },
]

export const HAIRS: readonly HairPart[] = [
  { id: 'crop', code: 'ha', name: 'Crop', style: 'crop', lock: 'free' },
  { id: 'curls', code: 'hb', name: 'Curls', style: 'curls', lock: 'free' },
  { id: 'buzz', code: 'hc', name: 'Buzz', style: 'buzz', lock: 'free' },
  { id: 'bob', code: 'hd', name: 'Bob', style: 'bob', lock: 'free' },
  { id: 'long', code: 'he', name: 'Long', style: 'long', lock: 'free' },
  { id: 'wave', code: 'hf', name: 'Waves', style: 'wave', lock: 'free' },
  { id: 'bun', code: 'hg', name: 'Bun', style: 'bun', lock: 'free' },
  { id: 'none', code: 'hh', name: 'None', style: 'none', lock: 'free' },
]

export const HAIR_COLOURS: readonly ColourPart[] = [
  { id: 'ink', code: 'ia', name: 'Ink', colour: '#2B2522', lock: 'free' },
  { id: 'cocoa', code: 'ib', name: 'Cocoa', colour: '#4A3327', lock: 'free' },
  { id: 'chestnut', code: 'ic', name: 'Chestnut', colour: '#6E4A31', lock: 'free' },
  { id: 'auburn', code: 'id', name: 'Auburn', colour: '#A9683A', lock: 'free' },
  { id: 'wheat', code: 'ie', name: 'Wheat', colour: '#D6A855', lock: 'free' },
  { id: 'silver', code: 'if', name: 'Silver', colour: '#B4B4C0', lock: 'free' },
  { id: 'rosewood', code: 'ig', name: 'Rosewood', colour: '#B25774', lock: 'free' },
  { id: 'violet', code: 'ih', name: 'Violet', colour: '#7C5BD0', lock: 'free' },
]

/**
 * Tops.
 *
 * The ids are the ones this list has always had, so every avatar anybody has
 * already saved still resolves — but two of them have changed job. A blazer
 * and a hoodie are things you wear *over* a top, and now that there is a layer
 * for that they live there; what is left here under those ids is the long
 * sleeve and the sweatshirt they were always drawn as from the collarbone up.
 */
export const OUTFITS: readonly OutfitPart[] = [
  { id: 'crew', code: 'ta', name: 'Tee', style: 'crew', lock: 'free' },
  { id: 'blazer', code: 'td', name: 'Long sleeve', style: 'blazer', lock: 'free' },
  { id: 'collar', code: 'tb', name: 'Shirt', style: 'collar', lock: 'free' },
  { id: 'tie', code: 'tc', name: 'Polo', style: 'tie', lock: 'free' },
  { id: 'turtle', code: 'te', name: 'Turtleneck', style: 'turtle', lock: 'free' },
  { id: 'hoodie', code: 'tf', name: 'Sweatshirt', style: 'hoodie', lock: 'free' },
]

/**
 * Build.
 *
 * Three, not a slider. A slider is a better toy and a worse decision: it takes
 * longer, it is harder to come back to, and nobody can tell you apart by it at
 * the size these are actually seen. The weight is what the shader reads — it
 * interpolates shoulder width and limb thickness between them, so a fourth
 * build later is a row here rather than new geometry.
 */
export const BUILDS: readonly BuildPart[] = [
  { id: 'slim', code: 'va', name: 'Slim', style: 'slim', weight: 0, lock: 'free' },
  { id: 'average', code: 'vb', name: 'Average', style: 'average', weight: 0.5, lock: 'free' },
  { id: 'broad', code: 'vc', name: 'Broad', style: 'broad', weight: 1, lock: 'free' },
]

export const BOTTOMS: readonly BottomPart[] = [
  { id: 'trousers', code: 'na', name: 'Trousers', style: 'trousers', lock: 'free' },
  { id: 'wide', code: 'nc', name: 'Wide leg', style: 'wide', lock: 'free' },
  { id: 'shorts', code: 'nb', name: 'Shorts', style: 'shorts', lock: 'free' },
  { id: 'skirt', code: 'nd', name: 'Skirt', style: 'skirt', lock: 'free' },
]

export const OUTERS: readonly OuterPart[] = [
  { id: 'none', code: 'oa', name: 'None', style: 'none', lock: 'free' },
  { id: 'jacket', code: 'ob', name: 'Jacket', style: 'jacket', lock: 'free' },
  { id: 'hoodie', code: 'oc', name: 'Hoodie', style: 'hoodie', lock: 'free' },
  { id: 'coat', code: 'od', name: 'Coat', style: 'coat', lock: 'free' },
]

export const SHOES: readonly ShoePart[] = [
  { id: 'sneaker', code: 'eb', name: 'Trainers', style: 'sneaker', lock: 'free' },
  { id: 'boot', code: 'ec', name: 'Boots', style: 'boot', lock: 'free' },
  { id: 'bare', code: 'ea', name: 'Barefoot', style: 'bare', lock: 'free' },
]

/**
 * The colours a garment starts on.
 *
 * Not a fixed palette any more — these seed the picker, which stores whatever
 * the player lands on. A wardrobe with eight allowed colours is a wardrobe
 * where two friends in the same jacket are wearing the same jacket.
 */
export const CLOTH_SWATCHES: readonly string[] = [
  '#F3F0EA', '#32343C', '#33456B', '#93B4DC', '#5C7A5E', '#B4643C', '#7A5F94', '#E4C06A',
  '#C4443F', '#E08A3C', '#3E8E7E', '#2C6E8F', '#B8567F', '#6B5B95', '#8A8F98', '#2A2E35',
]

export const OUTFIT_COLOURS: readonly ColourPart[] = [
  { id: 'chalk', code: 'ca', name: 'Chalk', colour: '#F3F0EA', lock: 'free' },
  { id: 'charcoal', code: 'cb', name: 'Charcoal', colour: '#32343C', lock: 'free' },
  { id: 'navy', code: 'cc', name: 'Navy', colour: '#33456B', lock: 'free' },
  { id: 'sky', code: 'cd', name: 'Sky', colour: '#93B4DC', lock: 'free' },
  { id: 'moss', code: 'ce', name: 'Moss', colour: '#5C7A5E', lock: 'free' },
  { id: 'rust', code: 'cf', name: 'Rust', colour: '#B4643C', lock: 'free' },
  { id: 'plum', code: 'cg', name: 'Plum', colour: '#7A5F94', lock: 'free' },
  { id: 'butter', code: 'ch', name: 'Butter', colour: '#E4C06A', lock: 'free' },
]

export const ACCESSORIES: readonly AccessoryPart[] = [
  { id: 'none', code: 'xa', name: 'None', style: 'none', lock: 'free' },
  { id: 'square', code: 'xb', name: 'Square frames', style: 'square', lock: 'free' },
  { id: 'round', code: 'xc', name: 'Round frames', style: 'round', lock: 'free' },
  { id: 'studs', code: 'xd', name: 'Studs', style: 'studs', lock: 'free' },
  { id: 'roundStuds', code: 'xe', name: 'Frames and studs', style: 'roundStuds', lock: 'free' },
]
