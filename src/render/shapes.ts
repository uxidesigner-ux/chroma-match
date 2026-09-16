import type { Shape } from './skins/types.ts'

interface Pt {
  x: number
  y: number
}

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

function polygon(sides: number, r: number, rotation: number): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r })
  }
  return pts
}

/** Traces a polygon with rounded corners, centred on the current origin. */
function roundedPolyPath(ctx: CanvasRenderingContext2D, pts: Pt[], radius: number): void {
  const n = pts.length
  const last = pts[n - 1] as Pt
  const first = pts[0] as Pt
  const start = mid(last, first)
  ctx.moveTo(start.x, start.y)
  for (let i = 0; i < n; i++) {
    const cur = pts[i] as Pt
    const next = pts[(i + 1) % n] as Pt
    const m = mid(cur, next)
    ctx.arcTo(cur.x, cur.y, m.x, m.y, radius)
  }
  ctx.closePath()
}

/**
 * Builds the silhouette for a gem as a path centred on (0, 0) with radius `r`.
 * The caller owns the transform, so the same path is reused for fill, glow and
 * clipping.
 */
export function gemPath(ctx: CanvasRenderingContext2D, shape: Shape, r: number): void {
  ctx.beginPath()
  switch (shape) {
    case 'circle':
      ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2)
      break
    case 'triangle':
      // Nudged down so the visual centre of mass sits in the middle of the cell.
      ctx.translate(0, r * 0.12)
      roundedPolyPath(ctx, polygon(3, r * 1.08, -Math.PI / 2), r * 0.3)
      ctx.translate(0, -r * 0.12)
      break
    case 'square':
      roundedPolyPath(ctx, polygon(4, r * 1.06, Math.PI / 4), r * 0.34)
      break
    case 'diamond':
      roundedPolyPath(ctx, polygon(4, r * 1.12, -Math.PI / 2), r * 0.22)
      break
    case 'hexagon':
      roundedPolyPath(ctx, polygon(6, r * 1.0, -Math.PI / 2), r * 0.26)
      break
    case 'rosette': {
      // Sampled from a polar rosette rather than built from arcs: the petals
      // of a six-lobed curve intersect, and solving those intersections buys
      // nothing a dense enough polyline does not already give at gem size.
      const steps = 72
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2 - Math.PI / 2
        const rad = r * (0.84 + 0.24 * Math.cos(a * 6 + Math.PI / 2))
        const px = Math.cos(a) * rad
        const py = Math.sin(a) * rad
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      break
    }
    case 'flower': {
      const petals = 6
      for (let i = 0; i < petals; i++) {
        const a = (i / petals) * Math.PI * 2 - Math.PI / 2
        const cx = Math.cos(a) * r * 0.5
        const cy = Math.sin(a) * r * 0.5
        ctx.moveTo(cx + r * 0.46, cy)
        ctx.arc(cx, cy, r * 0.46, 0, Math.PI * 2)
      }
      ctx.moveTo(r * 0.44, 0)
      ctx.arc(0, 0, r * 0.44, 0, Math.PI * 2)
      break
    }
  }
}
