import type { HairStyle } from './anime-spec.ts'
import { HAIR_WHITE_FLOOR } from './hair-palette.ts'

export interface HairGeometry {
  positions: Float32Array
  normals: Float32Array
  uv: Float32Array
  index: Uint32Array
}

/**
 * Purpose-built, closed toon hair shell in Seed-san's raw head space (metres).
 * The shipped fringe stays intact. A continuous rounded C-section covers the
 * rear crown and flows into the curtain, leaving eyes/face open. There is no
 * second, horizontal root rim halfway down the head.
 * No repeated ponytail ribbons, third-party geometry or textures. Preview and
 * VRM/GLB use these exact arrays. Long is mid-back, not strand physics.
 */
export function hairGeometry(style: HairStyle, pack = false): HairGeometry | null {
  if (style === 'tails') return null
  const long = style === 'long'
  const columns = 64, crownRows = 12, lowerRows = 12, rows = crownRows + lowerRows
  // Denser samples on the curved crown, not extra ribbons or a separate cap.
  const crownY = [.2598, .258, .253, .245, .235, .222, .208, .192, .175, .157, .135, .113, .09]
  const length = long ? .54 : .235
  const join = (.17 - crownY[crownRows]!) / length
  const positions: number[] = [], uv: number[] = [], index: number[] = []
  const stride = columns + 1, layer = stride * (rows + 1)
  for (let inner = 0; inner < 2; inner++) {
    for (let row = 0; row <= rows; row++) {
      const t = row <= crownRows ? (.17 - crownY[row]!) / length : join + (1 - join) * (row - crownRows) / lowerRows
      const v = (.17 - length * t - crownY[0]!) / (.17 - length - crownY[0]!)
      const lower = Math.max(0, t)
      const sweep = lower * lower * (3 - 2 * lower)
      for (let column = 0; column <= columns; column++) {
        const u = column / columns
        const angle = .7 + u * (Math.PI * 2 - 1.4)
        const back = (1 - Math.cos(angle)) / 2
        const frontLock = Math.max(0, Math.cos(angle)) ** 2
        const baseY = .17 - length * t
        // Gravity-led curtain: after the widest part of the crown, never
        // shrink toward the neck and flare back out. A horizontal tangent
        // joins the rounded crown to a very gently widening lower fall.
        const pivotY = .135
        const cap = baseY >= pivotY ? Math.sqrt(Math.max(0, 1 - ((baseY - pivotY) / .125) ** 2)) : 1
        const fall = smooth(0, 1, (pivotY - baseY) / (pivotY - (.17 - length)))
        const groove = Math.cos(u * Math.PI * 32) * .0018 * (1 - smooth(pivotY, crownY[0]!, baseY))
        const thickness = Math.min(.006, .133 * cap * .3)
        const radiusX = .133 * cap + (long ? .0065 : .0015) * fall + groove - inner * thickness +
          (long ? .13 * frontLock * sweep : 0)
        const radiusZ = .142 * cap + (long ? .003 : .001) * fall + groove - inner * thickness
        const y = baseY +
          (long ? .045 * (1 - back) : .008 * Math.cos(u * Math.PI * 2)) * lower * lower
        const clearance = long ? (.065 + (pack ? .055 : 0)) * sweep * (.25 + .75 * back) : .005 * sweep
        // Face-framing locks fall outside/in front of the chest; back curtain
        // clears shoulders and gear. Long must also read from the lobby front.
        positions.push(Math.sin(angle) * radiusX, y, Math.cos(angle) * radiusZ - clearance +
          (long ? .065 * frontLock * sweep : 0))
        // One root-to-tip UV flow through the crown/curtain, not a reset at
        // their old overlap. Both cuts and file exports use this exact map.
        uv.push(u, v)
      }
    }
  }
  const quad = (a: number, b: number, c: number, d: number) => index.push(a, c, b, a, d, c)
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const a = row * stride + column, b = a + 1, c = b + stride, d = a + stride
    quad(a, b, c, d)
    quad(a + layer, d + layer, c + layer, b + layer)
  }
  for (let column = 0; column < columns; column++) {
    quad(column, column + layer, column + layer + 1, column + 1)
    const a = rows * stride + column
    quad(a, a + 1, a + layer + 1, a + layer)
  }
  for (let row = 0; row < rows; row++) {
    const a = row * stride, b = a + stride
    quad(a, b, b + layer, a + layer)
    quad(a + columns, a + columns + layer, b + columns + layer, b + columns)
  }
  const points = Float32Array.from(positions), faces = Uint32Array.from(index)
  return { positions: points, normals: normalsFor(points, faces), uv: Float32Array.from(uv), index: faces }
}

