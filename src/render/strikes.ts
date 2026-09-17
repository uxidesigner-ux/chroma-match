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
 * Fast out of the barrel, easing as it reaches the far wall.
 *
 * Cubic rather than anything steeper: the phase is 150ms, which is nine frames,
 * and a quintic curve spent the first of them already 44% of the way down the
 * row. The travel has to be visible across several frames or the beam reads as
 * appearing at full length rather than being fired.
 */
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)

/**
 * The shot leaving the gun.
 *
 * A power gem used to take its row on the same frame it went off, which reads
 * as the board losing a row rather than as the player firing something. These
 * are drawn during a short phase before anything is removed, while the gems are
 * all still there to be crossed — the payoff only lands if the wind-up happens
 * against the thing that is about to go.
 *
 * Every shape is built the same way: a wide soft pass in the gem's own colour,
 * a hard bright core over it, and a head at the leading edge. The colour is the
 * gem's so the board says which gem fired; the core is the skin's, so it reads
 * on a cream sheet as well as on black.
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
  const reach = easeOutCubic(t)
  // Everything fades out over the last third rather than vanishing on the frame
  // the gems go: the beam should still be on screen as they start to pop.
  const alpha = t < 0.66 ? 1 : 1 - (t - 0.66) / 0.34

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.lineCap = 'round'

  for (const blast of blasts) {
    const col = geom.colOf(blast.cell)
    const row = geom.rowOf(blast.cell)
    const cx = layout.x + (col + 0.5) * layout.cell
    const cy = layout.y + (row + 0.5) * layout.cell
    const tint = styleOf(blast.cell)?.base ?? board.flash

    if (blast.kind === 'row' || blast.kind === 'col') {
      beam(ctx, blast.kind === 'row', cx, cy, reach, layout, board, tint)
    } else if (blast.kind === 'square') {
      // A bomb's reach is its 3x3, so the ring stops at the corner of it.
      ring(ctx, cx, cy, reach * layout.cell * 1.9, layout.cell * 0.2, reach, board, tint)
    } else if (blast.kind === 'colour') {
      // A prism reaches the whole board, so its ring keeps going until it has.
      const far = Math.hypot(layout.w, layout.h)
      ring(ctx, cx, cy, reach * far * 0.6, layout.cell * 0.18, reach, board, tint)
      ring(ctx, cx, cy, reach * far * 0.42, layout.cell * 0.1, reach * 0.8, board, tint)
    } else {
      // A hammer: no travel, just the impact. Anything that flew would be
      // claiming a reach it does not have.
      ring(ctx, cx, cy, reach * layout.cell * 0.62, layout.cell * 0.14, reach, board, tint)
    }
  }

  ctx.restore()
}

/** A line fired both ways out of one cell, to the edges of the board. */
function beam(
  ctx: CanvasRenderingContext2D,
  horizontal: boolean,
  cx: number,
  cy: number,
  reach: number,
  layout: Layout,
  board: BoardStyle,
  tint: string,
): void {
  // Measured to the far wall rather than to the last gem: a shot that stops a
  // gem short of the edge looks like it ran out of power.
  const back = horizontal ? cx - layout.x : cy - layout.y
  const forward = horizontal ? layout.x + layout.w - cx : layout.y + layout.h - cy
  const a = reach * back
  const b = reach * forward

  const from = horizontal ? [cx - a, cy] : [cx, cy - a]
  const to = horizontal ? [cx + b, cy] : [cx, cy + b]

  const line = (width: number, colour: string) => {
    ctx.beginPath()
    ctx.moveTo(from[0] as number, from[1] as number)
    ctx.lineTo(to[0] as number, to[1] as number)
    ctx.lineWidth = width
    ctx.strokeStyle = colour
    ctx.stroke()
  }

  // Three passes, each thinner and brighter than the last. The first attempt
  // used one wide stroke at half opacity and read as a painted bar lying across
  // the row — a beam is a thin bright line with light spilling off it, and it
  // is the ratio between those two that says "beam" rather than either alone.
  ctx.save()
  ctx.globalAlpha *= 0.22
  line(layout.cell * 0.46, tint)
  ctx.globalAlpha /= 0.22
  ctx.globalAlpha *= 0.5
  line(layout.cell * 0.2, tint)
  ctx.restore()

  line(Math.max(1.5, layout.cell * 0.075), board.flash)

  // The heads, which is what makes it read as travelling rather than growing.
  head(ctx, from[0] as number, from[1] as number, layout.cell * 0.13, board, tint)
  head(ctx, to[0] as number, to[1] as number, layout.cell * 0.13, board, tint)
}

function head(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  board: BoardStyle,
  tint: string,
): void {
  ctx.save()
  ctx.globalAlpha *= 0.55
  ctx.beginPath()
  ctx.arc(x, y, r * 1.8, 0, Math.PI * 2)
  ctx.fillStyle = tint
  ctx.fill()
  ctx.restore()

  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = board.flash
  ctx.fill()
}

/**
 * An expanding shell.
 *
 * It loses strength as it grows, which is the difference between a shockwave
 * and a circle being drawn: a ring that stays as bright at the far wall as it
 * was at the muzzle reads as a diagram of the blast rather than the blast.
 */
function ring(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  width: number,
  spent: number,
  board: BoardStyle,
  tint: string,
): void {
  if (radius <= 0.5) return
  ctx.save()
  ctx.globalAlpha *= Math.max(0, 1 - spent * 0.55)
  const inner = ctx.globalAlpha
  ctx.globalAlpha *= 0.3
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.lineWidth = width * 2.4
  ctx.strokeStyle = tint
  ctx.stroke()

  ctx.globalAlpha = inner
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.lineWidth = Math.max(1.2, width * 0.5)
  ctx.strokeStyle = board.flash
  ctx.stroke()
  ctx.restore()
}
