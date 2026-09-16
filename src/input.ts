import type { Game } from './game/game.ts'
import type { Renderer } from './render/renderer.ts'

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
): void {
  let startCell: number | null = null
  let startX = 0
  let startY = 0
  let dragged = false

  const localPoint = (e: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  canvas.addEventListener('pointerdown', (e) => {
    onFirstInput()
    const { x, y } = localPoint(e)
    startCell = renderer.cellAtPoint(x, y)
    startX = x
    startY = y
    dragged = false
    if (startCell !== null) {
      canvas.setPointerCapture(e.pointerId)
      // Light the gem up on contact rather than waiting for the release.
      game.press(startCell)
    }
  })

  canvas.addEventListener('pointermove', (e) => {
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
    game.cancelPress()
    if (startCell !== null && !dragged) {
      const { x, y } = localPoint(e)
      const cell = renderer.cellAtPoint(x, y)
      if (cell !== null) game.tap(cell)
    }
    startCell = null
    dragged = false
  }

  canvas.addEventListener('pointerup', end)
  canvas.addEventListener('pointercancel', () => {
    game.cancelPress()
    startCell = null
    dragged = false
  })

  // Stop the browser from treating a drag on the board as a page scroll.
  canvas.style.touchAction = 'none'
}
