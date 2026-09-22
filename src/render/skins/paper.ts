import { gemPath } from '../shapes.ts'
import type { GemStyle, Skin } from './types.ts'

/** The ink everything on this board is drawn with. */
const INK = '#241E16'

/**
 * Shapes cut from coloured paper and laid on a sheet.
 *
 * This is the first light skin, and the first one with no lighting model at
 * all: no gradient on a gem body, no glow, no blur anywhere. What sells paper
 * instead is construction —
 *
 *   - Two sheets per gem. A darker sheet sits under the main one, offset down
 *     and right by a fixed amount, so every gem reads as a cut-out lying on the
 *     board rather than a shape drawn onto it.
 *   - A hard shadow, not a soft one. Offset, no blur, no fade: the giveaway of
 *     a real cut edge is that its shadow has an edge too.
 *   - A heavy ink outline, drawn last, at a weight that holds at small sizes.
 *
 * A gem here is three fills and one stroke, which makes this the cheapest skin
 * to draw of the three — there is not a single gradient on the board.
 */
const PALETTE: readonly GemStyle[] = [
  // Poster colours: flat fills on a cream sheet, so they have to carry the
  // whole separation themselves without a highlight to lift them.
  { name: 'Tomato', shape: 'circle', base: '#E8453C', light: '#F79B94', dark: '#96201C' },
  { name: 'Marigold', shape: 'triangle', base: '#F2A81C', light: '#FAD383', dark: '#9A6403' },
  { name: 'Fern', shape: 'square', base: '#2FA36B', light: '#8FD9B4', dark: '#14633D' },
  { name: 'Cobalt', shape: 'diamond', base: '#2D6BE4', light: '#96B6F5', dark: '#153C8C' },
  { name: 'Fuchsia', shape: 'rosette', base: '#C43E9E', light: '#E99AD1', dark: '#7A1A5F' },
  // Sits out at five colours, as in every other skin.
  { name: 'Plum', shape: 'hexagon', base: '#6B4BC9', light: '#B5A2EB', dark: '#3D2578' },
]

export const PAPER: Skin = {
  id: 'paper',
  name: 'Paper',
  palette: PALETTE,

  board: {
    // A sheet of a slightly different stock, with a drawn border rather than a
    // glow. The wells are creases pressed into it.
    boardFill: 'rgba(255, 252, 244, 0.9)',
    boardStroke: 'rgba(36, 30, 22, 0.9)',
    cellFill: 'rgba(36, 30, 22, 0.05)',
    cellStroke: 'rgba(36, 30, 22, 0.08)',
    lineWidth: 2,
    selectRing: INK,
    hintRing: 'rgba(36, 30, 22, 0.45)',
    // White would vanish into the sheet; the clearing ring is inked like
    // everything else here.
    flash: INK,
    mark: '#FFF7E6',
    textHalo: 'rgba(255, 252, 244, 0.9)',
    luminance: 'light',
  },

  css: {
    bg: '#f2ecde',
    // Paper stock is not one flat colour, but on a light skin these have to
    // stay nearly invisible or they read as a stain rather than as texture.
    'bg-glow': 'rgba(255, 252, 244, 0.85)',
    'bg-glow-2': 'rgba(232, 69, 60, 0.07)',
    panel: '#fffcf4',
    'panel-strong': '#f7eeda',
    'panel-blur': 'none',
    // The signature of the concept: an offset with no blur, so a panel is a
    // sheet sitting on the page.
    'panel-shadow': '4px 4px 0 #241e16',
    line: '#241e16',
    text: '#241e16',
    muted: '#7a6a55',
    accent: '#e8453c',
    'accent-2': '#f2a81c',
    'on-accent': '#241e16',
    'radius-sm': '8px',
    radius: '14px',
    'radius-lg': '18px',
  },

  paintBody(ctx, p) {
    const { r, style } = p
    ctx.save()

    // The cast shadow: the silhouette again, in ink, offset and hard-edged.
    ctx.globalAlpha = p.alpha * 0.22
    ctx.translate(r * 0.16, r * 0.2)
    gemPath(ctx, style.shape, r)
    ctx.fillStyle = INK
    ctx.fill()
    ctx.restore()

    // The under sheet, peeking out along the bottom-right.
    ctx.save()
    ctx.translate(r * 0.09, r * 0.11)
    gemPath(ctx, style.shape, r)
    ctx.fillStyle = style.dark
    ctx.fill()
    ctx.restore()

    // The sheet itself. Flat, on purpose: a gradient here would undo the
    // whole idea in one line. A prism is cut into wedges over the top of it by
    // the interior pass, so it starts from the same flat fill.
    gemPath(ctx, style.shape, r)
    ctx.fillStyle = style.base
    ctx.fill()
  },

  paintInterior(ctx, p) {
    const { r, style, alpha } = p

    if (p.rainbow) {
      // A prism is the one gem that cannot be one colour. Rather than a
      // gradient, it is torn into wedges — each kind gets a slice, cut with
      // straight edges the way a paper fan would be.
      const slices = p.palette.length
      for (let i = 0; i < slices; i++) {
        const a0 = (i / slices) * Math.PI * 2 - Math.PI / 2 + p.time * 0.5
        const a1 = ((i + 1) / slices) * Math.PI * 2 - Math.PI / 2 + p.time * 0.5
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(Math.cos(a0) * r * 1.5, Math.sin(a0) * r * 1.5)
        ctx.lineTo(Math.cos(a1) * r * 1.5, Math.sin(a1) * r * 1.5)
        ctx.closePath()
        ctx.fillStyle = p.palette[i]?.base ?? style.base
        ctx.fill()
      }
      return
    }

    // A second, lighter piece laid over the top-left — the layered look of
    // construction paper, and the only tonal variation a gem gets. Its edge is
    // a straight cut rather than a gradient, which is the whole point.
    ctx.save()
    ctx.globalAlpha = alpha * 0.55
    ctx.beginPath()
    ctx.moveTo(-r * 1.4, -r * 1.4)
    ctx.lineTo(r * 1.4, -r * 1.4)
    ctx.lineTo(-r * 1.4, r * 1.4)
    ctx.closePath()
    ctx.fillStyle = style.light
    ctx.fill()
    ctx.restore()
  },

  paintEdge(ctx, p) {
    const { r, style } = p
    gemPath(ctx, style.shape, r)
    // Heavy, and floored well above a hairline: this outline is what holds the
    // gems apart on a board with no shading to do it.
    ctx.lineWidth = Math.max(1.5, r * 0.11)
    ctx.lineJoin = 'round'
    ctx.strokeStyle = INK
    ctx.stroke()
  },
}
