import { FRAGMENT_SOURCE, VERTEX_SOURCE } from './scene.ts'
import {
  accessoryOf,
  backdropOf,
  bottomColourOf,
  bottomOf,
  buildOf,
  hairColourOf,
  hairOf,
  outerColourOf,
  outerOf,
  outfitOf,
  shoeColourOf,
  shoesOf,
  skinOf,
  topColourOf,
} from './spec.ts'
import { encodeSpec } from './spec.ts'
import type { AvatarSpec } from './spec.ts'

/**
 * One WebGL context for every avatar on the page.
 *
 * A leaderboard can be showing twenty-five faces while the editor is showing
 * eight swatches and the card is showing a portrait, and a browser will hand
 * out somewhere around sixteen WebGL contexts before it starts throwing the
 * oldest ones away. So nothing here owns a context: there is exactly one,
 * offscreen, and each destination is a plain 2D canvas that gets the finished
 * pixels copied into it. Thirty-four faces, one context.
 */

/**
 * How many device pixels to march for a face this big.
 *
 * Two separate jobs, and the first attempt only did the second. A canvas on a
 * phone is backed by two or three device pixels per CSS pixel, so a render
 * that ignores that is upscaled on the way in and arrives soft — which is
 * exactly what it did. And a ray marcher has no geometry for multisampling to
 * work on, every edge coming out of the distance field, so the only way to
 * soften one is to shade more of them.
 *
 * So: match the device first, then ask for extra on top of it, more for small
 * faces where a jagged silhouette is most obvious and the pixel count is
 * trivial anyway. Capped, because the cost is quadratic and every one of those
 * pixels marches its own shadow ray.
 */
const PIXEL_CAP = 512

function pixelsFor(size: number, ratio: number): number {
  const extra = size <= 56 ? 1.6 : size <= 128 ? 1.35 : 1.15
  return Math.min(PIXEL_CAP, Math.max(24, Math.round(size * ratio * extra)))
}

/** Renders already produced, so the same face is never marched twice. */
const CACHE_LIMIT = 48
const cache = new Map<string, HTMLCanvasElement>()

interface Rig {
  gl: WebGL2RenderingContext
  canvas: HTMLCanvasElement
  uniforms: Record<string, WebGLUniformLocation | null>
}

/** null once we know it will not work, so the fallback is decided once. */
let rig: Rig | null | undefined

const HAIR_INDEX: Record<string, number> = {
  none: 0,
  buzz: 1,
  crop: 2,
  curls: 3,
  bun: 4,
  bob: 5,
  long: 6,
  wave: 7,
  afro: 8,
  volume: 9,
  twin: 10,
}

/**
 * Tops, by what the shader does with them.
 *
 * 0 and 3 are short-sleeved, 5 is cropped, 4 is a turtleneck, 6 has no sleeves
 * at all. The first version of this map was inherited from when these were
 * portrait-only garments and it put the sweatshirt on 5 — so the sweatshirt
 * rendered as a crop top, which is the kind of mistake that only shows up when
 * somebody looks at the pictures.
 */
const OUTFIT_INDEX: Record<string, number> = {
  crew: 0,      // tee: short sleeve
  blazer: 1,    // long sleeve
  collar: 2,    // shirt: long sleeve and a collar
  tie: 3,       // polo: short sleeve and a placket
  turtle: 4,
  hoodie: 5,    // sweatshirt
}

const BOTTOM_INDEX: Record<string, number> = {
  trousers: 0,
  shorts: 1,
  wide: 2,
  skirt: 3,
}

const OUTER_INDEX: Record<string, number> = {
  none: 0,
  jacket: 1,
  hoodie: 2,
  coat: 3,
  cardigan: 4,
  puffer: 5,
  blazer: 6,
  gilet: 7,
}

const SHOE_INDEX: Record<string, number> = {
  bare: 0,
  sneaker: 1,
  boot: 2,
}

const EXTRA_INDEX: Record<string, number> = {
  none: 0,
  square: 1,
  round: 2,
  studs: 3,
  roundStuds: 4,
}

/** Hair long enough to hide an ear, which the shader is told rather than told to work out. */
const COVERS_EARS = new Set(['bob', 'long', 'wave', 'afro', 'volume', 'twin'])

function compile(gl: WebGL2RenderingContext, kind: number, source: string): WebGLShader | null {
  const shader = gl.createShader(kind)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    // Logged rather than thrown: a driver that will not compile this is a
    // reason to draw the 2D avatar, not a reason to take the page down.
    console.warn('avatar shader:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function build(): Rig | null {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    // Kept so the pixels survive long enough to be copied out; without it the
    // buffer may be cleared the moment the call stack unwinds.
    preserveDrawingBuffer: true,
    powerPreference: 'low-power',
  })
  if (!gl) return null

  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE)
  if (!vertex || !fragment) return null

  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('avatar program:', gl.getProgramInfoLog(program))
    return null
  }
  gl.useProgram(program)

  // One triangle covering the viewport. Two would also work; one has no seam
  // down the diagonal and interpolates in a single pass.
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'position')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

  const uniforms: Record<string, WebGLUniformLocation | null> = {}
  for (const name of [
    'uSkin', 'uHair', 'uCloth', 'uBottomCol', 'uOuterCol', 'uShoeCol', 'uBack',
    'uStyle', 'uOutfit', 'uBottom', 'uOuter', 'uShoes', 'uExtra', 'uEars', 'uFull', 'uBuild', 'uAspect',
  ]) {
    uniforms[name] = gl.getUniformLocation(program, name)
  }

  return { gl, canvas, uniforms }
}

