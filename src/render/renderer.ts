import type { Game } from '../game/game.ts'
import { at } from '../game/types.ts'
import type { Gem, Geom } from '../game/types.ts'
import type { Effects } from './particles.ts'
import { gemPath } from './shapes.ts'
import { PALETTE, styleFor, THEME } from './theme.ts'

interface Layout {
  /** Board origin in CSS pixels, its drawn size, and the size of one cell. */
  x: number
  y: number
  cell: number
  w: number
  h: number
}

/**
 * Margin between the board's edge and the plate drawn behind it. The board is
 * width-bound on a phone, so this margin comes straight out of the cell size —
 * it is kept tight for that reason.
 */
const BOARD_PAD = 8
/** Below this a cell is too small to draw anything legible into. */
const MIN_CELL = 6

export class Renderer {
  private ctx: CanvasRenderingContext2D
  private layout: Layout = { x: 0, y: 0, cell: 1, w: 1, h: 1 }
  private width = 0
  private height = 0

  constructor(
    private canvas: HTMLCanvasElement,
    private geom: Geom,
  ) {
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) throw new Error('This browser has no 2D canvas context.')
    this.ctx = ctx
    this.resize()
  }

  /** Matches the backing store to the element's CSS size and the device DPR. */
  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
    const rect = this.canvas.getBoundingClientRect()
    const w = Math.max(1, Math.round(rect.width))
    const h = Math.max(1, Math.round(rect.height))
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(h * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.width = w
    this.height = h

    // The board is not square, so the cell size is whichever of the two axes
    // runs out first. The stylesheet can also land a frame after this module
    // runs, leaving the element briefly zero-sized, so clamp at zero to keep
    // the geometry (and roundRect) valid.
    const cell = Math.max(
      0,
      Math.min(
        (w - BOARD_PAD * 2) / this.geom.cols,
        (h - BOARD_PAD * 2) / this.geom.rows,
      ),
    )
    const bw = cell * this.geom.cols
    const bh = cell * this.geom.rows
    this.layout = { cell, w: bw, h: bh, x: (w - bw) / 2, y: (h - bh) / 2 }
  }

  /** Grid index under a point given in CSS pixels relative to the canvas. */
  cellAtPoint(px: number, py: number): number | null {
    const { x, y, cell } = this.layout
    // Must match draw()'s threshold: a board too small to render must not still
    // be swallowing taps and spending the player's moves.
    if (cell < MIN_CELL) return null
    const c = Math.floor((px - x) / cell)
    const r = Math.floor((py - y) / cell)
    if (!this.geom.inBounds(c, r)) return null
    return this.geom.idx(c, r)
  }

  centreOf(cell: number): { x: number; y: number } {
    const { x, y, cell: size } = this.layout
    return {
      x: x + (this.geom.colOf(cell) + 0.5) * size,
      y: y + (this.geom.rowOf(cell) + 0.5) * size,
    }
  }

  get cellSize(): number {
    return this.layout.cell
  }

  draw(game: Game, effects: Effects, time: number): void {
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.width, this.height)
    if (this.layout.cell < MIN_CELL) return

    this.drawBoardPlate()
    this.drawWells()

    ctx.save()
    this.boardClip()
    ctx.clip()
    if (game.hint) this.drawHint(game.hint.a, game.hint.b, time)
    this.drawGems(game, time)
    ctx.restore()

    // A gem can be both committed and under the pointer; draw one ring for it.
    if (game.selected !== null && game.selected !== game.held) {
      this.drawSelection(game.selected, time, false)
    }
    if (game.held !== null) this.drawSelection(game.held, time, true)

    effects.draw(ctx)
  }

  private boardClip(): void {
    const { x, y, w, h } = this.layout
    this.ctx.beginPath()
    this.ctx.roundRect(x - 2, y - 2, w + 4, h + 4, 20)
  }

  private drawBoardPlate(): void {
    const ctx = this.ctx
    const { x, y, w, h } = this.layout
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(x - BOARD_PAD, y - BOARD_PAD, w + BOARD_PAD * 2, h + BOARD_PAD * 2, 26)
    ctx.fillStyle = THEME.boardFill
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = THEME.boardStroke
    ctx.stroke()
    ctx.restore()
  }

  private drawWells(): void {
    const ctx = this.ctx
    const { x, y, cell } = this.layout
    const inset = cell * 0.08
    ctx.save()
    ctx.fillStyle = THEME.cellFill
    for (let r = 0; r < this.geom.rows; r++) {
      for (let c = 0; c < this.geom.cols; c++) {
        ctx.beginPath()
        ctx.roundRect(
          x + c * cell + inset,
          y + r * cell + inset,
          cell - inset * 2,
          cell - inset * 2,
          cell * 0.22,
        )
        ctx.fill()
      }
    }
    ctx.restore()
  }

  private drawGems(game: Game, time: number): void {
    const f = game.offsetFactor
    const clearP = game.clearProgress
    // A shuffle collapses every gem to nothing and blooms it back out.
    const shuffleScale =
      game.phaseKind === 'shuffle' ? Math.abs(Math.cos(game.phaseProgress * Math.PI)) : 1

    for (let i = 0; i < this.geom.cells; i++) {
      const gem = at(game.grid, i)
      if (!gem) continue
      const { x, y } = this.centreOf(i)
      const cx = x + gem.ox * f * this.layout.cell
      const cy = y + gem.oy * f * this.layout.cell

      let scale = shuffleScale
      let alpha = 1
      if (gem.clearing) {
        const p = clearP
        scale *= p < 0.35 ? 1 + (p / 0.35) * 0.28 : Math.max(0, 1.28 * (1 - (p - 0.35) / 0.65))
        alpha = p < 0.45 ? 1 : Math.max(0, 1 - (p - 0.45) / 0.55)
      } else if (game.held === i) {
        // A steady lift, not an animation: contact should register on the very
        // frame the pointer goes down.
        scale *= 1.1
      } else if (game.selected === i) {
        scale *= 1 + Math.sin(time * 9) * 0.05
      }
      if (gem.flash > 0) scale *= 1 + gem.flash * 0.35

      this.drawGem(gem, cx, cy, scale, alpha, time)
    }
  }

  private drawGem(
    gem: Gem,
    cx: number,
    cy: number,
    scale: number,
    alpha: number,
    time: number,
  ): void {
    if (scale <= 0.01 || alpha <= 0.01) return
    const ctx = this.ctx
    const style = styleFor(gem.kind)
    const r = this.layout.cell * 0.37

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(cx, cy)
    ctx.scale(scale, scale)

    // Body, lifted off the board with a soft shadow.
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
    ctx.shadowBlur = r * 0.5
    ctx.shadowOffsetY = r * 0.18
    gemPath(ctx, style.shape, r)
    if (gem.power === 'rainbow') {
      const cg = ctx.createConicGradient(time * 1.2, 0, 0)
      PALETTE.forEach((p, i) => cg.addColorStop(i / PALETTE.length, p.base))
      cg.addColorStop(1, PALETTE[0]?.base ?? style.base)
      ctx.fillStyle = cg
    } else {
      const g = ctx.createLinearGradient(-r, -r, r * 0.6, r)
      g.addColorStop(0, style.light)
      g.addColorStop(0.52, style.base)
      g.addColorStop(1, style.dark)
      ctx.fillStyle = g
    }
    ctx.fill()
    ctx.restore()

    // Everything below sits inside the silhouette.
    ctx.save()
    gemPath(ctx, style.shape, r)
    ctx.clip()

    ctx.globalAlpha = alpha * 0.32
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath()
    ctx.ellipse(-r * 0.3, -r * 0.42, r * 0.42, r * 0.24, -0.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = alpha

    this.drawPowerMark(gem, r)
    ctx.restore()

    // Rim light, drawn last so it reads on top of the marks.
    gemPath(ctx, style.shape, r)
    ctx.lineWidth = Math.max(1, r * 0.08)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
    ctx.stroke()

    if (gem.flash > 0) {
      ctx.globalAlpha = alpha * gem.flash * 1.8
      ctx.lineWidth = r * 0.18
      ctx.strokeStyle = '#FFFFFF'
      gemPath(ctx, style.shape, r * 1.12)
      ctx.stroke()
    }

    ctx.restore()
  }

  /** The badge that tells the player what a power gem will do. */
  private drawPowerMark(gem: Gem, r: number): void {
    const ctx = this.ctx
    if (gem.power === 'none') return
    ctx.save()
    if (gem.power === 'rowClear' || gem.power === 'colClear') {
      if (gem.power === 'colClear') ctx.rotate(Math.PI / 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
      for (const offset of [-r * 0.42, 0, r * 0.42]) {
        ctx.beginPath()
        ctx.roundRect(-r * 1.3, offset - r * 0.1, r * 2.6, r * 0.2, r * 0.1)
        ctx.fill()
      }
    } else if (gem.power === 'bomb') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.lineWidth = r * 0.16
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2)
      ctx.fill()
    } else if (gem.power === 'rainbow') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
      ctx.beginPath()
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const rad = i % 2 === 0 ? r * 0.5 : r * 0.18
        const px = Math.cos(a) * rad
        const py = Math.sin(a) * rad
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }

  /**
   * The ring around a chosen gem. A held gem gets a solid, steady ring so it
   * reads as direct contact; a committed selection pulses to say it is waiting
   * for a partner.
   */
  private drawSelection(cell: number, time: number, held: boolean): void {
    const ctx = this.ctx
    const { x, y } = this.centreOf(cell)
    const s = this.layout.cell
    ctx.save()
    ctx.translate(x, y)
    ctx.strokeStyle = THEME.selectRing
    if (held) {
      ctx.lineWidth = 3
      ctx.globalAlpha = 1
    } else {
      const pulse = 0.5 + Math.sin(time * 6) * 0.5
      ctx.lineWidth = 2.5
      ctx.globalAlpha = 0.7 + pulse * 0.3
    }
    const r = s * (held ? 0.47 : 0.44)
    ctx.beginPath()
    ctx.roundRect(-r, -r, r * 2, r * 2, s * 0.24)
    ctx.stroke()
    ctx.restore()
  }

  private drawHint(a: number, b: number, time: number): void {
    const ctx = this.ctx
    const pulse = 0.35 + Math.sin(time * 4) * 0.35
    const s = this.layout.cell
    ctx.save()
    ctx.globalAlpha = pulse
    ctx.strokeStyle = THEME.hintRing
    ctx.lineWidth = 2
    ctx.setLineDash([s * 0.12, s * 0.1])
    for (const cell of [a, b]) {
      const { x, y } = this.centreOf(cell)
      ctx.beginPath()
      ctx.roundRect(x - s * 0.44, y - s * 0.44, s * 0.88, s * 0.88, s * 0.24)
      ctx.stroke()
    }
    ctx.restore()
  }
}
