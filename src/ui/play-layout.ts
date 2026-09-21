/** Layout only: resizing must never change a run's geometry or random stream. */
export interface PlayRect { left: number; top: number; width: number; height: number }

export function playRegion(width: number, height: number, segments: readonly PlayRect[] = []): PlayRect {
  const full = { left: 0, top: 0, width, height }
  const valid = segments.filter(s => [s.left, s.top, s.width, s.height].every(Number.isFinite)
    && s.left >= 0 && s.top >= 0 && s.width > 0 && s.height > 0
    && s.left + s.width <= width + 1 && s.top + s.height <= height + 1)
  // A continuous flexible panel can use the full viewport. Reserve one pane
  // only when the browser actually reports a gap between the segments.
  const gap = valid.some((a, i) => valid.slice(i + 1).some(b =>
    a.left + a.width < b.left || b.left + b.width < a.left
    || a.top + a.height < b.top || b.top + b.height < a.top))
  if (valid.length < 2 || !gap) return full
  return [...valid].sort((a, b) => b.width * b.height - a.width * a.height
    || a.top - b.top || a.left - b.left)[0]!
}

export function playLayout(rect: PlayRect): 'stack' | 'wide' {
  // The HUD needs ~300px for three readable equal regions, besides the board.
  return rect.width >= 700 && rect.width / rect.height >= 0.95 ? 'wide' : 'stack'
}

export function attachPlayLayout(): void {
  const root = document.documentElement
  const update = () => {
    const segmented = window as Window & {
      viewport?: { segments?: readonly PlayRect[] }
    }
    const region = playRegion(innerWidth, innerHeight, segmented.viewport?.segments)
    root.dataset.playLayout = playLayout(region)
    for (const key of ['left', 'top', 'width', 'height'] as const) {
      root.style.setProperty(`--play-${key}`, `${region[key]}px`)
    }
  }
  update()
  window.addEventListener('resize', update)
  window.visualViewport?.addEventListener('resize', update)
  for (const query of ['(horizontal-viewport-segments: 2)', '(vertical-viewport-segments: 2)']) {
    matchMedia(query).addEventListener('change', update)
  }
}