function open(): Rig | null {
  if (rig === undefined) {
    try {
      rig = build()
    } catch {
      rig = null
    }
  }
  return rig
}

/** '#RRGGBB' to linear-ish floats. The shader gamma-corrects on the way out. */
function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  const channel = (shift: number): number => Math.pow(((n >> shift) & 255) / 255, 2.2)
  return [channel(16), channel(8), channel(0)]
}

/**
 * Renders one avatar and copies it into `target`, or reports that it could not.
 *
 * Supersampled and scaled down on the way in rather than multisampled: a ray
 * marcher has no geometry for MSAA to work on — every edge comes out of the
 * distance field — so the only way to soften one is to shade more of them.
 */
export interface RenderOptions {
  /** Frame the whole figure rather than the head and shoulders. */
  full?: boolean
  /**
   * How tall the image is relative to its width.
   *
   * A standing figure in a square is half a square of backdrop. The portrait
   * framing stays square because a face is about as wide as it is tall and
   * every place that shows one — a card, a leaderboard row — is a square hole;
   * the wardrobe asks for two-to-three and gets a figure half as big again.
   */
  aspect?: number
}

export function renderAvatar(
  target: CanvasRenderingContext2D,
  spec: AvatarSpec,
  size: number,
  ratio: number,
  options: RenderOptions = {},
): boolean {
  const open_ = open()
  if (!open_) return false

  // A leaderboard repaints on every refresh and an editor repaints eight
  // swatches on every tap, and most of what it asks for is what it asked for
  // last time. Marching the same face twice is the one cost here that buys
  // nothing at all.
  // The ratio is part of the key: the same face at the same CSS size is a
  // different number of pixels on a phone than on a desktop, and handing back
  // the desktop one would be handing back a blurry face.
  const full = options.full === true
  // The framing is part of the key. The same avatar cropped to a face and
  // stood up full length are two different images, and handing one back for
  // the other is how a leaderboard row ends up showing a pair of shoes.
  const key = `${encodeSpec(spec)}@${Math.round(size)}x${ratio.toFixed(1)}${
    full ? 'F' : ''
  }${(options.aspect ?? 1).toFixed(2)}`
  const kept = cache.get(key)
  if (kept) {
    // Re-inserted so the map's own insertion order is a least-recently-used
    // list, which is all the eviction below needs.
    cache.delete(key)
    cache.set(key, kept)
    const shown = size * (options.aspect ?? 1)
    target.clearRect(0, 0, size, shown)
    target.drawImage(kept, 0, 0, size, shown)
    return true
  }

  const { gl, canvas, uniforms } = open_

  const aspect = Math.max(1, Math.min(2, options.aspect ?? 1))
  const wide = pixelsFor(size, ratio)
  const tall = Math.round(wide * aspect)
  if (canvas.width !== wide || canvas.height !== tall) {
    canvas.width = wide
    canvas.height = tall
  }
  gl.viewport(0, 0, wide, tall)

  const hair = hairOf(spec).style
  gl.uniform3fv(uniforms.uSkin ?? null, rgb(skinOf(spec).colour))
  gl.uniform3fv(uniforms.uHair ?? null, rgb(hairColourOf(spec).colour))
  gl.uniform3fv(uniforms.uCloth ?? null, rgb(topColourOf(spec)))
  gl.uniform3fv(uniforms.uBack ?? null, rgb(backdropOf(spec).colour))
  gl.uniform1i(uniforms.uStyle ?? null, HAIR_INDEX[hair] ?? 0)
  gl.uniform1i(uniforms.uOutfit ?? null, OUTFIT_INDEX[outfitOf(spec).style] ?? 0)
  gl.uniform1i(uniforms.uExtra ?? null, EXTRA_INDEX[accessoryOf(spec).style] ?? 0)
  gl.uniform3fv(uniforms.uBottomCol ?? null, rgb(bottomColourOf(spec)))
  gl.uniform3fv(uniforms.uOuterCol ?? null, rgb(outerColourOf(spec)))
  gl.uniform3fv(uniforms.uShoeCol ?? null, rgb(shoeColourOf(spec)))
  gl.uniform1i(uniforms.uBottom ?? null, BOTTOM_INDEX[bottomOf(spec).style] ?? 0)
  gl.uniform1i(uniforms.uOuter ?? null, OUTER_INDEX[outerOf(spec).style] ?? 0)
  gl.uniform1i(uniforms.uShoes ?? null, SHOE_INDEX[shoesOf(spec).style] ?? 0)
  gl.uniform1f(uniforms.uEars ?? null, COVERS_EARS.has(hair) ? 0 : 1)
  gl.uniform1f(uniforms.uFull ?? null, full ? 1 : 0)
  gl.uniform1f(uniforms.uBuild ?? null, buildOf(spec).weight)
  gl.uniform1f(uniforms.uAspect ?? null, aspect)

  gl.drawArrays(gl.TRIANGLES, 0, 3)

  // A lost context reports itself here rather than silently drawing nothing.
  if (gl.isContextLost()) {
    rig = null
    return false
  }

  target.clearRect(0, 0, size, size * aspect)
  target.drawImage(canvas, 0, 0, size, size * aspect)

  // Kept at the destination's real resolution rather than its CSS size: what a
  // second caller wants is pixels it can draw one-to-one, not the chance to
  // resample a downscaled copy.
  const keep = document.createElement('canvas')
  keep.width = Math.max(1, Math.round(size * ratio))
  keep.height = keep.width
  keep.getContext('2d')?.drawImage(canvas, 0, 0, keep.width, keep.height)
  cache.set(key, keep)
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  return true
}

/** Whether the 3D path is available at all, for callers that want to know. */
export function canRenderIn3D(): boolean {
  return open() !== null
}
