import type { Fusion } from '../game/fusion.ts'
import { activeSkin } from './skins/index.ts'
import { reducedMotion } from './motion.ts'

/** Two energy ribbons converge at the destination; no whole-screen flash. */
export function drawFusion(
  ctx: CanvasRenderingContext2D, fusion: Fusion, progress: number,
  centre: (cell: number) => { x: number; y: number }, cellSize: number,
): void {
  const start = centre(fusion.a)
  const end = centre(fusion.b)
  const calm = reducedMotion()
  const t = calm ? 1 : 1 - (1 - progress) ** 3
  const colour = activeSkin().board.selectRing
  ctx.save()
  ctx.strokeStyle = colour
  ctx.lineCap = 'round'
  ctx.globalAlpha = 0.85
  for (const side of [-1, 1]) {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const x = start.x + dx * t
    const y = start.y + dy * t
    ctx.lineWidth = cellSize * 0.045
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.quadraticCurveTo((start.x + x) / 2 - dy * side * 0.35, (start.y + y) / 2 + dx * side * 0.35, x, y)
    ctx.stroke()
  }
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(end.x, end.y, cellSize * (calm ? 0.43 : 0.65 - t * 0.22), 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}
