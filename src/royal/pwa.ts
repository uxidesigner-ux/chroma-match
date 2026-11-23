/** Optional offline delivery. Local development never registers a service worker. */
export interface PwaResult { status: 'ready' | 'unsupported' | 'development' | 'error'; registration?: ServiceWorkerRegistration }
let registration: ServiceWorkerRegistration | null = null
let loading: Promise<PwaResult> | null = null
let updateReported = false
function reportUpdate(): void {
  if (updateReported) return
  updateReported = true
  document.documentElement.dataset.pwaUpdate = 'ready'
  window.dispatchEvent(new Event('royal-update-ready'))
}
export function registerRoyalPwa(): Promise<PwaResult> {
  if (loading) return loading
  if (!import.meta.env.PROD) return Promise.resolve({ status: 'development' })
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return Promise.resolve({ status: 'unsupported' })
  loading = (async (): Promise<PwaResult> => {
    try {
      const base = new URL(import.meta.env.BASE_URL, location.origin)
      registration = await navigator.serviceWorker.register(new URL('sw.js', base), { scope: base.pathname, updateViaCache: 'none' })
      if (registration.waiting) reportUpdate()
      registration.addEventListener('updatefound', () => {
        const worker = registration?.installing
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) reportUpdate()
        })
      })
      void navigator.serviceWorker.ready.then(() => {
        document.documentElement.dataset.pwaOffline = 'ready'
        window.dispatchEvent(new Event('royal-offline-ready'))
      })
      return { status: 'ready', registration }
    } catch {
      document.documentElement.dataset.pwaOffline = 'unavailable'
      return { status: 'error' }
    }
  })()
  return loading
}
/** Invoke from an explicit update button; never interrupts a running board. */
export async function applyRoyalUpdate(): Promise<boolean> {
  if (!registration?.waiting) return false
  const worker = registration.waiting
  const changed = new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }))
  worker.postMessage({ type: 'ROYAL_ACTIVATE_UPDATE' })
  await changed
  location.reload()
  return true
}
