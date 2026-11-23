import { gemPath } from '../shapes.ts'
import type { GemPaint, GemStyle, Skin } from './types.ts'

const PALETTE: readonly GemStyle[] = [
  { name: 'Ruby', shape: 'tablet', base: '#EF1538', light: '#FF7581', dark: '#9E0025' },
  { name: 'Crown', shape: 'crown', base: '#FFD51B', light: '#FFF599', dark: '#D77A00' },
  { name: 'Leaf', shape: 'leaf', base: '#52D527', light: '#B0FA70', dark: '#218E0C' },
  { name: 'Shield', shape: 'shield', base: '#168DFF', light: '#7AD9FF', dark: '#0650C3' },
  { name: 'Bloom', shape: 'rosette', base: '#C04CFA', light: '#F0ACFF', dark: '#7715B3' },
  { name: 'Crystal', shape: 'diamond', base: '#24DCD8', light: '#AEFFEE', dark: '#008B9F' },
]

/** Rounded toy-like enamel, with a deep cast edge and a bright upper bevel. */
export const ROYAL: Skin = {
  id: 'royal', name: 'Royal', palette: PALETTE,
  board: {
    boardFill: '#768DC7', boardStroke: '#FFD66B', cellFill: '#A6B9E9',
    cellStroke: null, lineWidth: 2.5, selectRing: '#FFF9CB', hintRing: '#FFF4A0',
    flash: '#FFF7BD', mark: '#FFF8CF', textHalo: '#303867', luminance: 'light',
  },
  css: {
    bg: '#123d79', 'bg-glow': '#2a83bf', 'bg-glow-2': '#164a91',
    panel: '#1d5597', 'panel-strong': '#236db2', 'panel-blur': 'none',
    'panel-shadow': '0 4px 0 #0a2e66, inset 0 2px 0 #70bded',
    line: '#efbd4e', text: '#fff8d5', muted: '#cee5ff', accent: '#ffdc62',
    'accent-2': '#70db3a', 'on-accent': '#273b64',
    'radius-sm': '10px', radius: '16px', 'radius-lg': '24px',
  },
  paintBody(ctx, p) {
    const { r, style } = p
    ctx.save()
    ctx.shadowColor = '#253a6e80'; ctx.shadowBlur = r * .10; ctx.shadowOffsetY = r * .19
    ctx.translate(0, r * .12)
    gemPath(ctx, style.shape, r); ctx.fillStyle = style.dark; ctx.fill()
    ctx.translate(0, -r * .12)
    const fill = ctx.createLinearGradient(-r * .4, -r, r * .3, r)
    fill.addColorStop(0, style.light); fill.addColorStop(.24, style.base)
    fill.addColorStop(.68, style.base); fill.addColorStop(1, style.dark)
    gemPath(ctx, style.shape, r); ctx.fillStyle = p.rainbow ? rainbow(ctx, p) : fill; ctx.fill()
    ctx.restore()
  },
  paintInterior(ctx, p) {
    const { r, style } = p
    ctx.save()
    // Broad reflection follows the rounded top rather than reading as a flat white spot.
    const gleam = ctx.createLinearGradient(0, -r, 0, r * .1)
    gleam.addColorStop(0, '#ffffffbb'); gleam.addColorStop(.45, '#ffffff30'); gleam.addColorStop(1, '#ffffff00')
    ctx.fillStyle = gleam
    ctx.beginPath(); ctx.ellipse(-r * .12, -r * .65, r * .87, r * .47, -.12, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = style.dark; ctx.lineWidth = r * .085; ctx.lineCap = 'round'
    if (style.shape === 'leaf') {
      ctx.beginPath(); ctx.moveTo(0, r * .63); ctx.quadraticCurveTo(r * .09, 0, 0, -r * .41); ctx.stroke()
      ctx.strokeStyle = style.light; ctx.lineWidth = r * .055
      ctx.beginPath(); ctx.moveTo(-r * .12, r * .12); ctx.quadraticCurveTo(-r * .30, -.15 * r, -r * .25, -.44 * r); ctx.stroke()
    } else if (style.shape === 'crown') {
      ctx.strokeStyle = '#FFEF76'; ctx.lineWidth = r * .15
      ctx.beginPath(); ctx.moveTo(-r * .58, r * .46); ctx.quadraticCurveTo(0, r * .65, r * .58, r * .46); ctx.stroke()
    }
    ctx.restore()
  },
  paintEdge(ctx, p) {
    const { r, style } = p
    ctx.save()
    gemPath(ctx, style.shape, r); ctx.strokeStyle = style.dark; ctx.lineWidth = r * .075; ctx.stroke()
    const bevel = ctx.createLinearGradient(-r, -r, r * .2, r)
    bevel.addColorStop(0, '#ffffffdb'); bevel.addColorStop(.38, style.light)
    bevel.addColorStop(.63, style.base); bevel.addColorStop(1, style.dark)
    gemPath(ctx, style.shape, r * .82); ctx.lineWidth = r * .095; ctx.strokeStyle = bevel; ctx.stroke()
    ctx.restore()
  },
}

function rainbow(ctx: CanvasRenderingContext2D, p: GemPaint): CanvasGradient {
  const fill = ctx.createConicGradient(p.time * .5, 0, 0)
  p.palette.forEach((style, i) => fill.addColorStop(i / p.palette.length, style.base))
  fill.addColorStop(1, PALETTE[0]!.base)
  return fill
}
