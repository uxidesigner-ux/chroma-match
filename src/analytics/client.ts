import {CONSENT_KEY, GAME_URL, MEASUREMENT_ID, consentOf, liveLocation, privateReferrer, safeEvent, type Consent, type EventData, type EventName} from './model.ts'
type Gtag = (...args: unknown[]) => void
type AnalyticsWindow = Window & {dataLayer?: unknown[]; gtag?: Gtag; [key: `ga-disable-${string}`]: boolean}
const target = window as unknown as AnalyticsWindow
const denied = {analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'}
/** Basic consent mode: no Google requests, queue, or analytics cookies before opt-in. */
class Analytics {
  consent: Consent = null
  retained = true
  private started = false
  private loaded = false
  private configured = false
  private failed = false
  private pageSent = false
  private screenName = 'map'
  private lastScreen = ''
  private queue: Array<[EventName, EventData]> = []
  private listeners = new Set<() => void>()
  private seen = new Set<string>()
  constructor() { try { this.consent = consentOf(localStorage.getItem(CONSENT_KEY)) } catch { this.retained = false } }
  get available(): boolean {
    return import.meta.env.PROD && liveLocation(location.href) && navigator.doNotTrack !== '1'
      && !(navigator as Navigator & {globalPrivacyControl?: boolean}).globalPrivacyControl
  }
  get allowed(): boolean { return this.available && this.consent === 'granted' }
  onChange(fn: () => void): void { this.listeners.add(fn) }
  start(): void {
    if (this.started) return
    this.started = true
    window.addEventListener('storage', event => {
      if (event.key !== CONSENT_KEY && event.key !== null) return
      this.consent = consentOf(event.key === null ? null : event.newValue)
      this.apply(); this.listeners.forEach(fn => fn())
    })
    this.apply()
  }
  choose(grant: boolean): void {
    this.consent = grant ? 'granted' : 'denied'
    try { localStorage.setItem(CONSENT_KEY, this.consent); this.retained = true } catch { this.retained = false }
    this.apply(); this.listeners.forEach(fn => fn())
  }
  private command(...args: unknown[]): void { try { target.gtag?.(...args) } catch { /* Telemetry never breaks play. */ } }
  private apply(): void {
    target[`ga-disable-${MEASUREMENT_ID}`] = !this.allowed
    if (!this.allowed) {
      this.queue = []; this.seen.clear(); this.lastScreen = ''
      if (this.configured) this.command('consent', 'update', denied)
      try {
        for (const cookie of document.cookie.split(';')) {
          const name = cookie.trim().split('=')[0] ?? ''
          if (name.startsWith('chroma_match_')) document.cookie = `${name}=; Max-Age=0; Path=/chroma-match/; SameSite=Lax; Secure`
        }
      } catch { /* Blocked cookie access must not prevent basic play. */ }
      return
    }
    if (this.configured) {
      this.command('consent', 'update', {...denied, analytics_storage: 'granted'})
      if (this.loaded) this.ready()
      return
    }
    this.configured = true
    target.dataLayer ??= []
    target.gtag ??= function (..._args: unknown[]) { target.dataLayer!.push(arguments) }
    this.command('consent', 'default', denied)
    this.command('set', 'ads_data_redaction', true)
    this.command('consent', 'update', {...denied, analytics_storage: 'granted'})
    this.command('js', new Date())
    this.command('config', MEASUREMENT_ID, {
      send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
      page_location: GAME_URL, page_referrer: privateReferrer(document.referrer), page_title: 'Chroma Match',
      cookie_prefix: 'chroma_match', cookie_path: '/chroma-match/', cookie_domain: 'none',
      cookie_expires: 60 * 60 * 24 * 90, cookie_flags: 'SameSite=Lax;Secure',
    })
    const script = document.createElement('script')
    script.id = 'chroma-ga4'; script.async = true; script.referrerPolicy = 'no-referrer'
    script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`
    const timer = setTimeout(() => { if (!this.loaded) { this.failed = true; this.queue = [] } }, 10_000)
    script.addEventListener('load', () => { clearTimeout(timer); this.loaded = true; this.failed = false; if (this.allowed) this.ready() }, {once: true})
    script.addEventListener('error', () => { clearTimeout(timer); this.failed = true; this.queue = [] }, {once: true})
    this.screen(this.screenName)
    document.head.append(script)
  }
  private send(name: string, data: EventData): void {
    if (!this.allowed) return
    this.command('event', name, {...data, send_to: MEASUREMENT_ID, page_location: GAME_URL,
      page_title: 'Chroma Match', page_referrer: privateReferrer(document.referrer), transport_type: 'beacon'})
  }
  private ready(): void {
    if (!this.pageSent) { this.pageSent = true; this.send('page_view', {}) }
    this.screen(this.screenName)
    const queued = this.queue.splice(0)
    for (const [name, data] of queued) this.send(name, data)
  }
  screen(name: string): void {
    this.screenName = name
    // Queue only post-consent screen changes; opting in never backfills history.
    if (!this.allowed || name === this.lastScreen) return
    this.lastScreen = name; this.event('screen_view', {screen_name: name})
  }
  event(name: EventName, data: Record<string, unknown> = {}, key?: string): void {
    if (!this.allowed || this.failed) return
    if (key) {
      if (this.seen.has(key)) return
      this.seen.add(key); if (this.seen.size > 128) this.seen.delete(this.seen.values().next().value!)
    }
    const clean = safeEvent(name, data)
    if (!this.loaded) { if (this.queue.length < 40) this.queue.push([name, clean]); return }
    this.send(name, clean)
  }
}
export const analytics = new Analytics()
