/** Layout only: resizing must never change a run's geometry or random stream. */
export interface PlayRect { left: number; top: number; width: number; height: number }

export function playRegion(width: number, height: number, segments: readonly PlayRect[] = [], visible?: PlayRect): PlayRect {
  const full = { left: 0, top: 0, width, height }
  const intersect = (a: PlayRect, b: PlayRect): PlayRect => {
    const left = Math.max(a.left, b.left), top = Math.max(a.top, b.top)
    return { left, top, width: Math.max(0, Math.min(a.left + a.width, b.left + b.width) - left),
      height: Math.max(0, Math.min(a.top + a.height, b.top + b.height) - top) }
  }
  const clipped = visible && Object.values(visible).every(Number.isFinite) && visible.width > 0 && visible.height > 0
    ? intersect(full, visible) : full
  const view = clipped.width > 0 && clipped.height > 0 ? clipped : full
  const valid = segments.filter(s => [s.left, s.top, s.width, s.height].every(Number.isFinite)
    && s.left >= 0 && s.top >= 0 && s.width > 0 && s.height > 0
    && s.left + s.width <= width + 1 && s.top + s.height <= height + 1)
  // A continuous flexible panel can use the full viewport. Reserve one pane
  // only when the browser actually reports a gap between the segments.
  const gap = valid.some((a, i) => valid.slice(i + 1).some(b =>
    a.left + a.width < b.left || b.left + b.width < a.left
    || a.top + a.height < b.top || b.top + b.height < a.top))
  if (valid.length < 2 || !gap) return view
  // Keyboard/browser chrome may cover part of a physical pane. Pick the most
  // usable intersection, not a full-sized pane below the visible viewport.
  return valid.map(s => intersect(s, view)).filter(s => s.width > 0 && s.height > 0)
    .sort((a, b) => b.width * b.height - a.width * a.height || a.top - b.top || a.left - b.left)[0] ?? full
}

export function playLayout(rect: PlayRect): 'stack' | 'wide' {
  // Compact landscape fits a 216px three-part rail + 280px board + gutters.
  // Waiting until 760px left 568/740px phones with barely one visible row.
  return rect.width >= 560 && rect.height < 600 && rect.width / rect.height >= 1.45 ? 'wide' : 'stack'
}

export function attachPlayLayout(): void {
  const root = document.documentElement
  const update = () => {
    const segmented = window as Window & {
      viewport?: { segments?: readonly PlayRect[] }
    }
    const viewport = window.visualViewport
    // Use the visible height when browser chrome/keyboard reduces it. Pinch
    // zoom is magnification, not a new layout or a reason to shrink the board.
    const visible = viewport && viewport.scale === 1 ? {
      left: viewport.offsetLeft ?? 0, top: viewport.offsetTop ?? 0,
      width: viewport.width ?? innerWidth, height: viewport.height,
    } : undefined
    const region = playRegion(innerWidth, innerHeight, segmented.viewport?.segments, visible)
    root.dataset.playLayout = playLayout(region)
    root.dataset.playShort = String(region.height < (playLayout(region) === 'wide' ? 550 : 640))
    root.dataset.playCompact = String(region.height < 400 && playLayout(region) === 'stack')
    root.dataset.playTiny = String(region.height < 300 && playLayout(region) === 'stack')
    for (const key of ['left', 'top', 'width', 'height'] as const) {
      const value = `${region[key]}px`
      if (root.style.getPropertyValue(`--play-${key}`) !== value) root.style.setProperty(`--play-${key}`, value)
    }
  }
  update()
  let pending = false
  const schedule = () => {
    if (pending) return
    pending = true
    requestAnimationFrame(() => { pending = false; update() })
  }
  window.addEventListener('resize', schedule)
  window.visualViewport?.addEventListener('resize', schedule)
  window.visualViewport?.addEventListener('scroll', schedule)
  for (const query of ['(horizontal-viewport-segments: 2)', '(vertical-viewport-segments: 2)']) {
    matchMedia(query).addEventListener('change', schedule)
  }
}
