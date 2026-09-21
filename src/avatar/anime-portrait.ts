import { encodeAnime } from './anime-spec.ts'
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

export function invalidatePortrait(canvas: HTMLCanvasElement): void {
  requests.delete(canvas)
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
  ctx.fillStyle = '#fff'
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
      ctx.fillStyle = '#fff'
      ctx.fillText('—', size / 2, size * 0.55)
    })
}
