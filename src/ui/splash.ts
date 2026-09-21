import { onLanguageChange, t } from '../i18n/index.ts'
import { playCopy } from './play-copy.ts'

/**
 * The boot screen: the game's name, and a bar that only fills when the lobby
 * character is actually on stage. The lobby stays inert behind it so nothing
 * can be pressed until that moment.
 */
export class Splash {
  private root = document.getElementById('splash')!
  private fill = document.getElementById('splash-fill')!
  private bar = document.getElementById('splash-bar')!
  private pct = document.getElementById('splash-pct')!
  private status = document.getElementById('splash-status')!
  private app = document.querySelector('main.app') as HTMLElement
  private value = 0
  private done = false

  constructor() {
    document.documentElement.classList.add('splash-open')
    onLanguageChange(() => this.paint())
    this.setProgress(6)
    this.paint()
  }

  get open(): boolean {
    return !this.done
  }

  setProgress(pct: number): void {
    if (this.done) return
    this.value = Math.max(this.value, Math.min(100, pct))
    const shown = Math.round(this.value)
    this.fill.style.width = `${this.value}%`
    this.bar.setAttribute('aria-valuenow', String(shown))
    this.pct.textContent = `${shown}%`
  }

  paint(): void {
    if (!this.done) this.status.textContent = playCopy().loading
  }

  async finish(ok: boolean): Promise<void> {
    if (this.done) return
    this.setProgress(100)
    this.status.textContent = ok ? t('splashReady') : playCopy().failed
    const instant = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!instant) await new Promise((resolve) => setTimeout(resolve, 240))
    this.hide()
  }

  hide(): void {
    this.done = true
    this.root.hidden = true
    this.app.removeAttribute('inert')
    document.documentElement.classList.remove('splash-open')
  }
}
