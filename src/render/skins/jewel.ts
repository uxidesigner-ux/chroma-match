import { gemPath } from '../shapes.ts'
import type { GemPaint, GemStyle, Skin } from './types.ts'

/**
 * The original look: cut stones on a dark plate.
 *
 * Nothing here is new — it is the finish the renderer used to carry inline,
 * moved out so it is one skin among others rather than the only thing the
 * renderer knows how to draw.
 */
const PALETTE: readonly GemStyle[] = [
  { name: 'Ruby', shape: 'circle', base: '#FF4D6D', light: '#FF9BB0', dark: '#B01235' },
  { name: 'Amber', shape: 'triangle', base: '#FFB020', light: '#FFD782', dark: '#B06800' },
  { name: 'Mint', shape: 'square', base: '#34D399', light: '#8DF3C8', dark: '#0B7D57' },
  { name: 'Azure', shape: 'diamond', base: '#38BDF8', light: '#9BDFFF', dark: '#0B6E9E' },
  { name: 'Orchid', shape: 'rosette', base: '#E879F9', light: '#F7BEFF', dark: '#96189F' },
  // Sixth and last: with five colours in play this one sits out, because a
  // second blue next to Azure is the hardest pair to tell apart at a glance.
  { name: 'Indigo', shape: 'hexagon', base: '#818CF8', light: '#C2C8FF', dark: '#3B34B8' },
]

export const JEWEL: Skin = {
  id: 'jewel',
  name: 'Jewel',
  palette: PALETTE,

  board: {
    boardFill: '#172844',
    boardStroke: '#526d99',
    cellFill: '#102039',
    cellStroke: '#253d5c',
    lineWidth: 1,
    selectRing: 'rgba(255, 255, 255, 0.92)',
    hintRing: 'rgba(255, 255, 255, 0.42)',
    flash: '#FFFFFF',
    mark: '#FFFFFF',
    textHalo: 'rgba(6, 8, 18, 0.65)',
    luminance: 'dark',
  },

  css: {
    bg: '#080b14',
    'bg-glow': '#1a2145',
    // One glow is the whole background here; the second layer stays off rather
    // than being left at whatever the last skin set.
    'bg-glow-2': 'transparent',
    panel: 'rgba(255, 255, 255, 0.045)',
    'panel-strong': 'rgba(255, 255, 255, 0.08)',
    'panel-blur': 'none',
    'panel-shadow': 'none',
    line: 'rgba(255, 255, 255, 0.1)',
    text: '#eef1ff',
    muted: '#838cb4',
    accent: '#8b8bff',
    'accent-2': '#38bdf8',
    'on-accent': '#080b14',
    'radius-sm': '10px',
    radius: '16px',
    'radius-lg': '20px',
  },

  paintBody(ctx, p) {
    const { r, style } = p
    ctx.save()
    // Lifted off the board with a soft shadow.
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
    ctx.shadowBlur = r * 0.16
    ctx.shadowOffsetY = r * 0.2
    ctx.translate(0, r * .14)
    gemPath(ctx, style.shape, r)
    ctx.fillStyle = style.dark; ctx.fill()
    ctx.translate(0, -r * .14)
    gemPath(ctx, style.shape, r)
    ctx.fillStyle = p.rainbow ? prism(ctx, p) : body(ctx, p)
    ctx.fill()
    ctx.restore()
  },

  paintInterior(ctx, p) {
    const { r, alpha } = p
    ctx.globalAlpha = alpha * 0.52
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath()
    ctx.ellipse(-r * 0.3, -r * 0.42, r * 0.42, r * 0.24, -0.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = alpha
  },

  paintEdge(ctx, p) {
    const { r, style } = p
    gemPath(ctx, style.shape, r)
    ctx.lineWidth = Math.max(2, r * .12); ctx.strokeStyle = style.dark; ctx.stroke()
    gemPath(ctx, style.shape, r * .85)
    const lip = ctx.createLinearGradient(0, -r, 0, r)
    lip.addColorStop(0, '#ffffffcc'); lip.addColorStop(.4, style.light); lip.addColorStop(1, style.dark)
    ctx.lineWidth = Math.max(1.5, r * .1); ctx.strokeStyle = lip; ctx.stroke()
  },
}

function body(ctx: CanvasRenderingContext2D, p: GemPaint): CanvasGradient {
  const { r, style } = p
  const g = ctx.createLinearGradient(-r, -r, r * 0.6, r)
  g.addColorStop(0, style.light)
  g.addColorStop(0.52, style.base)
  g.addColorStop(1, style.dark)
  return g
}

/** A prism carries every colour at once, turning slowly. */
function prism(ctx: CanvasRenderingContext2D, p: GemPaint): CanvasGradient {
  const cg = ctx.createConicGradient(p.time * 1.2, 0, 0)
  p.palette.forEach((s, i) => cg.addColorStop(i / p.palette.length, s.base))
  cg.addColorStop(1, p.palette[0]?.base ?? p.style.base)
  return cg
}
