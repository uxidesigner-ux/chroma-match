import { gemPath } from '../shapes.ts'
import type { GemPaint, GemStyle, Skin } from './types.ts'

/**
 * Panes of coloured glass resting above the board.
 *
 * The risk with a glass concept is that it lands as the jewel skin with the
 * gloss turned up, so the things that actually separate the two are the ones
 * done properly here:
 *
 *   - The body is translucent. The well behind a gem shows through it, which
 *     the opaque jewel body never allows, and it is what makes the board read
 *     as layers rather than as stickers.
 *   - The shadow is tinted by the gem's own colour and thrown further, so the
 *     gem reads as floating above the plate rather than embedded in it.
 *   - The light source is in the scene, not on the object: one broad reflection
 *     across the top-left, a caustic pooling at the bottom where the light
 *     leaves the glass, and an inner wall that gives the pane thickness.
 *
 * Everything is gradients and strokes. Canvas filters and per-frame blurs would
 * buy a little more realism for a frame budget a phone does not have.
 */
const PALETTE: readonly GemStyle[] = [
  // Brighter and more saturated than the jewel palette on purpose: a
  // translucent body loses contrast against the background, so the colours have
  // to start further ahead to stay as separable as the opaque ones.
  { name: 'Coral', shape: 'circle', base: '#FF6B8A', light: '#FFC2D0', dark: '#C11D46' },
  { name: 'Solar', shape: 'triangle', base: '#FFC24D', light: '#FFE3A8', dark: '#C27A00' },
  { name: 'Jade', shape: 'square', base: '#4BE0AF', light: '#B4FFE2', dark: '#12916A' },
  { name: 'Lagoon', shape: 'diamond', base: '#57CDFF', light: '#C3ECFF', dark: '#0F7FB8' },
  { name: 'Bloom', shape: 'flower', base: '#F08CFF', light: '#FBD2FF', dark: '#A62BB8' },
  // Sits out at five colours, for the same reason as in the jewel palette.
  { name: 'Iris', shape: 'hexagon', base: '#93A1FF', light: '#D2D8FF', dark: '#4A46CE' },
]

