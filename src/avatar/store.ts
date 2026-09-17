import { DEFAULT_SPEC, decodeSpec, encodeSpec, randomSpec } from './spec.ts'
import type { AvatarSpec } from './spec.ts'
import { drawAvatar } from './draw.ts'
import { renderAvatar } from './gl.ts'

/**
 * The player's own avatar, and a way to paint anyone's.
 *
 * Kept next to the coins rather than with the run record, because it is not
 * part of a run: a score is decided by a seed and a list of moves and an avatar
 * cannot move either of them. What it does travel with is the *player* — the
 * profile document a friend reads, and whatever a shared score ends up looking
 * like — so it is stored as the same string in both places.
 */

const KEY = 'chroma-match:avatar'

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

function write(value: string): void {
  try {
    localStorage.setItem(KEY, value)
  } catch {
    /* private mode, or the quota is full; the avatar is simply not kept */
  }
}

let cached: AvatarSpec | null = null

/**
 * The avatar this device plays as.
 *
 * A player who has never opened the editor still gets a face, and a random one
 * rather than a fixed one: a leaderboard where everybody who has not customised
 * themselves is the same grey default tells you nothing about who is on it, and
 * the first thing an avatar has to do is distinguish people.
 */
export function myAvatar(): AvatarSpec {
  if (cached) return cached
  const stored = read()
  cached = stored ? decodeSpec(stored) : randomSpec()
  if (!stored) write(encodeSpec(cached))
  return cached
}

export function setMyAvatar(spec: AvatarSpec): void {
  cached = spec
  write(encodeSpec(spec))
}

/** The encoded form, for a profile document or a share. */
export function myAvatarCode(): string {
  return encodeSpec(myAvatar())
}

export { DEFAULT_SPEC }

/**
 * Paints a spec into a canvas element at its CSS size.
 *
 * Every surface that shows a face goes through here, so none of them has to
 * think about device pixel ratio — a canvas sized in CSS pixels and drawn in
 * CSS pixels is a blurry avatar on every phone made in the last decade — and
 * none of them has to know which renderer drew it either. The ray marcher is
 * tried first; the drawn version stays as the fallback for a browser or a
 * driver that will not give us a context, because a face that is flatter than
 * intended beats a blank square.
 */
export interface PaintOptions {
  round?: boolean
  /** Frame the whole figure rather than the head and shoulders. */
  full?: boolean
  /** Image height over width. Square unless a caller asks otherwise. */
  aspect?: number
}

export function paintAvatar(
  canvas: HTMLCanvasElement,
  spec: AvatarSpec,
  size: number,
  options: PaintOptions = {},
): void {
  const ratio = Math.min(3, Math.max(1, window.devicePixelRatio || 1))
  const aspect = options.aspect ?? 1
  canvas.width = Math.round(size * ratio)
  canvas.height = Math.round(size * aspect * ratio)
  canvas.style.width = `${size}px`
  canvas.style.height = `${size * aspect}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, size, size * aspect)
  if (renderAvatar(ctx, spec, size, ratio, { full: options.full === true, aspect })) return

  // The drawn fallback only knows how to paint a bust — it exists for a driver
  // that will not give us a context at all, and a flatter portrait where a
  // figure was asked for still says who this is. What it must not do is paint
  // that bust into the top of a canvas shaped for a standing figure, so the
  // canvas goes back to a square first.
  if (aspect !== 1) {
    canvas.height = Math.round(size * ratio)
    canvas.style.height = `${size}px`
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, size, size)
  }
  drawAvatar(ctx, spec, size, options)
}

/** A canvas already painted, for code that is building a row from scratch. */
export function avatarCanvas(
  spec: AvatarSpec,
  size: number,
  options: PaintOptions = {},
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.className = 'avatar'
  canvas.setAttribute('aria-hidden', 'true')
  paintAvatar(canvas, spec, size, options)
  return canvas
}
