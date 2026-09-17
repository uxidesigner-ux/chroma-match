import type { Blast } from '../game/board.ts'
import type { Geom } from '../game/types.ts'
import type { BoardStyle, GemStyle } from './skins/types.ts'

interface Layout {
  x: number
  y: number
  cell: number
  w: number
  h: number
}

/**
 * Fast out of the barrel, easing as it arrives.
 *
 * Cubic rather than anything steeper: the phase is 150ms, which is nine frames,
 * and a quintic curve spent the first of them already 44% of the way there. The
 * travel has to be visible across several frames or the bolt reads as appearing
 * at full length rather than being fired.
 */
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)

/**
 * The shot leaving the gun.
 *
 * A power gem used to take its row on the same frame it went off, which reads
 * as the board losing a row rather than as the player firing something. These
 * are drawn during a short phase before anything is removed, while the gems are
 * all still there to be hit — the payoff only lands if the wind-up happens
 * against the thing that is about to go.
 *
 * Every blast fires at the cells it is actually going to take, one bolt each,
 * all at once. An earlier version drew an expanding ring for anything that was
 * not a line, which was a picture of a blast rather than the blast: it swept
 * over gems that were not going anywhere and said nothing about which ones
 * were. A bolt per target cannot be wrong about that, because the rules hand
 * over the same list they are about to clear.
 *
 * The bolts are thick on purpose. A hairline is a laser pointer; what this
 * wants is mass — a wide soft field, a heavy body in the gem's own colour, and
 * a hot core down the middle.
 */
export function drawStrikes(
  ctx: CanvasRenderingContext2D,
  blasts: readonly Blast[],
  progress: number,
  geom: Geom,
  layout: Layout,
  board: BoardStyle,
  styleOf: (cell: number) => GemStyle | null,
): void {
  if (blasts.length === 0) return
  const t = Math.min(1, Math.max(0, progress))
  // Everything fades over the last third rather than vanishing on the frame the
  // gems go: the bolts should still be lit as they start to pop.
  const alpha = t < 0.66 ? 1 : 1 - (t - 0.66) / 0.34

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.lineCap = 'round'

  for (const blast of blasts) {
    const cx = centreX(geom, layout, blast.cell)
    const cy = centreY(geom, layout, blast.cell)
    const tint = styleOf(blast.cell)?.base ?? board.flash

    // One speed for the whole blast, so near cells are hit first and far ones a
    // moment later. That stagger is what separates a volley from a starburst.
    let furthest = 0
    for (const target of blast.targets) {
      furthest = Math.max(
        furthest,
        Math.hypot(centreX(geom, layout, target) - cx, centreY(geom, layout, target) - cy),
      )
    }
    const front = easeOutCubic(t) * Math.max(furthest, layout.cell * 0.5)

    for (const target of blast.targets) {
      const tx = centreX(geom, layout, target)
      const ty = centreY(geom, layout, target)
      const distance = Math.hypot(tx - cx, ty - cy)
      if (distance < 0.5) continue
      const travelled = Math.min(distance, front)
      const k = travelled / distance
      bolt(ctx, cx, cy, cx + (tx - cx) * k, cy + (ty - cy) * k, layout.cell, board, tint)
      // The moment it arrives, not a frame later: the flare is the hit.
      if (travelled >= distance) flare(ctx, tx, ty, layout.cell * 0.34, board, tint)
    }

    // The muzzle, which is also the whole of a hammer's effect — it has no
    // reach, and anything that flew would be claiming one it does not have.
    flare(ctx, cx, cy, layout.cell * (blast.kind === 'point' ? 0.42 : 0.3), board, tint)
  }

  ctx.restore()
}

const centreX = (geom: Geom, layout: Layout, cell: number): number =>
  layout.x + (geom.colOf(cell) + 0.5) * layout.cell
const centreY = (geom: Geom, layout: Layout, cell: number): number =>
  layout.y + (geom.rowOf(cell) + 0.5) * layout.cell

/**
 * One plasma bolt: a soft field, a heavy body, a hot core.
 *
 * Three passes rather than one stroke, because the mass comes from the
 * relationship between them. A single wide stroke at any opacity is a painted
 * bar; a single thin one is a laser pointer.
 */
function bolt(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cell: number,
  board: BoardStyle,
  tint: string,
): void {
  const line = (width: number, colour: string, opacity: number) => {
    ctx.save()
    ctx.globalAlpha *= opacity
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.lineWidth = width
    ctx.strokeStyle = colour
    ctx.stroke()
    ctx.restore()
  }

  line(cell * 0.74, tint, 0.16)
  line(cell * 0.44, tint, 0.55)
  line(cell * 0.18, board.flash, 0.95)
}

/** A hit, or a muzzle. Same shape either end of the bolt. */
function flare(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  board: BoardStyle,
  tint: string,
): void {
  ctx.save()
  ctx.globalAlpha *= 0.4
  ctx.beginPath()
  ctx.arc(x, y, r * 1.6, 0, Math.PI * 2)
  ctx.fillStyle = tint
  ctx.fill()
  ctx.restore()

  ctx.beginPath()
  ctx.arc(x, y, r * 0.62, 0, Math.PI * 2)
  ctx.fillStyle = board.flash
  ctx.fill()
}
