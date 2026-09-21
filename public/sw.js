/**
 * Offline support for Chroma Match.
 *
 * Application chunks and the optional versioned VRM are cached on demand. Assets are
 * content-hashed by the build and can be cached forever; the page itself is not,
 * so it goes to the network first and a new deploy is picked up on the next
 * visit rather than being pinned to whatever shipped first.
 */
// Other GitHub Pages projects can share this origin. Never delete their caches.
const PREFIX = `chroma-match:${new URL(self.registration.scope).pathname}:`
const CACHE = `${PREFIX}v2`

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key)
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
    if (response.ok) await cache.put(request, response.clone()).catch(() => {})
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
  if (response.ok) await cache.put(request, response.clone()).catch(() => {})
  return response
}