const smooth = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// Stable across preview, reload and exports; never randomize a saved hairstyle.
const seed = (n: number) => {
  const value = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}

/**
 * A white pigment carrier with sparse, neutral strand separations. Uneven
 * clumps/curved paths, tapered widths and different start/end points avoid a
 * comb of identical full-length stripes. Only small separation cores fall
 * below the white range: the bulk pigment still carries bright chosen colours.
 * This UV-bound map follows the rounded head shell, with no floating line
 * meshes, extra draw calls or per-frame texture work.
 */
export function hairShading(): { width: number; height: number; rgba: Uint8ClampedArray<ArrayBuffer> } {
  const width = 512, height = 512, rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / (width - 1), t = y / (height - 1)
    const flow = u + .006 * Math.sin(t * Math.PI) * Math.sin(u * Math.PI * 5)
    const shade = Math.round(Math.min(255, Math.max(HAIR_WHITE_FLOOR,
      246 + 4 * Math.cos(flow * Math.PI * 14.6 + .7) + 3 * Math.cos(flow * Math.PI * 22.2 - .4) + 3 * Math.sin(t * Math.PI))))
    const at = (y * width + x) * 4
    rgba[at] = rgba[at + 1] = rgba[at + 2] = shade
    rgba[at + 3] = 255
  }
  for (let strand = 0; strand < 18; strand++) {
    const root = .032 + strand * .055 + (seed(strand + 1) - .5) * .022
    const start = .035 + seed(strand + 21) * .17
    const end = .66 + seed(strand + 41) * .31
    const bend = (seed(strand + 61) - .5) * .025
    const lean = (seed(strand + 81) - .5) * .017
    const radius = .002 + seed(strand + 101) * .002
    const ink = 158 + seed(strand + 121) * 32
    for (let y = Math.ceil(start * (height - 1)); y <= Math.floor(end * (height - 1)); y++) {
      const t = y / (height - 1), along = (t - start) / (end - start)
      const fade = smooth(start, start + .07, t) * (1 - smooth(end - .1, end, t))
      const centre = root + bend * Math.sin(along * Math.PI) + lean * along
      const tapered = radius * (.3 + .7 * Math.sin(along * Math.PI) ** .6) * fade
      const feather = .0011
      const left = Math.max(0, Math.floor((centre - tapered - feather) * (width - 1)))
      const right = Math.min(width - 1, Math.ceil((centre + tapered + feather) * (width - 1)))
      for (let x = left; x <= right; x++) {
        const alpha = fade * (1 - smooth(tapered * .25, tapered + feather, Math.abs(x / (width - 1) - centre)))
        const at = (y * width + x) * 4
        const shade = Math.round(rgba[at]! * (1 - alpha) + ink * alpha)
        rgba[at] = rgba[at + 1] = rgba[at + 2] = shade
      }
    }
  }
  return { width, height, rgba }
}

/** Area-weighted vertex normals shared with the file exporter. */
export function normalsFor(positions: Float32Array, index: Uint32Array): Float32Array {
  const out = new Float32Array(positions.length)
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i]! * 3, b = index[i + 1]! * 3, c = index[i + 2]! * 3
    const ux = positions[b]! - positions[a]!, uy = positions[b + 1]! - positions[a + 1]!, uz = positions[b + 2]! - positions[a + 2]!
    const vx = positions[c]! - positions[a]!, vy = positions[c + 1]! - positions[a + 1]!, vz = positions[c + 2]! - positions[a + 2]!
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    for (const at of [a, b, c]) { out[at]! += nx; out[at + 1]! += ny; out[at + 2]! += nz }
  }
  for (let i = 0; i < out.length; i += 3) {
    const length = Math.hypot(out[i]!, out[i + 1]!, out[i + 2]!) || 1
    out[i]! /= length; out[i + 1]! /= length; out[i + 2]! /= length
  }
  return out
}
