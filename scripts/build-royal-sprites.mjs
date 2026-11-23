/**
 * Reproduce the normalized browser sprites without doing this work on players' phones.
 * Run: node scripts/build-royal-sprites.mjs [--check | --verify-sources]
 * Requires the project's Playwright and local Chrome (ROYAL_CHROME_CHANNEL overrides it).
 * The crop, connected components, optical size and WebP encoder settings intentionally
 * match the former runtime implementation. Source hashes make artwork changes reviewable.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const artwork = new URL('../public/royal/', import.meta.url)
const output = new URL('sprites-v5.json', artwork)
const definitions = [
  ['royal-sprites-v3.webp', [
    ['crown', 'book', 'shield', 'leaf'], ['rocket-h', 'rocket-v', 'propeller', 'tnt'],
    ['lightball', 'hammer', 'arrow', 'cannon'], ['shuffle', 'settings', 'heart', 'star'],
    ['coin', 'chest', 'castle', 'bell'],
  ]],
  ['royal-obstacles-v3.webp', [['gift', 'toy', 'cuckoo', 'jelly'], ['box', 'ice', 'stone', 'dynamite']]],
  ['blocks-v4.webp', [['crown', 'book'], ['shield', 'leaf']]],
  ['powers-v4.webp', [['rocket-h', 'propeller'], ['tnt', 'lightball']]],
  ['tools-v4.webp', [['hammer', 'arrow'], ['cannon', 'shuffle']]],
  ['extras-v4.webp', [['map', 'home', 'paintbrush', 'bell'], ['heart-broken', 'settings', 'check', 'cross']]],
  ['gifts-v4.webp', [['gift-full', 'gift-ribbon', 'gift-seal', 'gift-open']]],
  ['goals-v4.webp', [['toy', 'dynamite'], ['cuckoo', 'jelly']]],
]
const inputs = await Promise.all(definitions.map(async ([file, entries]) => {
  const bytes = await readFile(new URL(file, artwork))
  return { file, entries, sha256: createHash('sha256').update(bytes).digest('hex'), src: `data:image/webp;base64,${bytes.toString('base64')}` }
}))
if (process.argv.includes('--verify-sources')) {
  const pack = JSON.parse(await readFile(output, 'utf8'))
  const expected = new Set([...definitions.flatMap(([, entries]) => entries.flat()), 'super-lightball'])
  if (pack.version !== 1 || pack.size !== 320 || !Array.isArray(pack.sources) || !pack.sprites || typeof pack.sprites !== 'object') throw new Error('Invalid Royal sprite pack format.')
  if (pack.sources.length !== inputs.length || inputs.some(input => !pack.sources.some(source => source.file === input.file && source.sha256 === input.sha256))) throw new Error('Royal artwork changed: regenerate the sprite pack before building.')
  if (Object.keys(pack.sprites).length !== expected.size || [...expected].some(key => typeof pack.sprites[key] !== 'string')) throw new Error('Royal sprite pack is missing sprites.')
  for (const [key, src] of Object.entries(pack.sprites)) {
    if (!expected.has(key) || !src.startsWith('data:image/webp;base64,')) throw new Error(`Invalid Royal sprite: ${key}`)
    const bytes = Buffer.from(src.slice(src.indexOf(',') + 1), 'base64')
    if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') throw new Error(`Invalid WebP bytes: ${key}`)
  }
  console.log(`Royal sprite pack sources and ${expected.size} WebP sprites verified.`)
  process.exit(0)
}
const browser = await chromium.launch({ channel: process.env.ROYAL_CHROME_CHANNEL || 'chrome', headless: true })
let sprites
try {
  const page = await browser.newPage()
  sprites = await page.evaluate(async atlases => {
    const result = new Map()
    async function load(src) {
      const image = new Image()
      image.src = src
      await image.decode()
      return image
    }
    async function extract(atlas) {
      const image = await load(atlas.src)
      const cols = atlas.entries[0].length, rows = atlas.entries.length
      const sw = image.naturalWidth / cols, sh = image.naturalHeight / rows
      const probe = document.createElement('canvas')
      probe.width = Math.ceil(sw); probe.height = Math.ceil(sh)
      const ctx = probe.getContext('2d', { willReadFrequently: true })
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        ctx.clearRect(0, 0, probe.width, probe.height)
        ctx.drawImage(image, c * sw, r * sh, sw, sh, 0, 0, probe.width, probe.height)
        const data = ctx.getImageData(0, 0, probe.width, probe.height).data
        let x0 = probe.width, y0 = probe.height, x1 = 0, y1 = 0, largest = 0
        const components = [], seen = new Uint8Array(probe.width * probe.height), queue = new Int32Array(seen.length)
        for (let p = 0; p < seen.length; p++) {
          if (seen[p] || data[p * 4 + 3] <= 75) continue
          let head = 0, tail = 1, left = probe.width, top = probe.height, right = 0, bottom = 0
          queue[0] = p; seen[p] = 1
          while (head < tail) {
            const point = queue[head++], x = point % probe.width, y = Math.floor(point / probe.width)
            left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
            for (const next of [x > 0 ? point - 1 : -1, x < probe.width - 1 ? point + 1 : -1, y > 0 ? point - probe.width : -1, y < probe.height - 1 ? point + probe.width : -1]) {
              if (next >= 0 && !seen[next] && data[next * 4 + 3] > 75) { seen[next] = 1; queue[tail++] = next }
            }
          }
          largest = Math.max(largest, tail); components.push({ size: tail, left, top, right, bottom })
        }
        for (const part of components) if (part.size >= largest * .12) {
          x0 = Math.min(x0, part.left); y0 = Math.min(y0, part.top); x1 = Math.max(x1, part.right); y1 = Math.max(y1, part.bottom)
        }
        if (x1 < x0 || y1 < y0) throw new Error(`Empty sprite: ${atlas.entries[r][c]}`)
        x0 = Math.max(0, x0 - 3); y0 = Math.max(0, y0 - 3); x1 = Math.min(probe.width - 1, x1 + 3); y1 = Math.min(probe.height - 1, y1 + 3)
        const w = x1 - x0 + 1, h = y1 - y0 + 1, out = document.createElement('canvas')
        out.width = 320; out.height = 320
        const draw = out.getContext('2d'), scale = 286 / Math.max(w, h)
        draw.imageSmoothingEnabled = true; draw.imageSmoothingQuality = 'high'
        draw.drawImage(probe, x0, y0, w, h, (320 - w * scale) / 2, (320 - h * scale) / 2, w * scale, h * scale)
        result.set(atlas.entries[r][c], out.toDataURL('image/webp', .96))
      }
    }
    await Promise.all(atlases.slice(0, 2).map(extract))
    result.set('super-lightball', result.get('lightball'))
    await Promise.all(atlases.slice(2).map(extract))
    const horizontal = await load(result.get('rocket-h')), rotated = document.createElement('canvas')
    rotated.width = rotated.height = 320
    const ctx = rotated.getContext('2d')
    ctx.translate(160, 160); ctx.rotate(Math.PI / 2); ctx.drawImage(horizontal, -160, -160, 320, 320)
    result.set('rocket-v', rotated.toDataURL('image/webp', .96))
    return Object.fromEntries([...result].sort(([a], [b]) => a.localeCompare(b, 'en')))
  }, inputs)
} finally { await browser.close() }

const pack = JSON.stringify({ version: 1, size: 320, sources: inputs.map(({ file, sha256 }) => ({ file, sha256 })), sprites }) + '\n'
if (process.argv.includes('--check')) {
  if (await readFile(output, 'utf8') !== pack) throw new Error('Sprite pack differs: run node scripts/build-royal-sprites.mjs to regenerate it.')
  console.log('Royal sprite pack is reproducible and current.')
} else {
  await writeFile(output, pack)
  console.log(`Wrote ${fileURLToPath(output)}: ${Object.keys(sprites).length} sprites, ${Buffer.byteLength(pack)} bytes (${gzipSync(pack).byteLength} gzip bytes).`)
}
