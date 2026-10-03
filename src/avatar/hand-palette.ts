/** Remove only the cyan finger paint in the pinned Seed skin atlas.
 * Work on owned canvas pixels, never the licensed file. The bounded UV island
 * excludes the face, nails, palms, black glove and the other hand. Keep alpha
 * and broad baked finger shading rather than painting a flat white rectangle.
 */
export function cleanHandPixels(rgba: Uint8ClampedArray, width: number, height: number): void {
  if (rgba.length !== width * height * 4 || width < 1 || height < 1) throw new RangeError('Expected skin RGBA pixels')
  const left = Math.floor(width * .79), right = Math.ceil(width * .99), bottom = Math.ceil(height * .15)
  for (let y = 0; y < bottom; y++) for (let x = left; x < right; x++) {
    const at = (y * width + x) * 4
    const r = rgba[at]!, g = rgba[at + 1]!, b = rgba[at + 2]!
    if (!rgba[at + 3] || b <= r * 1.2 + 10 || g <= r * 1.1 + 5) continue
    const light = .82 + .18 * Math.min(1, Math.max(g, b) / 210)
    rgba[at] = Math.round(255 * light)
    rgba[at + 1] = Math.round(237 * light)
    rgba[at + 2] = Math.round(209 * light)
  }
}
