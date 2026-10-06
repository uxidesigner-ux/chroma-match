import type { Game } from '../game/game.ts'
import { at } from '../game/types.ts'
import type { Gem, Geom } from '../game/types.ts'
import type { Effects, EffectBounds } from './particles.ts'
import { gemPath } from './shapes.ts'
import { activeSkin } from './skins/index.ts'
import { drawStrikes } from './strikes.ts'
import { reducedMotion } from './motion.ts'
import { drawFusion } from './fusion.ts'

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

/** A short plate highlight, never a translation of the grid/hit-test space. */
const IMPACT_TIME = 0.26

export class Renderer {
  private ctx: CanvasRenderingContext2D
  private layout: Layout = { x: 0, y: 0, cell: 1, w: 1, h: 1 }
  private width = 0
  private height = 0
  private impact = 0
  private dpr = 0

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
  resize(): boolean {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false
    const w = Math.max(1, Math.round(rect.width))
    const h = Math.max(1, Math.round(rect.height))
    if (w === this.width && h === this.height && dpr === this.dpr) return false
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(h * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.width = w
    this.height = h
    this.dpr = dpr
    this.impact = 0

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
    return true
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

  /**
   * Hits the board. `force` runs 0..1; callers pass what the moment was worth,
   * and the strongest hit in flight wins rather than the most recent one, so a
   * chain's opening clear is not what the player feels at the end of it.
   */
  hit(force: number): void {
    if (reducedMotion()) return
    const next = Math.max(0, Math.min(1, force))
    this.impact = Math.max(this.impact, next)
  }

  /** Decays the hit. Called with the frame's delta, not with the clock. */
  settle(dt: number): void {
    if (reducedMotion()) this.impact = 0
    this.impact = Math.max(0, this.impact - dt / IMPACT_TIME)
  }

  draw(game: Game, effects: Effects, time: number): void {
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.width, this.height)
    if (this.layout.cell < MIN_CELL) return

    this.drawBoardPlate(game)
    this.drawWells(game)

    ctx.save()
    this.boardClip(game)
    ctx.clip()
    if (game.hint) this.drawHint(game.hint.a, game.hint.b, time)
    this.drawGems(game, time)
    if (game.fusion && game.phaseKind === 'fusion') {
      drawFusion(ctx, game.fusion, game.phaseProgress, cell => this.centreOf(cell), this.cellSize)
    }
    // Over the gems and inside the board's clip: the shot crosses what it is
    // about to take, which is the whole reason it is drawn before the pop.
    if (game.phaseKind === 'strike') {
      const skin = activeSkin()
      drawStrikes(
        ctx,
        game.strikes,
        reducedMotion() ? 0.65 : game.phaseProgress,
        this.geom,
        this.layout,
        skin.board,
        (cell) => {
          const gem = at(game.grid, cell)
          return gem ? (skin.palette[gem.kind % skin.palette.length] ?? null) : null
        },
      )
    }
    ctx.restore()

    // A gem can be both committed and under the pointer; draw one ring for it.
    if (game.selected !== null && game.selected !== game.held) {
      this.drawSelection(game.selected, time, false)
    }
    if (game.held !== null) this.drawSelection(game.held, time, true)

    // Dashed rings identify eligible partners without relying on colour.
    for (const cell of game.fusionPartners) {
      const { x, y } = this.centreOf(cell)
      ctx.save()
      ctx.strokeStyle = activeSkin().board.selectRing
      ctx.lineWidth = 2
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.arc(x, y, this.cellSize * 0.43, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    // Read clipping geometry only while score text exists. Scroll changes the
    // visible slice without resizing the canvas, so cached canvas bounds alone
    // would still clip labels at the scroller's top/bottom.
    effects.draw(ctx, effects.counts?.texts ? this.visibleEffectBounds() : { width: this.width, height: this.height })
  }

  private visibleEffectBounds(): EffectBounds {
    const board = this.canvas.getBoundingClientRect()
    const stage = this.canvas.closest('.stage')?.getBoundingClientRect() ?? board
    const screen = this.canvas.closest('.game')?.getBoundingClientRect() ?? stage
    if (!board.width || !board.height) return { width: 0, height: 0 }
    const left = Math.max(board.left, stage.left, screen.left, 0), top = Math.max(board.top, stage.top, screen.top, 0)
    const right = Math.min(board.right, stage.right, screen.right, innerWidth), bottom = Math.min(board.bottom, stage.bottom, screen.bottom, innerHeight)
    const sx = this.width / board.width, sy = this.height / board.height
    return { left: (left - board.left) * sx, top: (top - board.top) * sy,
      width: Math.max(0, right - left) * sx, height: Math.max(0, bottom - top) * sy }
  }

  private boardClip(game: Game): void {
    const { x, y, w, h } = this.layout
    this.ctx.beginPath()
    if(game.terrain.voidCells.size){
      for(let i=0;i<this.geom.cells;i++)if(!game.terrain.voidCells.has(i)){
        const p=this.centreOf(i),s=this.layout.cell
        this.ctx.rect(p.x-s/2,p.y-s/2,s,s)
      }
    }else this.ctx.roundRect(x - 2, y - 2, w + 4, h + 4, 20)
  }

  private drawBoardPlate(game: Game): void {
    const ctx = this.ctx
    const { x, y, w, h } = this.layout
    ctx.save()
    ctx.beginPath()
    // Keep the whole stroke inside the backing canvas, including Paper's ink.
    if(game.terrain.voidCells.size){
      for(let i=0;i<this.geom.cells;i++)if(!game.terrain.voidCells.has(i)){
        const p=this.centreOf(i),s=this.layout.cell
        ctx.roundRect(p.x-s/2-2,p.y-s/2-2,s+4,s+4,9)
      }
    }else ctx.roundRect(x - BOARD_PAD + 1.5, y - BOARD_PAD + 1.5, w + BOARD_PAD * 2 - 3, h + BOARD_PAD * 2 - 3, 26)
    const board = activeSkin().board
    ctx.fillStyle = board.boardFill
    ctx.fill()
    ctx.lineWidth = board.lineWidth
    ctx.strokeStyle = board.boardStroke
    ctx.stroke()
    if (this.impact > 0 && !reducedMotion()) {
      ctx.globalAlpha = this.impact * .65
      ctx.lineWidth = 3
      ctx.strokeStyle = board.selectRing
      ctx.stroke()
    }
    ctx.restore()
  }

  private drawWells(game: Game): void {
    const ctx = this.ctx
    const { x, y, cell } = this.layout
    const inset = cell * 0.08
    const board = activeSkin().board
    ctx.save()
    ctx.fillStyle = board.cellFill
    if (board.cellStroke) {
      ctx.strokeStyle = board.cellStroke
      ctx.lineWidth = board.lineWidth
    }
    for (let r = 0; r < this.geom.rows; r++) {
      for (let c = 0; c < this.geom.cols; c++) {
        if(game.terrain.voidCells.has(this.geom.idx(c,r)))continue
        ctx.beginPath()
        ctx.roundRect(
          x + c * cell + inset,
          y + r * cell + inset,
          cell - inset * 2,
          cell - inset * 2,
          cell * 0.22,
        )
        ctx.fill()
        if (board.cellStroke) ctx.stroke()
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

      if(gem.kind>=0)this.drawGem(gem, cx, cy, scale, alpha, time)
    }
    // Anchored blocks stay above incoming gems at a segmented refill boundary.
    for(let i=0;i<this.geom.cells;i++){
      const gem=at(game.grid,i);if(!gem||gem.kind>=0)continue
      const p=this.centreOf(i),scale=gem.clearing?Math.max(0,1-clearP):1+(gem.flash>0?gem.flash*.15:0)
      this.drawCrate(gem,p.x,p.y,scale,gem.clearing?1-clearP:1)
    }
  }

  private drawCrate(gem: Gem,x:number,y:number,scale:number,alpha:number):void {
    const ctx=this.ctx,s=this.layout.cell*.78
    ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.globalAlpha=alpha
    const fill=ctx.createLinearGradient(0,-s/2,0,s/2)
    fill.addColorStop(0,'#b7d2ee');fill.addColorStop(.4,'#6687b9');fill.addColorStop(1,'#344f7c')
    ctx.fillStyle='#172c50';ctx.beginPath();ctx.roundRect(-s/2,-s/2+4,s,s,9);ctx.fill()
    ctx.fillStyle=fill;ctx.strokeStyle=gem.flash>0?'#fff1a3':'#d9e9fc';ctx.lineWidth=2
    ctx.beginPath();ctx.roundRect(-s/2,-s/2,s,s-3,9);ctx.fill();ctx.stroke()
    ctx.strokeStyle='#294572';ctx.lineWidth=3;ctx.beginPath()
    ctx.moveTo(-s*.32,-s*.32);ctx.lineTo(s*.32,s*.24);ctx.moveTo(s*.32,-s*.32);ctx.lineTo(-s*.32,s*.24);ctx.stroke()
    for(let n=0;n<(gem.durability??0);n++){
      ctx.fillStyle='#ffe373';ctx.beginPath();ctx.arc((n-((gem.durability??0)-1)/2)*10,s*.28,3.5,0,Math.PI*2);ctx.fill()
    }
    ctx.restore()
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
    const skin = activeSkin()
    const style = skin.palette[gem.kind % skin.palette.length]
    if (!style) return
    const r = this.layout.cell * 0.37
    const paint = {
      style,
      r,
      alpha,
      time,
      rainbow: gem.power === 'rainbow',
      palette: skin.palette,
    }

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(cx, cy)
    ctx.scale(scale, scale)

    // How a gem is finished belongs to the skin; what is drawn and in what
    // order belongs here, so every skin gets the same three passes and the
    // power badge always lands inside the silhouette.
    skin.paintBody(ctx, paint)

    ctx.save()
    gemPath(ctx, style.shape, r)
    ctx.clip()
    skin.paintInterior(ctx, paint)
    ctx.globalAlpha = alpha
    this.drawPowerMark(gem, r)
    ctx.restore()

    skin.paintEdge(ctx, paint)

    if (gem.flash > 0) {
      ctx.globalAlpha = alpha * gem.flash * 1.8
      ctx.lineWidth = r * 0.18
      ctx.strokeStyle = skin.board.flash
      gemPath(ctx, style.shape, r * 1.12)
      ctx.stroke()
    }

    ctx.restore()
  }

  /** The badge that tells the player what a power gem will do. */
  private drawPowerMark(gem: Gem, r: number): void {
    const ctx = this.ctx
    if (gem.power === 'none') return
    // The badge colour comes from the skin: on a light board a white badge is
    // invisible, and the badge is the only thing that says what a gem does.
    const mark = activeSkin().board.mark
    const alpha = ctx.globalAlpha
    ctx.save()
    ctx.fillStyle = mark
    ctx.strokeStyle = mark
    if (gem.power === 'rowClear' || gem.power === 'colClear') {
      if (gem.power === 'colClear') ctx.rotate(Math.PI / 2)
      ctx.globalAlpha = alpha * 0.85
      for (const offset of [-r * 0.42, 0, r * 0.42]) {
        ctx.beginPath()
        ctx.roundRect(-r * 1.3, offset - r * 0.1, r * 2.6, r * 0.2, r * 0.1)
        ctx.fill()
      }
    } else if (gem.power === 'bomb') {
      ctx.globalAlpha = alpha * 0.9
      ctx.lineWidth = r * 0.16
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = alpha * 0.95
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2)
      ctx.fill()
    } else if (gem.power === 'rainbow') {
      ctx.globalAlpha = alpha * 0.95
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
    ctx.strokeStyle = activeSkin().board.selectRing
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
    ctx.strokeStyle = activeSkin().board.hintRing
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
