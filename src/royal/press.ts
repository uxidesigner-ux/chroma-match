/** Shared press feedback. Native clicks, focus, scrolling and form actions stay native. */
const CONTROLS = 'button, .booster-option, .file-button, .switch-row, .preference-grid label, summary'
type Press = { element: HTMLElement; pointer?: number; key?: string; x: number; y: number; started: number; bounds: DOMRect; grid?: HTMLElement; cell?: string }

export function installPressFeedback(root: HTMLElement, onPress?: () => void): () => void {
  const controller = new AbortController(), { signal } = controller
  const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>()
  const touched = new Set<HTMLElement>()
  let active: Press | null = null
  let lastFeedback: { element: HTMLElement; at: number } | null = null
  document.documentElement.dataset.pressFeedback = 'ready'

  function control(target: EventTarget | null): HTMLElement | null {
    const element = target instanceof Element ? target.closest<HTMLElement>(CONTROLS) : null
    return element && root.contains(element) ? element : null
  }
  function disabled(element: HTMLElement): boolean {
    return !element.getClientRects().length || element.matches(':disabled, [aria-disabled="true"]') || !!element.closest('[hidden], [inert], fieldset:disabled, dialog:not([open])')
      || (!(element instanceof HTMLButtonElement) && !!element.querySelector('input:disabled'))
  }
  function clearTimer(element: HTMLElement): void {
    const timer = timers.get(element)
    if (timer !== undefined) clearTimeout(timer)
    timers.delete(element)
  }
  function reset(element: HTMLElement): void {
    clearTimer(element); delete element.dataset.pressState; touched.delete(element)
  }
  function begin(element: HTMLElement, pointer?: number, key?: string, x = 0, y = 0): void {
    if (disabled(element) || active) return
    clearTimer(element); touched.add(element)
    const grid = element.closest<HTMLElement>('#editor-grid'), cell = element.dataset.cell
    active = { element, x, y, started: performance.now(), bounds: element.getBoundingClientRect(),
      ...(pointer === undefined ? {} : { pointer }), ...(key === undefined ? {} : { key }),
      ...(grid && cell !== undefined ? { grid, cell } : {}) }
    element.dataset.pressState = 'down'
    lastFeedback = { element, at: performance.now() }
    onPress?.()
  }
  function end(cancel = false): void {
    if (!active) return
    const { element, started } = active
    active = null
    clearTimer(element)
    if (cancel || !element.isConnected || disabled(element)) { reset(element); return }
    // A fast tap still gets one readable contact frame; the click is never delayed.
    const release = (): void => {
      if (!element.isConnected || disabled(element)) { reset(element); return }
      element.dataset.pressState = 'release'
      timers.set(element, setTimeout(() => reset(element), 340))
    }
    const remaining = Math.max(0, 65 - (performance.now() - started))
    if (remaining) timers.set(element, setTimeout(release, remaining))
    else release()
  }
  function cancel(): void { end(true); for (const element of [...touched]) reset(element) }

  root.addEventListener('pointerdown', event => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
    const element = control(event.target)
    if (element) begin(element, event.pointerId, undefined, event.clientX, event.clientY)
  }, { capture: true, signal })
  window.addEventListener('pointermove', event => {
    if (!active || active.pointer !== event.pointerId) return
    const { bounds, x, y } = active
    const outside = event.clientX < bounds.left - 3 || event.clientX > bounds.right + 3
      || event.clientY < bounds.top - 3 || event.clientY > bounds.bottom + 3
    const scrolling = event.pointerType !== 'mouse' && Math.hypot(event.clientX - x, event.clientY - y) > 12
    if (outside || scrolling) end(true)
  }, { capture: true, passive: true, signal })
  window.addEventListener('pointerup', event => { if (active?.pointer === event.pointerId) end() }, { capture: true, signal })
  window.addEventListener('pointercancel', event => { if (active?.pointer === event.pointerId) end(true) }, { capture: true, signal })
  root.addEventListener('keydown', event => {
    if (event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || !['Enter', ' '].includes(event.key)) return
    const element = control(event.target)
    if (element) begin(element, undefined, event.key)
  }, { capture: true, signal })
  window.addEventListener('keyup', event => { if (active?.key === event.key) end() }, { capture: true, signal })
  root.addEventListener('click', event => {
    // VoiceOver and other assistive activation may dispatch a click without a key/pointer pair.
    if (event.detail !== 0 || active) return
    const element = control(event.target)
    if (!element || disabled(element) || (lastFeedback?.element === element && performance.now() - lastFeedback.at < 700)) return
    begin(element); end()
  }, { capture: true, signal })
  root.addEventListener('close', cancel, { capture: true, signal })
  root.addEventListener('scroll', cancel, { capture: true, passive: true, signal })
  window.addEventListener('blur', cancel, { signal })
  window.addEventListener('pagehide', cancel, { signal })
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel() }, { signal })
  const observer = new MutationObserver(() => {
    // Painting redraws the editor's buttons during pointerdown. Transfer the
    // contact to that same cell, without adding listeners or replaying feedback.
    if (active && !active.element.isConnected && active.grid?.isConnected && active.cell !== undefined) {
      const replacement = active.grid.querySelector<HTMLElement>(`[data-cell="${active.cell}"]`)
      if (replacement) { reset(active.element); active.element = replacement; touched.add(replacement); replacement.dataset.pressState = 'down' }
    }
    if (active && (!active.element.isConnected || disabled(active.element) || active.element.closest('[hidden], dialog:not([open])'))) cancel()
  })
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'open', 'disabled', 'inert'] })

  return () => { cancel(); observer.disconnect(); controller.abort(); delete document.documentElement.dataset.pressFeedback }
}
