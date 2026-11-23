import { cellPlayable, type EffectEvent, type GameState, type LevelDefinition, type ObstacleState, type Piece, type Tool } from './model.ts'
import { iconData } from './art.ts'
import { rasterIcon } from './raster-art.ts'
export { iconData } from './art.ts'

type Ctx = CanvasRenderingContext2D
interface Motion { start: number; duration: number; dx: number; dy: number; bounce: boolean }
interface Particle { x: number; y: number; vx: number; vy: number; birth: number; life: number; size: number; colour: string; spin: number }
interface Visual { event: EffectEvent; birth: number; life: number }
interface Ghost { piece: Piece; cell: number; birth: number }
const TAU = Math.PI * 2
const COLOURS = ['#ffe557', '#ff5265', '#4dd9ff', '#91f747']
const sprites = new Map<string, HTMLImageElement>()
interface RasterRegion { image: HTMLImageElement; bounds?: { x: number; y: number; w: number; h: number } }
const rasterRegions = new Map<string, RasterRegion>()
const clamp = (n: number, a = 0, b = 1): number => Math.min(b, Math.max(a, n))
/** Cover the whole footprint while bounding per-frame rays and celebration work. */
const sample = <T>(items: readonly T[], limit: number): T[] => items.length <= limit ? [...items] : Array.from({ length: limit }, (_, i) => items[Math.floor(i * (items.length - 1) / (limit - 1))]!)

function sprite(ctx: Ctx, kind: string, x: number, y: number, size: number, colour = 0): void {
  const key = `${kind}:${colour}`
  let img = sprites.get(key)
  if (!img) { img = new Image(); img.src = iconData(kind, colour); sprites.set(key, img) }
  if (img.complete && img.naturalWidth) ctx.drawImage(img, x - size / 2, y - size / 2, size, size)
}
/** Fit artwork to its occupied cells without stretching its bevels or bow. */
function rasterBox(ctx: Ctx, kind: string, x: number, y: number, w: number, h: number, rotateTall = false): boolean {
  const source = rasterIcon(kind)
  if (!source) return false
  let asset = rasterRegions.get(source)
  if (!asset) {
    const image = new Image()
    asset = { image }; rasterRegions.set(source, asset)
    const region = asset
    image.onload = () => {
      const probe = document.createElement('canvas'); probe.width = image.naturalWidth; probe.height = image.naturalHeight
      const draw = probe.getContext('2d', { willReadFrequently: true })
      if (!draw) return
      try {
        draw.drawImage(image, 0, 0)
        const pixels = draw.getImageData(0, 0, probe.width, probe.height).data
        let left = probe.width, top = probe.height, right = -1, bottom = -1
        for (let py = 0; py < probe.height; py++) for (let px = 0; px < probe.width; px++) {
          if (pixels[(py * probe.width + px) * 4 + 3]! < 24) continue
          left = Math.min(left, px); top = Math.min(top, py); right = Math.max(right, px); bottom = Math.max(bottom, py)
        }
        if (right >= left) region.bounds = { x: left, y: top, w: right - left + 1, h: bottom - top + 1 }
      } catch { /* The dimensional canvas drawing remains the fallback. */ }
    }
    image.src = source
  }
  const b = asset.bounds
  if (!b) return false
  const quarterTurn = rotateTall && w > h && b.h > b.w
  const scale = quarterTurn ? Math.min(w / b.h, h / b.w) : Math.min(w / b.w, h / b.h)
  ctx.save(); ctx.translate(x + w / 2, y + h / 2)
  if (quarterTurn) ctx.rotate(Math.PI / 2)
  ctx.drawImage(asset.image, b.x, b.y, b.w, b.h, -b.w * scale / 2, -b.h * scale / 2, b.w * scale, b.h * scale)
  ctx.restore()
  return true
}
function rounded(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath(); ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.min(r, Math.min(w, h) / 2))
}
function plate(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, top: string, bottom: string, border: string, thickness = 2): void {
  const g = ctx.createLinearGradient(x, y, x + w * .25, y + h)
  g.addColorStop(0, top); g.addColorStop(1, bottom)
  rounded(ctx, x, y, w, h, r); ctx.fillStyle = g; ctx.fill()
  ctx.strokeStyle = border; ctx.lineWidth = thickness; ctx.stroke()
}
function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, colour: string, width: number): void {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.stroke()
}
function star(ctx: Ctx, x: number, y: number, size: number, rotation: number): void {
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = rotation + i * Math.PI / 4, r = size * (i % 2 ? .24 : 1)
    if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  ctx.closePath(); ctx.fill()
}