export const GLASS: Skin = {
  id: 'glass',
  name: 'Glass',
  palette: PALETTE,

  board: {
    // The plate is brighter than the jewel one because translucent gems need
    // something behind them to refract; a near-black plate would swallow them.
    boardFill: 'rgba(255, 255, 255, 0.075)',
    boardStroke: 'rgba(255, 255, 255, 0.16)',
    cellFill: 'rgba(255, 255, 255, 0.07)',
    // The wells are outlined here: they show through the gems, so the grid is
    // part of the look rather than something hidden underneath it.
    cellStroke: 'rgba(255, 255, 255, 0.06)',
    lineWidth: 1,
    selectRing: 'rgba(255, 255, 255, 0.95)',
    hintRing: 'rgba(255, 255, 255, 0.5)',
    flash: '#FFFFFF',
    mark: '#FFFFFF',
    luminance: 'dark',
  },

  css: {
    bg: '#060818',
    // Two auroras instead of one, warm against cool, so the frosted panels have
    // something worth blurring behind them.
    'bg-glow': '#2b1b5c',
    'bg-glow-2': '#0b4b6e',
    panel: 'rgba(255, 255, 255, 0.08)',
    'panel-strong': 'rgba(255, 255, 255, 0.14)',
    'panel-blur': 'blur(18px) saturate(160%)',
    'panel-shadow': '0 18px 44px rgba(3, 6, 24, 0.55)',
    line: 'rgba(255, 255, 255, 0.16)',
    text: '#f3f5ff',
    muted: '#a3aad0',
    accent: '#c4b5fd',
    'accent-2': '#7dd3fc',
    radius: '22px',
  },

  paintBody(ctx, p) {
    const { r, style } = p
    ctx.save()
    // Coloured, thrown further than the jewel shadow and with no vertical
    // offset to speak of: light passing through glass tints what is under it.
    ctx.shadowColor = rgba(style.dark, 0.55)
    ctx.shadowBlur = r * 0.85
    ctx.shadowOffsetY = r * 0.3
    gemPath(ctx, style.shape, r)
    ctx.fillStyle = p.rainbow ? prism(ctx, p) : body(ctx, p)
    ctx.fill()
    ctx.restore()
  },

  paintInterior(ctx, p) {
    const { r, alpha, style } = p

    // A slow drift, a few percent wide. Static glass looks like plastic; glass
    // that swings a highlight around looks like a screensaver.
    const drift = Math.sin(p.time * 0.55) * r * 0.08

    // The pane's inner wall. Drawn as an inset silhouette offset up and left,
    // so only the near edge of it survives the caller's clip — which is what
    // reads as thickness rather than as a second outline.
    ctx.save()
    ctx.translate(-r * 0.05, -r * 0.07)
    gemPath(ctx, style.shape, r * 0.97)
    ctx.lineWidth = r * 0.17
    ctx.strokeStyle = rgba('#FFFFFF', alpha * 0.26)
    ctx.stroke()
    ctx.restore()

    // The environment: one broad band across the top-left corner.
    const sheen = ctx.createLinearGradient(-r, -r, r * 0.35, r * 0.5)
    sheen.addColorStop(0, rgba('#FFFFFF', alpha * 0.5))
    sheen.addColorStop(0.42, rgba('#FFFFFF', alpha * 0.12))
    sheen.addColorStop(0.75, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = sheen
    ctx.fillRect(-r * 1.2, -r * 1.2, r * 2.4, r * 2.4)

    // Where the light leaves the glass it pools, brightest and most saturated.
    const caustic = ctx.createRadialGradient(
      r * 0.26 + drift,
      r * 0.36,
      0,
      r * 0.26 + drift,
      r * 0.36,
      r * 0.95,
    )
    caustic.addColorStop(0, rgba(style.light, alpha * 0.66))
    caustic.addColorStop(0.45, rgba(style.base, alpha * 0.26))
    caustic.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = caustic
    ctx.fillRect(-r * 1.2, -r * 1.2, r * 2.4, r * 2.4)
  },

  paintEdge(ctx, p) {
    const { r, style, alpha } = p
    // The lip: white where the light hits it, the gem's own colour where it
    // does not. A single flat stroke is what makes glass look like a decal.
    const lip = ctx.createLinearGradient(-r, -r, r, r)
    lip.addColorStop(0, rgba('#FFFFFF', alpha * 0.85))
    lip.addColorStop(0.35, rgba('#FFFFFF', alpha * 0.3))
    lip.addColorStop(0.62, rgba(style.light, alpha * 0.35))
    lip.addColorStop(1, rgba('#FFFFFF', alpha * 0.08))
    gemPath(ctx, style.shape, r)
    ctx.lineWidth = Math.max(1, r * 0.075)
    ctx.strokeStyle = lip
    ctx.stroke()
  },
}

/** The body: bright at the top, transparent through the middle, dense at the foot. */
function body(ctx: CanvasRenderingContext2D, p: GemPaint): CanvasGradient {
  const { r, style, alpha } = p
  const g = ctx.createLinearGradient(-r * 0.6, -r, r * 0.5, r)
  g.addColorStop(0, rgba(style.light, alpha * 0.72))
  g.addColorStop(0.38, rgba(style.base, alpha * 0.5))
  g.addColorStop(0.72, rgba(style.base, alpha * 0.62))
  g.addColorStop(1, rgba(style.dark, alpha * 0.82))
  return g
}

/** A prism turns the whole palette through the pane. */
function prism(ctx: CanvasRenderingContext2D, p: GemPaint): CanvasGradient {
  const cg = ctx.createConicGradient(p.time * 1.2, 0, 0)
  p.palette.forEach((s, i) => cg.addColorStop(i / p.palette.length, rgba(s.base, p.alpha * 0.55)))
  cg.addColorStop(1, rgba(p.palette[0]?.base ?? p.style.base, p.alpha * 0.55))
  return cg
}

/**
 * `#RRGGBB` plus an alpha, as a canvas-ready colour.
 *
 * Every colour a skin declares is an opaque hex so the palette stays readable
 * as a palette; translucency is a property of how a skin paints, not of the
 * colours themselves. Anything that is not a six-digit hex is passed through
 * untouched rather than being turned into `rgba(NaN, …)`, which canvas ignores
 * silently and would leave a gem simply missing from the board.
 */
function rgba(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha))
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}
