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
 * The shipped fringe/crown stays intact. A rounded C-section overlaps beneath
 * it, leaves eyes/face open, and carries an unbroken side/back silhouette.
 * No repeated ponytail ribbons, third-party geometry or textures. Preview and
 * VRM/GLB use these exact arrays. Long is mid-back, not strand physics.
 */
export function hairGeometry(style: HairStyle, pack = false): HairGeometry | null {
  if (style === 'tails') return null
  const long = style === 'long'
  const columns = 64, rows = 12
  const positions: number[] = [], uv: number[] = [], index: number[] = []
  const stride = columns + 1, layer = stride * (rows + 1)
  for (let inner = 0; inner < 2; inner++) {
    for (let row = 0; row <= rows; row++) {
      const t = row / rows
      const sweep = t * t * (3 - 2 * t)
      for (let column = 0; column <= columns; column++) {
        const u = column / columns
        const angle = .7 + u * (Math.PI * 2 - 1.4)
        const back = (1 - Math.cos(angle)) / 2
        const frontLock = Math.max(0, Math.cos(angle)) ** 2
        const groove = Math.cos(u * Math.PI * 32) * .0018 * Math.sin(Math.PI * t)
        const radiusX = .106 + (long ? .035 : .02) * Math.sin(t * Math.PI * .8) + groove - inner * .006 +
          (long ? .13 * frontLock * sweep : 0)
        const radiusZ = .111 + .019 * Math.sin(t * Math.PI * .8) + groove - inner * .006
        const y = .17 - t * (long ? .54 : .235) +
          (long ? .045 * (1 - back) : .008 * Math.cos(u * Math.PI * 2)) * t * t
        const clearance = long ? (.065 + (pack ? .055 : 0)) * sweep * (.25 + .75 * back) : .005 * sweep
        // Face-framing locks fall outside/in front of the chest; back curtain
        // clears shoulders and gear. Long must also read from the lobby front.
        positions.push(Math.sin(angle) * radiusX, y, Math.cos(angle) * radiusZ - clearance +
          (long ? .065 * frontLock * sweep : 0))
        uv.push(u, t)
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

/** Same bleached-white range as the crown; keep subtle strand detail when tinted. */
export function hairShading(): { width: number; height: number; rgba: Uint8ClampedArray<ArrayBuffer> } {
  const width = 128, height = 64, rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const shade = Math.round(HAIR_WHITE_FLOOR + 8 + Math.cos(x / (width - 1) * Math.PI * 32) * 8 + Math.sin(y / (height - 1) * Math.PI) * 7)
    const at = (y * width + x) * 4
    rgba[at] = rgba[at + 1] = rgba[at + 2] = shade
    rgba[at + 3] = 255
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
