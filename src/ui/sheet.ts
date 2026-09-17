function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}

/**
 * A panel that slides up from the bottom of the screen.
 *
 * The launch screen used to lay everything out in a row of its own: who is
 * playing, the daily reward, three missions, the board. Read top to bottom
 * that is five decisions before the one thing the screen is actually for,
 * which is pressing Play. A sheet is how a block gets to exist without
 * costing a row — it is a button until it is opened, and the button says
 * what is behind it rather than showing all of it at once.
 *
 * Closing on a tap outside the panel needs no extra markup: the panel does
 * not fill the sheet's own fixed, full-viewport root, so a tap that lands on
 * the root itself — never bubbled up from inside the panel — is by
 * definition a tap on the backdrop.
 */
export class Sheet {
  private root: HTMLElement
  private panel: HTMLElement

  constructor(rootId: string) {
    this.root = el(rootId)
    const panel = this.root.querySelector<HTMLElement>('.sheet-panel')
    if (!panel) throw new Error(`Sheet #${rootId} has no .sheet-panel`)
    this.panel = panel

    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.hide()
    })
    // On the root rather than the panel: Escape is pressed without anything
    // inside the sheet ever having been focused, so the keydown's target is
    // whatever the page focus already was — document.body, usually — and an
    // event there does not bubble down into a listener on a descendant.
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.root.hidden) this.hide()
    })
  }

  /** Whether the sheet is closed, for callers that repaint only what is up. */
  get hidden(): boolean {
    return this.root.hidden
  }

  show(): void {
    this.root.hidden = false
    // `hidden` and the transition's starting class have to land in different
    // frames, or the browser coalesces them and there is nothing to animate
    // from — the panel would simply appear already open.
    requestAnimationFrame(() => this.root.classList.add('is-open'))
  }

  hide(): void {
    if (this.root.hidden) return
    this.root.classList.remove('is-open')
    let done = false
    const finish = () => {
      if (done) return
      done = true
      this.root.hidden = true
    }
    // `transitionend` covers the normal case; the timeout covers reduced
    // motion and any browser that never fires it for this property, so the
    // sheet still disappears rather than sitting there invisibly interactive.
    this.panel.addEventListener('transitionend', finish, { once: true })
    setTimeout(finish, 260)
  }
}
