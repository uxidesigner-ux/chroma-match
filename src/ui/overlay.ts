export interface OverlayContent {
  kicker: string
  title: string
  body: string
  /** The primary button. */
  action: string
  onAction: () => void
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
  private action = el<HTMLButtonElement>('overlay-action')
  private home = el<HTMLButtonElement>('overlay-home')
  private form = el<HTMLFormElement>('post-run')
  private name = el<HTMLInputElement>('post-name')
  private submit = el<HTMLButtonElement>('post-submit')
  private status = el('post-status')

  private onAction: (() => void) | null = null
  private onSecondary: (() => void) | null = null
  private onSubmit: ((name: string) => Promise<{ ok: boolean; message: string }>) | null = null

  constructor() {
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
      this.setStatus('Pick a name first.', 'is-error')
      this.name.focus()
      return
    }

    this.submit.disabled = true
    this.name.disabled = true
    this.setStatus('Posting…', null)
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
      this.setStatus('Could not reach the leaderboard. Your score is saved locally.', 'is-error')
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
    this.kicker.textContent = content.kicker
    this.title.textContent = content.title
    this.body.textContent = content.body
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
    this.onAction = null
    this.onSecondary = null
    this.onSubmit = null
  }
}
