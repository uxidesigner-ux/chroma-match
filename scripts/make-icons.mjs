/**
 * Draws the app icons and writes them as PNGs.
 *
 * The game ships no image assets, so the icons are generated from the same
 * palette the board uses rather than checked in as binaries someone has to
 * open a design tool to change. Rasterising and PNG encoding are done by hand
 * against Node's zlib — it is a few dozen lines and keeps the dependency count
 * at zero.
 *
 * Run with: npm run icons
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------- PNG output

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // truecolour with alpha
  // Every scanline uses filter 0; the images are small and flat enough that
  // predictive filters buy almost nothing.
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy
      ? rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
      : Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ------------------------------------------------------------------ painting

const hex = (s) => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
]
const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

class Surface {
  constructor(size) {
    this.size = size
    this.data = Buffer.alloc(size * size * 4)
  }

  blend(x, y, [r, g, b], a) {
    if (a <= 0) return
    const i = (y * this.size + x) * 4
    const dstA = this.data[i + 3] / 255
    const outA = a + dstA * (1 - a)
    if (outA <= 0) return
    for (let k = 0; k < 3; k++) {
      const src = [r, g, b][k]
      const dst = this.data[i + k]
      this.data[i + k] = Math.round((src * a + dst * dstA * (1 - a)) / outA)
    }
    this.data[i + 3] = Math.round(outA * 255)
  }

  /**
   * Paints wherever `inside` reports true, antialiasing edges by sampling each
   * pixel on a 4x4 grid and using the hit ratio as coverage.
   */
  paint(inside, colorAt, samples = 4) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let hits = 0
        for (let sy = 0; sy < samples; sy++) {
          for (let sx = 0; sx < samples; sx++) {
            if (inside(x + (sx + 0.5) / samples, y + (sy + 0.5) / samples)) hits++
          }
        }
        if (hits > 0) this.blend(x, y, colorAt(x, y), hits / (samples * samples))
      }
    }
  }
}

const inRoundRect = (x, y, w, h, r) => (px, py) => {
  const dx = Math.max(x + r - px, 0, px - (x + w - r))
  const dy = Math.max(y + r - py, 0, py - (y + h - r))
  return Math.hypot(dx, dy) <= r && px >= x && px <= x + w && py >= y && py <= y + h
}

const inCircle = (cx, cy, r) => (px, py) => Math.hypot(px - cx, py - cy) <= r

const inPolygon = (points) => (px, py) => {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Top-to-bottom gradient across a box, matching how gems are lit in game. */
const litGem = (base, light, top, height) => {
  const c1 = hex(light)
  const c2 = hex(base)
  return (_x, y) => mix(c1, c2, Math.min(1, Math.max(0, (y - top) / height)))
}

// -------------------------------------------------------------------- design

/**
 * Four gems in a square, one per silhouette, so the icon says "matching
 * shapes" rather than just "coloured dots".
 */
function drawIcon(size, { rounded, inset }) {
  const s = new Surface(size)
  const bgTop = hex('#1B2348')
  const bgBottom = hex('#080B14')
  const bg = (_x, y) => mix(bgTop, bgBottom, y / size)
  s.paint(
    rounded ? inRoundRect(0, 0, size, size, size * 0.225) : () => true,
    bg,
  )

  const box = size * inset
  const origin = (size - box) / 2
  const cell = box / 2
  const r = cell * 0.36 // gem radius inside its quadrant
  const at = (col, row) => [origin + cell * (col + 0.5), origin + cell * (row + 0.5)]

  // Ruby circle, top left.
  {
    const [cx, cy] = at(0, 0)
    s.paint(inCircle(cx, cy, r), litGem('#FF4D6D', '#FF9BB0', cy - r, r * 2))
  }
  // Azure diamond, top right.
  {
    const [cx, cy] = at(1, 0)
    const d = r * 1.16
    s.paint(
      inPolygon([
        [cx, cy - d],
        [cx + d, cy],
        [cx, cy + d],
        [cx - d, cy],
      ]),
      litGem('#38BDF8', '#9BDFFF', cy - d, d * 2),
    )
  }
  // Amber triangle, bottom left.
  {
    const [cx, cy] = at(0, 1)
    const d = r * 1.2
    s.paint(
      inPolygon([
        [cx, cy - d],
        [cx + d * 0.92, cy + d * 0.7],
        [cx - d * 0.92, cy + d * 0.7],
      ]),
      litGem('#FFB020', '#FFD782', cy - d, d * 1.7),
    )
  }
  // Mint rounded square, bottom right.
  {
    const [cx, cy] = at(1, 1)
    const d = r * 0.98
    s.paint(
      inRoundRect(cx - d, cy - d, d * 2, d * 2, d * 0.42),
      litGem('#34D399', '#8DF3C8', cy - d, d * 2),
    )
  }

  return encodePng(size, s.data)
}

// ---------------------------------------------------------------------- main

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

const files = [
  // Rounded plates for contexts that show the icon as-is.
  ['icon-192.png', 192, { rounded: true, inset: 0.66 }],
  ['icon-512.png', 512, { rounded: true, inset: 0.66 }],
  // Full-bleed: iOS and Android apply their own mask, and a maskable icon has
  // to survive a circle crop, so the artwork sits well inside the safe area.
  ['icon-180.png', 180, { rounded: false, inset: 0.6 }],
  ['icon-maskable-512.png', 512, { rounded: false, inset: 0.52 }],
]

for (const [name, size, opts] of files) {
  const png = drawIcon(size, opts)
  writeFileSync(join(outDir, name), png)
  console.log(`${name.padEnd(24)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`)
}