/** Fits any supported board into its parent's space; exterior cutouts stay transparent. */
export class RoyalRenderer {
  private readonly ctx: Ctx
  private level: LevelDefinition | null = null
  private width = 1
  private height = 1
  private offsetX = 0
  private offsetY = 0
  private size = 1
  private clock = 0
  private calm = false
  private particles: Particle[] = []
  private visuals: Visual[] = []
  private ghosts: Ghost[] = []
  private motions = new Map<number, Motion>()
  private damage = new Map<number, number>()
  private previousPieces = new Map<number, Piece>()
  private animationSeed = 43
  private observer: ResizeObserver

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) throw new Error('2D canvas is unavailable')
    this.ctx = ctx
    this.observer = new ResizeObserver(() => { if (this.level) this.resize(this.level) })
    this.observer.observe(canvas)
    // Resolve SVGs before the first board frame whenever possible.
    for (const kind of ['colour', 'rocket-h', 'rocket-v', 'propeller', 'tnt', 'lightball', 'box', 'stone', 'ice', 'toy', 'cuckoo']) {
      for (let colour = 0; colour < (kind === 'colour' ? 4 : 1); colour++) sprite(ctx, kind, -200, -200, 1, colour)
    }
  }

  get cellSize(): number { return this.size }

  resize(level: LevelDefinition): void {
    const changed = !this.level || this.level.id !== level.id || this.level.cols !== level.cols || this.level.rows !== level.rows || this.level !== level
    this.level = level
    const box = this.canvas.getBoundingClientRect()
    this.width = Math.max(1, box.width || this.canvas.clientWidth || 360)
    this.height = Math.max(1, box.height || this.canvas.clientHeight || this.width * level.rows / level.cols)
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
    const w = Math.round(this.width * dpr), h = Math.round(this.height * dpr)
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.size = Math.min((this.width - 14) / level.cols, (this.height - 14) / level.rows)
    this.size = Math.max(1, this.size)
    this.offsetX = (this.width - level.cols * this.size) / 2
    this.offsetY = (this.height - level.rows * this.size) / 2
    if (changed) this.resetEffects()
  }

  destroy(): void { this.observer.disconnect(); this.resetEffects() }
  resetEffects(): void {
    this.particles = []; this.visuals = []; this.ghosts = []; this.motions.clear(); this.damage.clear(); this.previousPieces.clear()
  }
  centreOf(cell: number): { x: number; y: number } {
    const cols = this.level?.cols ?? 1
    return { x: this.offsetX + (cell % cols + .5) * this.size, y: this.offsetY + (Math.floor(cell / cols) + .5) * this.size }
  }
  cellAt(clientX: number, clientY: number): number | null {
    if (!this.level) return null
    const b = this.canvas.getBoundingClientRect()
    const x = clientX - b.left - this.offsetX, y = clientY - b.top - this.offsetY
    const col = Math.floor(x / this.size), row = Math.floor(y / this.size)
    if (col < 0 || col >= this.level.cols || row < 0 || row >= this.level.rows) return null
    const cell = row * this.level.cols + col
    return cellPlayable(this.level, cell) ? cell : null
  }
  private random(): number {
    this.animationSeed = (Math.imul(this.animationSeed, 1664525) + 1013904223) >>> 0
    return this.animationSeed / 4294967296
  }
  private burst(cell: number, colour: string, count: number, strong = false): void {
    const p = this.centreOf(cell)
    for (let i = 0; i < count; i++) {
      const angle = this.random() * TAU, speed = this.size * (.8 + this.random() * (strong ? 4.5 : 2.2))
      this.particles.push({ x: p.x, y: p.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - this.size * .5, birth: this.clock,
        life: .24 + this.random() * .4, size: this.size * (.025 + this.random() * .045), colour: i % 3 ? colour : '#fff8bb', spin: this.random() * TAU })
    }
    if (this.particles.length > 450) this.particles.splice(0, this.particles.length - 450)
  }
  pushEvents(events: EffectEvent[]): void {
    for (const event of events) {
      const cells = event.cells
      if (event.kind === 'clear') {
        for (const cell of cells) {
          const old = this.previousPieces.get(cell)
          if (old && !this.calm) this.ghosts.push({ piece: old, cell, birth: this.clock })
          this.burst(cell, COLOURS[event.colour ?? old?.colour ?? 0]!, this.calm ? 2 : 8)
        }
      } else if (event.kind === 'swap' && event.from !== undefined && event.to !== undefined) {
        const a = this.centreOf(event.from), b = this.centreOf(event.to)
        this.motions.set(event.from, { start: this.clock, duration: .13, dx: b.x - a.x, dy: b.y - a.y, bounce: false })
        this.motions.set(event.to, { start: this.clock, duration: .13, dx: a.x - b.x, dy: a.y - b.y, bounce: false })
      } else if (event.kind === 'fall') {
        if (event.from !== undefined && event.to !== undefined) {
          const a = this.centreOf(event.from), b = this.centreOf(event.to)
          this.motions.set(event.to, { start: this.clock, duration: .19, dx: a.x - b.x, dy: a.y - b.y, bounce: true })
        } else for (const cell of cells) {
          this.motions.set(cell, { start: this.clock, duration: .21, dx: 0, dy: -this.size * .65, bounce: true })
        }
      } else if (event.kind === 'damage' || event.kind === 'invalid') {
        for (const cell of cells) this.damage.set(cell, this.clock)
        if (event.kind === 'damage') for (const cell of cells.slice(0, 3)) this.burst(cell, '#ffd46b', this.calm ? 2 : 6)
      } else if (event.kind === 'collect') {
        for (const cell of cells.slice(0, 6)) this.burst(cell, '#fff097', this.calm ? 3 : 12, true)
      } else if (event.kind === 'power') {
        for (const cell of cells) this.burst(cell, '#fff1a3', this.calm ? 3 : 18, true)
      } else if (event.kind === 'win') {
        for (const cell of sample(cells, 30)) this.burst(cell, COLOURS[cell % 4]!, this.calm ? 2 : 12, true)
      }
      if (['rocket', 'tnt', 'lightball', 'propeller', 'power', 'shuffle'].includes(event.kind)) {
        const life = event.kind === 'propeller' ? .48 : event.kind === 'lightball' ? event.combo ? .62 : .48 : event.kind === 'tnt' ? .4 + (event.radius ?? 2) * .035 : .35
        this.visuals.push({ event, birth: this.clock, life })
      }
    }
    if (this.visuals.length > 50) {
      // Keep the combo's source flash/beam when it creates dozens of child blasts.
      const priority = this.visuals.filter(v => v.event.combo).slice(-12)
      const rest = this.visuals.filter(v => !priority.includes(v)).slice(-(50 - priority.length))
      this.visuals = [...priority, ...rest]
    }
    if (this.ghosts.length > 100) this.ghosts.splice(0, this.ghosts.length - 100)
  }

  draw(state: GameState, timeSeconds: number, selected: number | null, aim: Tool | null, calm: boolean): void {
    if (this.level !== state.level) this.resize(state.level)
    this.clock = Number.isFinite(timeSeconds) ? timeSeconds : this.clock
    this.calm = calm
    const ctx = this.ctx, s = this.size, level = state.level
    ctx.clearRect(0, 0, this.width, this.height)
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    this.drawBoard(state)
    if (selected !== null) this.drawSelection(state, selected, aim)
    const occupied = new Set(state.obstacles.flatMap(o => o.cells))
    for (let i = 0; i < state.pieces.length; i++) {
      const piece = state.pieces[i]
      if (!piece || !cellPlayable(level, i) || occupied.has(i)) continue
      const p = this.centreOf(i), motion = this.motions.get(i), hit = this.damage.get(i)
      let dx = 0, dy = 0, scale = 1
      if (motion) {
        const t = clamp((this.clock - motion.start) / motion.duration)
        if (t >= 1) this.motions.delete(i)
        else if (!calm) {
          const ease = motion.bounce ? 1 - Math.pow(1 - t, 2) + Math.sin(t * Math.PI) * .09 : 1 - Math.pow(1 - t, 3)
          dx = motion.dx * (1 - ease); dy = motion.dy * (1 - ease)
          if (motion.bounce && t > .65) scale = 1 + Math.sin((t - .65) / .35 * Math.PI) * .07
        }
      }
      if (hit !== undefined) {
        const t = (this.clock - hit) / .25
        if (t > 1) this.damage.delete(i)
        else if (!calm) dx += Math.sin(t * 28) * s * .06 * (1 - t)
      }
      ctx.save(); ctx.translate(p.x + dx, p.y + dy); ctx.scale(scale, 1 / scale)
      sprite(ctx, piece.power ?? 'colour', 0, 0, s * .98, piece.colour)
      if (piece.power === 'lightball' && !calm) {
        ctx.fillStyle = '#fffbd1'; const a = this.clock * 1.7 + i
        star(ctx, Math.cos(a) * s * .28, Math.sin(a) * s * .28, s * .065, a)
      }
      ctx.restore()
    }
    for (const obstacle of state.obstacles) this.drawObstacle(state, obstacle)
    this.drawGhosts()
    this.drawEffects()
    this.previousPieces.clear()
    state.pieces.forEach((p, cell) => { if (p) this.previousPieces.set(cell, p) })
  }

  private drawBoard(state: GameState): void {
    const { ctx, size: s } = this, { level } = state
    const edges = new Path2D()
    for (let row = 0; row < level.rows; row++) for (let col = 0; col < level.cols; col++) {
      const cell = row * level.cols + col
      if (!cellPlayable(level, cell)) continue
      const x = this.offsetX + col * s, y = this.offsetY + row * s
      ctx.fillStyle = (row + col) % 2 ? '#8a9ccc' : '#919fd0'
      ctx.fillRect(x, y, s + .2, s + .2)
      line(ctx, x + 1, y + 1, x + s - 1, y + 1, '#cfddfa24', .8)
      line(ctx, x + 1, y + 1, x + 1, y + s - 1, '#c8d8f61c', .8)
      if (state.jelly[cell]) {
        const gel = ctx.createLinearGradient(x, y, x + s, y + s)
        gel.addColorStop(0, '#aa72dd'); gel.addColorStop(.35, '#8754ba'); gel.addColorStop(1, '#7041a4')
        ctx.fillStyle = gel; ctx.fillRect(x, y, s + .4, s + .4)
        rounded(ctx, x + s * .07, y + s * .07, s * .86, s * .86, s * .16)
        ctx.strokeStyle = '#daacff88'; ctx.lineWidth = s * .035; ctx.stroke()
      }
      const up = row === 0 || !cellPlayable(level, cell - level.cols)
      const down = row === level.rows - 1 || !cellPlayable(level, cell + level.cols)
      const left = col === 0 || !cellPlayable(level, cell - 1)
      const right = col === level.cols - 1 || !cellPlayable(level, cell + 1)
      if (up) { edges.moveTo(x, y); edges.lineTo(x + s, y) }
      if (down) { edges.moveTo(x, y + s); edges.lineTo(x + s, y + s) }
      if (left) { edges.moveTo(x, y); edges.lineTo(x, y + s) }
      if (right) { edges.moveTo(x + s, y); edges.lineTo(x + s, y + s) }
    }
    ctx.save(); ctx.shadowColor = '#12204c99'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 3
    ctx.strokeStyle = '#9c601d'; ctx.lineWidth = Math.max(3, s * .105); ctx.stroke(edges)
    ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#ffca41'; ctx.lineWidth = Math.max(1.8, s * .065); ctx.stroke(edges)
    ctx.strokeStyle = '#ffe789'; ctx.lineWidth = Math.max(.65, s * .018); ctx.stroke(edges); ctx.restore()
  }

  private drawSelection(state: GameState, selected: number, aim: Tool | null): void {
    if (!cellPlayable(state.level, selected)) return
    const s = this.size, ctx = this.ctx
    const chosen = state.pieces.map((_, i) => i).filter(i => cellPlayable(state.level, i) && (
      aim === 'arrow' ? Math.floor(i / state.level.cols) === Math.floor(selected / state.level.cols)
      : aim === 'cannon' ? i % state.level.cols === selected % state.level.cols : i === selected))
    for (const cell of chosen) {
      const p = this.centreOf(cell)
      rounded(ctx, p.x - s * .46, p.y - s * .46, s * .92, s * .92, s * .12)
      ctx.fillStyle = '#fff59744'; ctx.fill(); ctx.strokeStyle = '#fff7c1'; ctx.lineWidth = Math.max(2, s * .04); ctx.stroke()
    }
  }

  private drawObstacle(state: GameState, obstacle: ObstacleState): void {
    const cols = state.level.cols, s = this.size, ctx = this.ctx
    let c0 = cols, c1 = 0, r0 = state.level.rows, r1 = 0
    for (const cell of obstacle.cells) { c0 = Math.min(c0, cell % cols); c1 = Math.max(c1, cell % cols); r0 = Math.min(r0, Math.floor(cell / cols)); r1 = Math.max(r1, Math.floor(cell / cols)) }
    const x = this.offsetX + c0 * s + s * .035, y = this.offsetY + r0 * s + s * .035
    const w = (c1 - c0 + 1) * s - s * .07, h = (r1 - r0 + 1) * s - s * .07
    let hitAge = 1
    for (const cell of obstacle.cells) { const birth = this.damage.get(cell); if (birth !== undefined) hitAge = Math.min(hitAge, (this.clock - birth) / .25) }
    ctx.save()
    if (!this.calm && hitAge < 1) ctx.translate(Math.sin(hitAge * 29) * s * .055 * (1 - hitAge), 0)
    ctx.shadowColor = '#1f285b66'; ctx.shadowBlur = s * .045; ctx.shadowOffsetY = s * .045
    if (obstacle.kind === 'gift') this.drawGift(x, y, w, h, obstacle.hp)
    else if (obstacle.kind === 'dynamite') this.drawDynamite(x, y, w, h, obstacle)
    else if (obstacle.kind === 'cuckoo') this.drawNest(x, y, w, h, obstacle)
    else {
      for (const cell of obstacle.cells) {
        const p = this.centreOf(cell)
        sprite(ctx, obstacle.kind, p.x, p.y, s * 1.18)
      }
    }
    ctx.shadowColor = 'transparent'
    if (obstacle.kind !== 'dynamite' && obstacle.kind !== 'cuckoo' && obstacle.kind !== 'gift') {
      const hp = Math.min(6, obstacle.hp)
      for (let i = 0; i < hp; i++) {
        ctx.beginPath(); ctx.arc(x + w / 2 + (i - (hp - 1) / 2) * s * .12, y + h - s * .14, s * .035, 0, TAU)
        ctx.fillStyle = '#fff3a0'; ctx.fill(); ctx.strokeStyle = '#744e2f'; ctx.lineWidth = 1; ctx.stroke()
      }
    }
    if (hitAge < .65) {
      ctx.globalAlpha = (1 - hitAge / .65) * .3; ctx.fillStyle = '#fff8b5'
      rounded(ctx, x, y, w, h, s * .1); ctx.fill()
    }
    ctx.restore()
  }

  private drawGift(x: number, y: number, w: number, h: number, hp: number): void {
    const ctx = this.ctx, s = this.size, m = Math.min(w, h)
    const stateArt = hp >= 4 ? 'gift-full' : hp === 3 ? 'gift-ribbon' : hp === 2 ? 'gift-seal' : 'gift-open'
    if (rasterBox(ctx, stateArt, x, y, w, h, true)) return
    plate(ctx, x, y, w, h, s * .20, '#de315b', '#76002d', '#89032d', s * .045)
    ctx.shadowColor = 'transparent'
    plate(ctx, x + s * .065, y + s * .05, w - s * .13, h - s * .115, s * .15, '#b80042', '#99002f', '#f15c7b', s * .023)
    const gleam = ctx.createLinearGradient(x, y, x + w * .28, y)
    gleam.addColorStop(0, '#ffb7c06b'); gleam.addColorStop(1, '#ffb7c000')
    rounded(ctx, x + s * .08, y + s * .09, w * .25, h - s * .19, s * .11); ctx.fillStyle = gleam; ctx.fill()
    for (let py = y + s * .3; py < y + h - s * .15; py += s * .72) {
      ctx.fillStyle = '#e7427540'
      ctx.beginPath(); ctx.moveTo(x + w * .25, py); ctx.lineTo(x + w * .35, py + s * .08); ctx.lineTo(x + w * .45, py - s * .04)
      ctx.lineTo(x + w * .55, py + s * .08); ctx.lineTo(x + w * .65, py); ctx.lineTo(x + w * .6, py + s * .22); ctx.lineTo(x + w * .3, py + s * .22); ctx.closePath(); ctx.fill()
    }
    if (hp >= 3) {
      if (h >= w) plate(ctx, x + w * .42, y, w * .16, h, s * .015, '#ffdf26', '#eaa400', '#f8be16', s * .015)
      else plate(ctx, x, y + h * .42, w, h * .16, s * .015, '#ffdf26', '#eaa400', '#f8be16', s * .015)
      const cx = x + w / 2, cy = y + h / 2
      ctx.save(); ctx.translate(cx, cy)
      for (const flip of [-1, 1]) {
        ctx.save(); ctx.scale(flip, 1)
        const silk = ctx.createLinearGradient(0, -m * .12, 0, m * .16)
        silk.addColorStop(0, '#92efff'); silk.addColorStop(.5, '#24bee8'); silk.addColorStop(1, '#0872ad')
        ctx.fillStyle = silk; ctx.strokeStyle = '#0a659c'; ctx.lineWidth = m * .035
        ctx.beginPath(); ctx.moveTo(0, -m * .02); ctx.bezierCurveTo(-m * .43, -m * .35, -m * .51, m * .22, -m * .08, m * .13); ctx.closePath(); ctx.fill(); ctx.stroke()
        if (hp >= 4) {
          ctx.beginPath(); ctx.moveTo(-m * .07, m * .05); ctx.lineTo(-m * .22, m * .34); ctx.lineTo(-m * .06, m * .27); ctx.lineTo(0, m * .35); ctx.lineTo(m * .04, m * .07); ctx.closePath(); ctx.fill(); ctx.stroke()
        }
        ctx.restore()
      }
      plate(ctx, -m * .07, -m * .1, m * .14, m * .24, m * .04, '#88eaff', '#058aca', '#1578a0', m * .025)
      ctx.restore()
    } else {
      ctx.save(); ctx.translate(x + w / 2, y + h / 2)
      const radius = m * .31
      const gold = ctx.createRadialGradient(-radius * .3, -radius * .4, 1, 0, 0, radius)
      gold.addColorStop(0, '#fff277'); gold.addColorStop(.6, '#f4b21c'); gold.addColorStop(1, '#cf6f07')
      ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.fill(); ctx.strokeStyle = '#9c4a09'; ctx.lineWidth = m * .025; ctx.stroke()
      if (hp === 1) sprite(ctx, 'toy', 0, 0, m * .76)
      else {
        ctx.fillStyle = '#970243'; ctx.beginPath(); ctx.moveTo(0, -radius * .77)
        ctx.bezierCurveTo(-radius * .5, -radius * .45, -radius * .18, -radius * .12, 0, radius * .1)
        ctx.bezierCurveTo(-radius * .56, -radius * .55, -radius * .99, 0, -radius * .49, radius * .25)
        ctx.bezierCurveTo(-radius * .3, radius * .35, -radius * .21, radius * .05, -radius * .12, radius * .14)
        ctx.lineTo(-radius * .2, radius * .52); ctx.lineTo(-radius * .05, radius * .75); ctx.lineTo(radius * .16, radius * .52); ctx.lineTo(radius * .1, radius * .14)
        ctx.bezierCurveTo(radius * .22, radius * .04, radius * .31, radius * .35, radius * .49, radius * .25)
        ctx.bezierCurveTo(radius * .99, 0, radius * .56, -radius * .55, 0, radius * .1)
        ctx.bezierCurveTo(radius * .2, -radius * .13, radius * .5, -radius * .45, 0, -radius * .77); ctx.closePath(); ctx.fill()
      }
      ctx.restore()
    }
  }

  private drawDynamite(x: number, y: number, w: number, h: number, obstacle: ObstacleState): void {
    const ctx = this.ctx, s = this.size, count = Math.max(0, obstacle.stock ?? 8)
    if (rasterBox(ctx, `dynamite-${count}`, x, y, w, h)) return
    plate(ctx, x, y, w, h, s * .22, '#c7cbdc', '#424b81', '#374065', s * .045)
    ctx.shadowColor = 'transparent'
    plate(ctx, x + w * .035, y + h * .035, w * .93, h * .69, s * .16, '#495275', '#1f294b', '#e9e4da', s * .055)
    const pairs = [['#ff7262', '#e51926', '#960c1d'], ['#9af73f', '#38d817', '#087f24'], ['#6acbff', '#2499ee', '#1250a8'], ['#ffe963', '#ffd022', '#d08808']]
    // Stagger the back and front cylinders; each remaining stick represents stock.
    for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) {
      if (row * 4 + col >= count) continue
      const px = x + w * (.15 + col * .23), py = y + h * (row ? .26 : .13)
      const rw = w * (row ? .155 : .125), rh = h * (row ? .43 : .48), pair = pairs[col]!
      line(ctx, px, py - h * .065, px + w * .003, py + h * .01, '#c68d48', s * .036)
      line(ctx, px - w * .004, py - h * .06, px, py - h * .015, '#f8d48b', s * .012)
      const cylinder = ctx.createLinearGradient(px - rw / 2, py, px + rw / 2, py)
      cylinder.addColorStop(0, pair[2]!); cylinder.addColorStop(.18, pair[1]!); cylinder.addColorStop(.38, pair[0]!); cylinder.addColorStop(.7, pair[1]!); cylinder.addColorStop(1, pair[2]!)
      rounded(ctx, px - rw / 2, py, rw, rh, rw * .17); ctx.fillStyle = cylinder; ctx.fill()
      ctx.beginPath(); ctx.ellipse(px, py + rw * .06, rw / 2, rw * .17, 0, 0, TAU); ctx.fillStyle = pair[0]!; ctx.fill()
      line(ctx, px - rw * .22, py + rh * .12, px - rw * .22, py + rh * .83, '#ffffff44', Math.max(.7, rw * .09))
      ctx.beginPath(); ctx.ellipse(px, py + rh - rw * .08, rw / 2, rw * .13, 0, 0, Math.PI); ctx.strokeStyle = '#5c3b1955'; ctx.lineWidth = s * .018; ctx.stroke()
    }
    plate(ctx, x + w * .015, y + h * .71, w * .97, h * .265, s * .055, '#6571b4', '#303b84', '#dadbe1', s * .035)
    line(ctx, x + w * .05, y + h * .745, x + w * .95, y + h * .745, '#a6b0e2', s * .022)
    line(ctx, x + w * .055, y + h * .93, x + w * .945, y + h * .93, '#17234d', s * .035)
    const radius = Math.min(w, h) * .088
    ctx.beginPath(); ctx.arc(x + w * .5, y + h * .835, radius * 1.3, 0, TAU); ctx.fillStyle = '#d9d1cb'; ctx.fill(); ctx.strokeStyle = '#1c2957'; ctx.lineWidth = s * .028; ctx.stroke()
    const button = ctx.createRadialGradient(x + w * .48, y + h * .805, 0, x + w * .5, y + h * .835, radius)
    button.addColorStop(0, '#ff9c91'); button.addColorStop(.4, '#dc2440'); button.addColorStop(1, '#7e0b2d')
    ctx.fillStyle = button; ctx.beginPath(); ctx.arc(x + w * .5, y + h * .835, radius, 0, TAU); ctx.fill()
    line(ctx, x + w * .055, y + h * .985, x + w * .945, y + h * .985, '#d9a649', s * .045)
  }

  private drawNest(x: number, y: number, w: number, h: number, obstacle: ObstacleState): void {
    const ctx = this.ctx, s = this.size, closed = obstacle.open === false
    const stock = Math.max(0, obstacle.stock ?? 1)
    if (rasterBox(ctx, `nest-${closed ? 'closed' : `open-${stock}`}`, x, y, w, h)) return
    plate(ctx, x, y, w, h, s * .095, '#eea048', '#b74a0f', '#9b400e', s * .05)
    ctx.shadowColor = 'transparent'
    rounded(ctx, x + s * .04, y + s * .04, w - s * .08, h - s * .08, s * .07)
    ctx.strokeStyle = '#ffd18a'; ctx.lineWidth = s * .028; ctx.stroke()
    const cols = w / h > 1.4 ? 2 : w > s * 1.2 ? 2 : 1
    const rows = h > s * 1.2 ? 2 : 1
    const birdSlots = cols === 2 && rows === 2 ? [0, 3, 1, 2] : Array.from({ length: cols * rows }, (_, i) => i)
    const arch = (px: number, py: number, ww: number, hh: number): void => {
      const radius = Math.min(ww * .48, hh * .46)
      ctx.beginPath(); ctx.moveTo(px, py + hh); ctx.lineTo(px, py + radius)
      ctx.bezierCurveTo(px, py - radius * .25, px + ww, py - radius * .25, px + ww, py + radius)
      ctx.lineTo(px + ww, py + hh); ctx.quadraticCurveTo(px + ww / 2, py + hh + s * .025, px, py + hh); ctx.closePath()
    }
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const dw = w / cols, dh = h / rows
      const px = x + col * dw + dw * .13, py = y + row * dh + dh * .12
      const ww = dw * .74, hh = dh * .78
      arch(px - s * .035, py - s * .015, ww + s * .07, hh + s * .04)
      ctx.fillStyle = '#a6450e'; ctx.fill(); ctx.strokeStyle = '#ffd083'; ctx.lineWidth = s * .026; ctx.stroke()
      const cavity = ctx.createLinearGradient(px, py, px + ww * .3, py + hh)
      cavity.addColorStop(0, closed ? '#c87929' : '#8c421c'); cavity.addColorStop(.38, closed ? '#e39a46' : '#bb7130'); cavity.addColorStop(1, closed ? '#d88532' : '#edb161')
      arch(px, py, ww, hh); ctx.fillStyle = cavity; ctx.fill()
      ctx.save(); ctx.clip()
      const inset = ctx.createLinearGradient(px, py, px + ww * .16, py)
      inset.addColorStop(0, '#632c1859'); inset.addColorStop(1, '#632c1800'); ctx.fillStyle = inset; ctx.fillRect(px, py, ww * .17, hh)
      if (closed) {
        line(ctx, px + ww * .5, py + hh * .08, px + ww * .5, py + hh * .98, '#bd702e', s * .018)
        line(ctx, px + ww * .52, py + hh * .09, px + ww * .52, py + hh * .98, '#f4b56e66', s * .014)
      }
      ctx.restore()
      line(ctx, px + ww * .03, py + hh, px + ww * .97, py + hh, '#f1b46c', s * .045)
      if (!closed && birdSlots.indexOf(row * cols + col) < stock) {
        sprite(ctx, 'cuckoo', px + ww / 2, py + hh * .60, Math.min(dw * .91, dh * .96))
      } else if (closed) {
        for (const flip of [-1, 1]) {
          const hingeX = px + (flip < 0 ? 0 : ww)
          plate(ctx, hingeX - s * .028, py + hh * .5, s * .056, hh * .2, s * .025, '#ffdf64', '#c28417', '#a26410', s * .01)
        }
      }
    }
    for (let col = 1; col < cols; col++) {
      line(ctx, x + col * w / cols, y + s * .045, x + col * w / cols, y + h - s * .045, '#a74712', s * .036)
      line(ctx, x + col * w / cols + s * .025, y + s * .06, x + col * w / cols + s * .025, y + h - s * .06, '#ffbc65', s * .018)
    }
  }

  private drawGhosts(): void {
    const ctx = this.ctx
    this.ghosts = this.ghosts.filter(g => this.clock - g.birth < .16)
    if (this.calm) return
    for (const ghost of this.ghosts) {
      const t = clamp((this.clock - ghost.birth) / .16), p = this.centreOf(ghost.cell)
      ctx.save(); ctx.globalAlpha = (1 - t) * .8; ctx.translate(p.x, p.y); ctx.rotate(t * .35)
      sprite(ctx, ghost.piece.power ?? 'colour', 0, 0, this.size * .98 * (1 - t * .7), ghost.piece.colour); ctx.restore()
    }
  }
  private drawEffects(): void {
    const ctx = this.ctx, s = this.size
    this.visuals = this.visuals.filter(v => this.clock - v.birth < v.life)
    this.particles = this.particles.filter(p => this.clock - p.birth < p.life)
    for (const visual of this.visuals) {
      const { event } = visual, t = clamp((this.clock - visual.birth) / visual.life)
      const cell = event.from ?? event.cells[0] ?? 0, p = this.centreOf(cell)
      ctx.save(); ctx.globalAlpha = (1 - t) * (this.calm ? .4 : 1)
      if (this.calm) {
        // Reduced motion communicates the affected tiles without flights, beam
        // sweeps, expanding rings or a full-screen flash.
        for (const target of sample(event.cells, 24)) {
          const q = this.centreOf(target)
          rounded(ctx, q.x - s * .4, q.y - s * .4, s * .8, s * .8, s * .12)
          ctx.fillStyle = event.kind === 'lightball' ? '#f3ceff' : '#fff2a2'; ctx.fill()
        }
        ctx.restore(); continue
      }
      if (event.kind === 'rocket') {
        const horizontal = event.power !== 'rocket-v', reach = clamp(.16 + t * 1.2)
        const positions = event.cells.map(i => this.centreOf(i))
        const coordinates = positions.map(q => horizontal ? q.x : q.y)
        const origin = horizontal ? p.x : p.y
        const lo = Math.min(origin, ...coordinates) - s * .46, hi = Math.max(origin, ...coordinates) + s * .46
        const start = origin + (lo - origin) * reach, end = origin + (hi - origin) * reach
        const wide = s * (.16 * (1 - t) + .04)
        ctx.shadowColor = '#ffcd26'; ctx.shadowBlur = s * .3
        if (horizontal) { line(ctx, start, p.y, end, p.y, '#ffc93d', wide * 2); line(ctx, start, p.y, end, p.y, '#fffad4', wide) }
        else { line(ctx, p.x, start, p.x, end, '#ffc93d', wide * 2); line(ctx, p.x, start, p.x, end, '#fffad4', wide) }
      } else if (event.kind === 'propeller' && event.to !== undefined) {
        const q = this.centreOf(event.to), bend = Math.sin(t * Math.PI) * s * .8
        const x = p.x + (q.x - p.x) * t + bend * .3, y = p.y + (q.y - p.y) * t - bend
        if (!this.calm) {
          ctx.globalAlpha = .45 * (1 - t); ctx.strokeStyle = '#fff6b3'; ctx.lineWidth = s * .045; ctx.setLineDash([s * .08, s * .1]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo((p.x + q.x) / 2, (p.y + q.y) / 2 - s * .8, x, y); ctx.stroke(); ctx.setLineDash([])
        }
        ctx.globalAlpha = 1; ctx.translate(x, y); ctx.rotate(this.calm ? 0 : t * TAU * 3)
        sprite(ctx, 'propeller', 0, 0, s * .9)
      } else if (event.kind === 'lightball') {
        ctx.strokeStyle = '#fff296'; ctx.lineWidth = s * (event.combo ? .055 : .04)
        for (const target of sample(event.cells.filter(i => i !== cell), 40)) {
          const q = this.centreOf(target); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo((p.x + q.x) / 2 + s * .2, (p.y + q.y) / 2 - s * .3, q.x, q.y); ctx.stroke()
          ctx.fillStyle = '#fff8da'; star(ctx, q.x, q.y, s * .08 * (1 - t), t * Math.PI)
        }
        ctx.beginPath(); ctx.arc(p.x, p.y, s * (.4 + t * (event.combo ? 4 : 2.8)), 0, TAU); ctx.strokeStyle = '#f5b5ff'; ctx.lineWidth = s * .1; ctx.stroke()
      } else if (event.kind !== 'shuffle') {
        const extent = event.kind === 'tnt' ? (event.radius ?? 2) + .45 : 1
        ctx.beginPath(); ctx.arc(p.x, p.y, s * (.2 + (1 - Math.pow(1 - t, 2)) * extent), 0, TAU)
        ctx.strokeStyle = '#fff2a2'; ctx.lineWidth = s * .1 * (1 - t); ctx.stroke()
        ctx.fillStyle = '#ffed9930'; ctx.fill()
      }
      ctx.restore()
    }
    for (const p of this.particles) {
      const age = Math.max(0, this.clock - p.birth), t = age / p.life
      ctx.save(); ctx.globalAlpha = clamp(1 - t)
      ctx.fillStyle = p.colour
      star(ctx, p.x + (this.calm ? 0 : p.vx * age), p.y + (this.calm ? 0 : p.vy * age + s * 3 * age * age), p.size * (1 - t * .6), p.spin + (this.calm ? 0 : age * 7)); ctx.restore()
    }
  }
}
