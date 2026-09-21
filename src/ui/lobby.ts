import type { AnimeRenderer } from '../avatar/anime-renderer.ts'
import { myAvatar } from '../avatar/store.ts'
import { preparePortrait } from '../avatar/anime-portrait.ts'
import { onLanguageChange } from '../i18n/index.ts'
import { animeCopy } from './anime-copy.ts'
import { playCopy } from './play-copy.ts'

export interface LobbyHooks {
  onProgress?: (pct: number) => void
  onBootSettled?: (ok: boolean) => void
}

/** The lobby owns one disposable WebGL scene, never active during a game/editor. */
export class Lobby {
  private root = document.getElementById('lobby-stage')!
  private canvas = document.getElementById('lobby-canvas') as HTMLCanvasElement
  private status = document.getElementById('lobby-loading')!
  private tools = document.getElementById('lobby-tools')!
  private renderer: AnimeRenderer | null = null
  private generation = 0
  private visible = false
  private booting = true
  constructor(private hooks: LobbyHooks = {}) {
    onLanguageChange(() => this.paint())
    this.paint()
  }
  private paint(): void {
    const copy = playCopy()
    this.canvas.setAttribute('aria-label', copy.preview)
    this.canvas.setAttribute('aria-describedby', 'lobby-hint')
    this.root.setAttribute('aria-label', copy.preview)
    document.getElementById('lobby-hint-fine')!.textContent = copy.rotate
    document.getElementById('lobby-hint-coarse')!.textContent = copy.turn
    this.tools.replaceChildren()
    for (const key of ['wave', 'cheer', 'pose'] as const) {
      const button = document.createElement('button')
      button.className = 'lobby-gesture'
      button.type = 'button'
      button.setAttribute('aria-label', copy[key])
      button.title = copy[key]
      button.disabled = this.root.dataset.state !== 'ready'
      const mark = document.createElement('span')
      mark.className = `hud-ico hud-ico-${key}`
      mark.setAttribute('aria-hidden', 'true')
      button.append(mark)
      button.addEventListener('click', () => {
        this.renderer?.gesture(key)
        this.root.dataset.gesture = key
      })
      this.tools.append(button)
    }
    if (this.root.dataset.state === 'error') this.failed()
    else this.status.textContent = copy.loading
  }
  show(): void {
    if (this.visible) return
    this.visible = true
    void this.load()
  }
  hide(): void {
    this.visible = false
    this.generation++
    this.renderer?.dispose()
    this.renderer = null
    this.root.dataset.state = 'idle'
    if (this.booting) this.settle(false)
  }
  private report(pct: number): void {
    this.hooks.onProgress?.(pct)
  }
  private settle(ok: boolean): void {
    if (!this.booting) return
    this.booting = false
    this.hooks.onBootSettled?.(ok)
  }
  private async load(): Promise<void> {
    const mine = ++this.generation
    this.renderer?.dispose(); this.renderer = null
    const fresh = this.canvas.cloneNode(false) as HTMLCanvasElement
    this.canvas.replaceWith(fresh); this.canvas = fresh
    this.root.dataset.state = 'loading'
    this.status.hidden = this.booting
    this.paint()
    this.report(8)
    let candidate: AnimeRenderer | null = null
    try {
      // Avoid two concurrent VRM decodes/renderers when a custom portrait cache
      // was evicted. The portrait queue also serves HUD and profile consumers.
      await preparePortrait(myAvatar()).catch(() => {})
      if (!this.visible || mine !== this.generation) return
      this.report(18)
      const { AnimeRenderer } = await import('../avatar/anime-renderer.ts')
      if (!this.visible || mine !== this.generation) return
      this.report(28)
      candidate = new AnimeRenderer(this.canvas, true)
      this.renderer = candidate
      await candidate.load(myAvatar(), (ratio) => this.report(28 + ratio * 68))
      if (!this.visible || mine !== this.generation) { candidate.dispose(); return }
      candidate.attach(this.root, () => this.failed())
      this.report(100)
      this.root.dataset.state = 'ready'
      this.status.hidden = true
      this.paint()
      this.settle(true)
    } catch {
      candidate?.dispose()
      if (mine === this.generation && this.visible) this.failed()
    }
  }
  private failed(): void {
    this.root.dataset.state = 'error'
    this.status.hidden = false
    const text = document.createElement('p')
    text.textContent = playCopy().failed
    const retry = document.createElement('button')
    retry.className = 'btn btn-ghost'
    retry.type = 'button'; retry.textContent = playCopy().retry
    retry.addEventListener('click', () => void this.load())
    this.status.replaceChildren(text, retry)
    this.tools.querySelectorAll('button').forEach(button => { button.disabled = true })
    this.canvas.setAttribute('aria-label', animeCopy().failed)
    this.settle(false)
  }
}
