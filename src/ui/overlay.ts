import { t } from '../i18n/index.ts'
import { myAvatar, paintAvatar } from '../avatar/store.ts'

export interface OverlayContent {
  kicker: string
  title: string
  /**
   * The one number the card is about, shown at the size it deserves.
   *
   * A run's score used to be a clause in a sentence. On the screen a player
   * sees at the end of every run, the score is the whole point of the run, and
   * a sentence is where it goes to be ignored.
   */
  hero?: { value: string; caption: string; flair?: string }
  body: string
  /** The primary button. */
  action: string
  onAction: () => void
  celebration?: 'clear' | 'record'
  /** An optional second way out, e.g. back to the launch screen. */
  secondary?: { label: string; onAction: () => void }
  /** Shows the "post this run" form when a finished run can be submitted. */
  post?: {
    initialName: string
    onSubmit: (name: string) => Promise<{ ok: boolean; message: string }>
  }
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}

/** The end-of-level and end-of-run dialog, including posting a score. */
export class Overlay {
  private root = el('overlay')
  private kicker = el('overlay-kicker')
  private title = el('overlay-title')
  private body = el('overlay-body')
  private heroBox = el('overlay-hero')
  private heroValue = el('overlay-hero-value')
  private heroCaption = el('overlay-hero-caption')
  private flair = el('overlay-flair')
  private action = el<HTMLButtonElement>('overlay-action')
  private home = el<HTMLButtonElement>('overlay-home')
  private form = el<HTMLFormElement>('post-run')
  private name = el<HTMLInputElement>('post-name')
  private submit = el<HTMLButtonElement>('post-submit')
  private status = el('post-status')
  private victory = el('overlay-victory')
  private avatar = el<HTMLCanvasElement>('victory-avatar')

  private onAction: (() => void) | null = null
  private onSecondary: (() => void) | null = null
  private onSubmit: ((name: string) => Promise<{ ok: boolean; message: string }>) | null = null

  constructor() {
    const confetti = el('victory-confetti')
    for (let i = 0; i < 24; i++) {
      const chip = document.createElement('i')
      const angle = (i / 24) * Math.PI * 2
      chip.style.setProperty('--dx', `${Math.cos(angle) * (85 + (i % 3) * 24)}px`)
      chip.style.setProperty('--dy', `${Math.sin(angle) * 82 - 18}px`)
      chip.style.setProperty('--turn', `${(i % 2 ? 1 : -1) * (90 + i * 17)}deg`)
      chip.style.setProperty('--delay', `${(i % 4) * 45}ms`)
      confetti.append(chip)
    }
    this.action.addEventListener('click', () => {
      const run = this.onAction
      this.hide()
      run?.()
    })
    this.home.addEventListener('click', () => {
      const run = this.onSecondary
      this.hide()
      run?.()
    })
    this.form.addEventListener('submit', (event) => {
      event.preventDefault()
      void this.post()
    })
  }

  private async post(): Promise<void> {
    const handler = this.onSubmit
    if (!handler) return
    const name = this.name.value.trim()
    if (name.length === 0) {
      this.setStatus(t('postNoName'), 'is-error')
      this.name.focus()
      return
    }

    this.submit.disabled = true
    this.name.disabled = true
    this.setStatus(t('posting'), null)
    try {
      const result = await handler(name)
      this.setStatus(result.message, result.ok ? 'is-ok' : 'is-error')
      if (result.ok) {
        // A run can only be posted once; leave the outcome on screen.
        this.onSubmit = null
      } else {
        this.submit.disabled = false
        this.name.disabled = false
      }
    } catch {
      this.setStatus(t('postFailed'), 'is-error')
      this.submit.disabled = false
      this.name.disabled = false
    }
  }

  private setStatus(text: string, tone: 'is-ok' | 'is-error' | null): void {
    this.status.textContent = text
    this.status.classList.remove('is-ok', 'is-error')
    if (tone) this.status.classList.add(tone)
  }

  show(content: OverlayContent): void {
    // Opt in only for actual accomplishments, not daily gifts or errors.
    this.root.dataset.celebration = content.celebration ?? ''
    this.victory.hidden = !content.celebration
    if (content.celebration) paintAvatar(this.avatar, myAvatar(), 72, { round: true })
    this.kicker.textContent = content.kicker
    this.title.textContent = content.title

    this.heroBox.hidden = !content.hero
    if (content.hero) {
      this.heroValue.textContent = content.hero.value
      this.heroCaption.textContent = content.hero.caption
      this.flair.hidden = !content.hero.flair
      if (content.hero.flair) this.flair.textContent = content.hero.flair
    }

    this.body.textContent = content.body
    this.body.hidden = content.body.length === 0
    this.action.textContent = content.action
    this.onAction = content.onAction

    this.onSecondary = content.secondary?.onAction ?? null
    this.home.hidden = !content.secondary
    if (content.secondary) this.home.textContent = content.secondary.label

    this.form.hidden = !content.post
    this.onSubmit = content.post?.onSubmit ?? null
    if (content.post) {
      this.name.value = content.post.initialName
      this.name.disabled = false
      this.submit.disabled = false
      this.setStatus('', null)
    }

    this.root.hidden = false
    this.action.focus()
  }

  hide(): void {
    this.root.hidden = true
    this.victory.hidden = true
    this.root.dataset.celebration = ''
    this.onAction = null
    this.onSecondary = null
    this.onSubmit = null
  }
}
