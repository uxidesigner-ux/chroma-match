/**
 * Offline support for Chroma Match.
 *
 * The game is a single JS bundle with no runtime fetches, so caching what the
 * browser asks for is enough to make it work with no network at all. Assets are
 * content-hashed by the build and can be cached forever; the page itself is not,
 * so it goes to the network first and a new deploy is picked up on the next
 * visit rather than being pinned to whatever shipped first.
 */
const CACHE = 'chroma-match-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE) await caches.delete(key)
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  if (new URL(request.url).origin !== self.location.origin) return
  event.respondWith(request.mode === 'navigate' ? networkFirst(request) : cacheFirst(request))
})

async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch {
    return (await cache.match(request)) ?? (await cache.match('./')) ?? Response.error()
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}
