/** Near-white pigment carrier: subtle neutral strands, not a gray colour filter. */
export const HAIR_WHITE_FLOOR = 232

/**
 * Bleach owned RGBA pixels once before applying the player's sRGB colour.
 * Normalize to this texture's visible highlight so a dark source palette does
 * not remain gray. Keep its relative detail, alpha and the original asset intact.
 */
export function bleachHairPixels(rgba: Uint8ClampedArray): void {
  if (rgba.length % 4) throw new RangeError('Expected RGBA pixels')
  let highlight = 1
  for (let i = 0; i < rgba.length; i += 4)
    if (rgba[i + 3]) highlight = Math.max(highlight, rgba[i]!, rgba[i + 1]!, rgba[i + 2]!)
  for (let i = 0; i < rgba.length; i += 4) {
    const detail = Math.min(1, Math.max(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!) / highlight)
    const white = Math.round(HAIR_WHITE_FLOOR + (255 - HAIR_WHITE_FLOOR) * detail)
    rgba[i] = rgba[i + 1] = rgba[i + 2] = white
  }
}
