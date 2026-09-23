import { DEFAULT_ANIME, encodeAnime } from './anime-spec.ts'
import type { AnimeSpec } from './anime-spec.ts'
import { portraitFrame } from './portrait-frame.ts'

const KEY = 'chroma-match:anime-portrait-v1'
const cache = new Map<string, Promise<HTMLImageElement>>()
const requests = new WeakMap<HTMLCanvasElement, symbol>()
let queue: Promise<unknown> = Promise.resolve()

function image(data: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = data
  })
}

export function cachePortrait(spec: AnimeSpec, png: string): void {
  const key = encodeAnime(spec)
  cache.set(key, image(png))
  if (cache.size > 32) cache.delete(cache.keys().next().value!)
  // A single bounded local image is a cache, never the authoritative save.
  try {
    localStorage.setItem(KEY, JSON.stringify({ key, png }))
  } catch {
    /* regeneration is safe */
  }
}

function portrait(spec: AnimeSpec): Promise<HTMLImageElement> {
  const key = encodeAnime(spec)
  const hit = cache.get(key)
  if (hit) return hit
  const work = queue
    .catch(() => {})
    .then(async () => {
      try {
        const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as {
          key?: string
          png?: string
        } | null
        if (
          saved?.key === key &&
          saved.png?.startsWith('data:image/png;base64,') &&
          saved.png.length < 400000
        ) {
          try {
            return await image(saved.png)
          } catch {
            /* regenerate corrupt cache */
          }
        }
      } catch {
        /* storage disabled */
      }
      // New and migrated profiles do not need to download the 11 MB model.
      if (key === encodeAnime(DEFAULT_ANIME)) {
        return image(`${import.meta.env.BASE_URL}avatars/seed-v1/default-portrait.png`)
      }
      const { AnimeRenderer } = await import('./anime-renderer.ts')
      const renderer = new AnimeRenderer(document.createElement('canvas'))
      try {
        await renderer.load(spec)
        return await image(renderer.portrait())
      } finally {
        renderer.dispose()
      }
    })
  queue = work
  cache.set(key, work)
  if (cache.size > 32) cache.delete(cache.keys().next().value!)
  void work.catch(() => {
    cache.delete(key)
  })
  return work
}

/** Finish any missing portrait before starting the lobby's separate 3D scene. */
export async function preparePortrait(spec: AnimeSpec): Promise<void> {
  await portrait(spec)
}

export function invalidatePortrait(canvas: HTMLCanvasElement): void {
  requests.delete(canvas)
}

/**
 * Ink that can be read on a given backdrop.
 *
 * The two marks this file draws itself — the dots while a portrait renders and
 * the dash when one cannot — used to be white, which was safe while every
 * backdrop on offer was a shade of night. Daylight is on the list now, and a
 * white dash on white is a portrait that looks like it drew nothing at all.
 */
function inkOn(backdrop: string): string {
  const hex = /^[0-9a-f]{6}$/i.test(backdrop) ? backdrop : '202C3D'
  const channel = (at: number): number => {
    const value = parseInt(hex.slice(at, at + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const light = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
  return light > 0.3 ? '#101318' : '#ffffff'
}

export function paintAnimePortrait(
  canvas: HTMLCanvasElement,
  spec: AnimeSpec,
  size: number,
  round: boolean,
): void {
  const request = Symbol()
  requests.set(canvas, request)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  // A neutral placeholder communicates loading; it is not another character.
  ctx.fillStyle = `#${spec.backdrop}`
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = inkOn(spec.backdrop)
  ctx.textAlign = 'center'
  ctx.font = `${size * 0.3}px system-ui`
  ctx.fillText('…', size / 2, size * 0.55)
  canvas.dataset.avatarState = 'loading'
  void portrait(spec)
    .then((img) => {
      if (requests.get(canvas) !== request || !canvas.isConnected) return
      ctx.clearRect(0, 0, size, size)
      ctx.save()
      if (round) {
        ctx.beginPath()
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
        ctx.clip()
      }
      const crop = portraitFrame(img.naturalWidth)
      ctx.drawImage(img, crop.x, crop.y, crop.size, crop.size, 0, 0, size, size)
      ctx.restore()
      canvas.dataset.avatarState = 'ready'
    })
    .catch(() => {
      if (requests.get(canvas) !== request) return
      canvas.dataset.avatarState = 'error'
      ctx.clearRect(0, 0, size, size)
      ctx.fillStyle = `#${spec.backdrop}`
      ctx.fillRect(0, 0, size, size)
      ctx.fillStyle = inkOn(spec.backdrop)
      ctx.fillText('—', size / 2, size * 0.55)
    })
}
