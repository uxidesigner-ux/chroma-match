import type { Game } from './game/game.ts'
import type { Renderer } from './render/renderer.ts'
import { t } from './i18n/index.ts'
import { gemName } from './i18n/gems.ts'

const POWER_LABELS = {
  none: 'boardNormal', rowClear: 'boardRow', colClear: 'boardColumn',
  bomb: 'boardBomb', rainbow: 'boardPrism',
} as const

/**
 * Pointer handling for the board. A tap selects; a short drag toward a
 * neighbouring cell swaps directly, which is how players expect a match-3 to
 * behave on a touchscreen.
 */
export function attachInput(
  canvas: HTMLCanvasElement,
  game: Game,
  renderer: Renderer,
  onFirstInput: () => void,
  /**
   * What an armed item does with a tapped cell. Returning true means the tap
   * was spent on the item, so the board must not also treat it as a selection —
   * arming is a mode, and a tap belongs to one handler or the other.
   */
  onAim: (cell: number) => boolean = () => false,
): void {
  let startCell: number | null = null
  let startX = 0
  let startY = 0
  let dragged = false
  let activePointer: number | null = null
  let pointerRect: DOMRect | null = null
  let keyboardCell = 0
  const status = document.getElementById('board-status')
  const announce = () => {
    const gem = game.grid[keyboardCell]
    if (!status || !gem) return
    status.textContent = t('boardCell', {
      row: game.geom.rowOf(keyboardCell) + 1,
      col: game.geom.colOf(keyboardCell) + 1,
      gem: gemName(gem.kind),
      power: t(POWER_LABELS[gem.power]),
    }) + (game.selected === keyboardCell ? ` ${t('boardSelected')}` : '')
  }
  canvas.addEventListener('focus', () => {
    game.press(keyboardCell)
    announce()
  })
  canvas.addEventListener('blur', () => game.cancelPress())
  canvas.addEventListener('keydown', event => {
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    }
    if (!(event.key in step) && !['Enter', ' ', 'Escape'].includes(event.key)) return
    event.preventDefault()
    if (game.busy || event.repeat && (event.key === 'Enter' || event.key === ' ')) return
    if (event.key === 'Escape') {
      game.selected = null
      game.cancelPress()
    } else if (event.key === 'Enter' || event.key === ' ') {
      onFirstInput()
      game.cancelPress()
      if (!onAim(keyboardCell)) game.tap(keyboardCell)
    } else {
      const [dx, dy] = step[event.key]!
      const c = Math.max(0, Math.min(game.geom.cols - 1, game.geom.colOf(keyboardCell) + dx))
      const r = Math.max(0, Math.min(game.geom.rows - 1, game.geom.rowOf(keyboardCell) + dy))
      keyboardCell = game.geom.idx(c, r)
      game.press(keyboardCell)
    }
    announce()
  })

  const localPoint = (e: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const layoutShifted = () => {
    if (!pointerRect) return false
    const rect = canvas.getBoundingClientRect()
    return rect.left !== pointerRect.left || rect.top !== pointerRect.top ||
      rect.width !== pointerRect.width || rect.height !== pointerRect.height
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
    activePointer = e.pointerId
    pointerRect = canvas.getBoundingClientRect()
    onFirstInput()
    const { x, y } = localPoint(e)
    startCell = renderer.cellAtPoint(x, y)
    if (startCell !== null) keyboardCell = startCell
    startX = x
    startY = y
    dragged = false
    if (startCell !== null && onAim(startCell)) {
      // Fired on contact rather than on release: an item is aimed, not dragged,
      // and waiting for the release would make the most decisive action in the
      // game the slowest one.
      startCell = null
      return
    }
    if (startCell !== null) {
      canvas.setPointerCapture(e.pointerId)
      // Light the gem up on contact rather than waiting for the release.
      game.press(startCell)
    }
  })

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointer) return
    if (layoutShifted()) {
      cancel()
      return
    }
    if (startCell === null || dragged) return
    const { x, y } = localPoint(e)
    const dx = x - startX
    const dy = y - startY
    const threshold = renderer.cellSize * 0.35
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return

    // Snap the gesture to whichever axis the player committed to.
    const target =
      Math.abs(dx) > Math.abs(dy)
        ? renderer.cellAtPoint(startX + Math.sign(dx) * renderer.cellSize, startY)
        : renderer.cellAtPoint(startX, startY + Math.sign(dy) * renderer.cellSize)
    // Dragging off the edge of the board drops the gem instead of swapping it.
    if (target !== null) game.drag(startCell, target)
    else game.cancelPress()
    dragged = true
  })

  const end = (e: PointerEvent) => {
    if (e.pointerId !== activePointer) return
    if (layoutShifted()) {
      cancel()
      return
    }
    game.cancelPress()
    if (startCell !== null && !dragged) {
      const { x, y } = localPoint(e)
      const cell = renderer.cellAtPoint(x, y)
      if (cell !== null) game.tap(cell)
    }
    startCell = null
    dragged = false
    activePointer = null
    pointerRect = null
  }

  canvas.addEventListener('pointerup', end)
  const cancel = () => {
    game.cancelPress()
    startCell = null
    dragged = false
    if (activePointer !== null && canvas.hasPointerCapture(activePointer)) {
      canvas.releasePointerCapture(activePointer)
    }
    activePointer = null
    pointerRect = null
  }
  canvas.addEventListener('pointercancel', cancel)
  canvas.addEventListener('lostpointercapture', cancel)
  // A finger's starting coordinates belong to the old layout. Never turn a
  // resize/fold into a swap, nor clear the player's existing tap selection.
  new ResizeObserver(cancel).observe(canvas)
  window.addEventListener('resize', cancel)
  window.visualViewport?.addEventListener('resize', cancel)

  // Stop the browser from treating a drag on the board as a page scroll.
  canvas.style.touchAction = 'none'
}
