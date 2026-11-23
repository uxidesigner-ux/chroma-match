/* Chroma Royale: bounded, scope-local offline shell. Build injects the revision. */
const BUILD = '__ROYAL_BUILD_ID__'
const ROOT = new URL(self.registration.scope)
const PREFIX = `chroma-royale:${ROOT.pathname}:`
const LEGACY_PREFIX = `chroma-match:${ROOT.pathname}:`
const CACHE = `${PREFIX}${BUILD}`
const SHELL = new URL('index.html', ROOT).href
const MAX_RUNTIME_ENTRIES = 100

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch(new URL('royal-precache.json', ROOT), { cache: 'no-store' })
    if (!response.ok) throw new Error('Offline asset list is unavailable')
    const manifest = await response.json()
    if (manifest.version !== BUILD || !Array.isArray(manifest.files)) throw new Error('Offline revision mismatch')
    const urls = manifest.files.map(file => new URL(file, ROOT))
    if (urls.some(url => url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname))) throw new Error('Invalid offline asset scope')
    const cache = await caches.open(CACHE)
    try {
      // Fetch individually with reload to avoid the browser HTTP cache retaining an
      // earlier revision of the un-hashed illustration files.
      await Promise.all(urls.map(async url => {
        const asset = await fetch(new Request(url, { cache: 'reload' }))
        if (!asset.ok) throw new Error(`Offline asset failed: ${url.pathname}`)
        await cache.put(url.href, asset)
      }))
    } catch (error) { await caches.delete(CACHE); throw error }
    if (!self.registration.active) await self.skipWaiting()
  })())
})

self.addEventListener('message', event => {
  if (event.data?.type === 'ROYAL_ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    // Retain the preceding royal cache for a still-open older client. Never
    // touch another GitHub Pages application's cache on this shared origin.
    const previous = keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).at(-1)
    await Promise.all(keys.filter(key => key.startsWith(LEGACY_PREFIX) || (key.startsWith(PREFIX) && key !== CACHE && key !== previous)).map(key => caches.delete(key)))
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable()
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return
  if (request.mode === 'navigate') { event.respondWith(navigate(event)); return }
  const relative = url.pathname.slice(ROOT.pathname.length)
  // No account, analytics, VRM or legacy game caches. Only assets used by this app.
  if (/^(assets\/[^/]+\.(?:js|css)|royal\/.+\.(?:webp|png|svg)|icons\/[^/]+\.png|manifest\.webmanifest)$/.test(relative)) event.respondWith(asset(request))
})

async function navigate(event) {
  const cache = await caches.open(CACHE)
  try {
    const response = await event.preloadResponse || await fetch(event.request)
    // Runtime HTML must not replace the version-matched offline shell. An online
    // new build may install while an older worker still controls this tab.
    return response.ok ? response : (await cache.match(SHELL)) || response
  } catch { return (await cache.match(SHELL)) || Response.error() }
}

async function asset(request) {
  const cache = await caches.open(CACHE)
  // These allowlisted files are public and same-origin. Module/style requests
  // add Origin while the install fetch does not; ignore the server's Vary:
  // Origin so that the exact same immutable file remains available offline.
  const hit = await cache.match(request, { ignoreVary: true })
  if (hit) return hit
  // An older page may still request its content-hashed bundle after an update.
  const previous = (await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE)
  for (const key of previous) { const older = await (await caches.open(key)).match(request, { ignoreVary: true }); if (older) return older }
  try {
    const response = await fetch(request)
    if (response.ok && response.type !== 'opaque') {
      const keys = await cache.keys()
      if (keys.length < MAX_RUNTIME_ENTRIES) await cache.put(request, response.clone()).catch(() => {})
    }
    return response
  } catch { return Response.error() }
}
