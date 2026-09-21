import { DEFAULT_SPEC, decodeSpec, encodeSpec } from './spec.ts'
import type { AvatarSpec } from './spec.ts'
import { invalidatePortrait, paintAnimePortrait } from './anime-portrait.ts'

const KEY = 'chroma-match:avatar'
let cached: AvatarSpec | null = null

/** Existing anime appearances migrate without changing their model choices. */
export function myAvatar(): AvatarSpec {
  if (cached) return cached
  let stored = ''
  try { stored = localStorage.getItem(KEY) ?? '' } catch { /* private mode */ }
  cached = decodeSpec(stored)
  const code = encodeSpec(cached)
  if (stored !== code) {
    try { localStorage.setItem(KEY, code) } catch { /* display still works */ }
  }
  return cached
}

export function setMyAvatar(spec: AvatarSpec): boolean {
  try { localStorage.setItem(KEY, encodeSpec(spec)) } catch { return false }
  cached = spec
  return true
}

export function myAvatarCode(): string {
  return encodeSpec(myAvatar())
}

export { DEFAULT_SPEC }

export interface PaintOptions { round?: boolean }

/** Every profile surface uses the same cached, face-focused anime portrait. */
export function paintAvatar(
  canvas: HTMLCanvasElement,
  spec: AvatarSpec,
  size: number,
  options: PaintOptions = {},
): void {
  const ratio = Math.min(3, Math.max(1, window.devicePixelRatio || 1))
  invalidatePortrait(canvas)
  canvas.width = canvas.height = Math.round(size * ratio)
  canvas.style.width = canvas.style.height = `${size}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, size, size)
  paintAnimePortrait(canvas, spec, size, options.round === true)
}

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
