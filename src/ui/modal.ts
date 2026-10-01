/** Shared modal ownership for the existing overlays, including nested sheets. */
const layers: ModalLayer[] = []
const focusable = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex]:not([tabindex="-1"])'
const visible = (node: HTMLElement): boolean => !node.closest('[hidden], [inert]') && node.getClientRects().length > 0

export class ModalLayer {
  private opener: HTMLElement | null = null
  private inert: Array<[HTMLElement, boolean]> = []
  private opened = false
  private priorInert = false
  constructor(private root: HTMLElement, private panel: HTMLElement, private dismiss?: () => void) {
    this.panel.tabIndex = -1
  }
  open(initial?: HTMLElement): void {
    if (this.opened) return
    this.opened = true
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    this.priorInert = this.root.inert
    // A parent layer isolated this sibling earlier. The newly active layer
    // must become interactive before its controls can receive focus.
    this.root.inert = false
    this.root.hidden = false
    // Walk the ancestry: a sheet may live inside another screen or overlay.
    for (let branch: HTMLElement | null = this.root; branch?.parentElement; branch = branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling instanceof HTMLElement && sibling !== branch) {
          this.inert.push([sibling, sibling.inert])
          sibling.inert = true
        }
      }
      if (branch.parentElement === document.body) break
    }
    layers.push(this)
    document.addEventListener('keydown', this.key, true)
    document.addEventListener('focusin', this.focus, true)
    ;(initial && visible(initial) ? initial : this.controls()[0] ?? this.panel).focus({ preventScroll: true })
  }
  close(): void {
    if (!this.opened) return
    this.opened = false
    layers.splice(layers.indexOf(this), 1)
    document.removeEventListener('keydown', this.key, true)
    document.removeEventListener('focusin', this.focus, true)
    for (const [node, prior] of this.inert.reverse()) node.inert = prior
    this.inert = []
    this.root.inert = this.priorInert
    const opener = this.opener
    this.opener = null
    // Callers may switch screens immediately after closing. Do not focus a
    // hidden launch button; return to the next visible task in that case.
    queueMicrotask(() => {
      const target = opener && opener.tabIndex >= 0 && visible(opener) ? opener
        : layers.at(-1)?.controls()[0] ?? Array.from(document.querySelectorAll<HTMLElement>('.screen:not([hidden]) #board, .screen:not([hidden]) #start-game, .screen:not([hidden]) button')).find(visible)
      target?.focus({ preventScroll: true })
    })
  }
  private controls(): HTMLElement[] {
    return Array.from(this.panel.querySelectorAll<HTMLElement>(focusable)).filter(node => node.tabIndex >= 0 && visible(node))
  }
  private ownsFocus(): boolean {
    // A native discard dialog owns the browser's top layer while it is open.
    return layers.at(-1) === this && !document.querySelector('dialog[open]')
  }
  private focus = (event: FocusEvent): void => {
    if (this.ownsFocus() && !this.panel.contains(event.target as Node))
      (this.controls()[0] ?? this.panel).focus({ preventScroll: true })
  }
  private key = (event: KeyboardEvent): void => {
    if (!this.ownsFocus()) return
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation()
      this.dismiss?.()
    } else if (event.key === 'Tab') {
      const controls = this.controls()
      const first = controls[0] ?? this.panel, last = controls.at(-1) ?? this.panel
      if (!controls.length || (event.shiftKey ? document.activeElement === first : document.activeElement === last)
        || !controls.includes(document.activeElement as HTMLElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      }
    }
  }
}
