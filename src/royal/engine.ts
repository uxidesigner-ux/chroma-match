import { makeRng, type Rng } from '../game/rng.ts'
import { cellPlayable, type Colour, type EffectEvent, type EngineOptions, type GameState, type GoalKind, type LevelDefinition, type ObstacleState, type Piece, type Power, type Tool } from './model.ts'

interface Match { cells: number[]; colour: Colour; power?: Power; centre: number }
interface Job { columns: Set<number>; delay: number; phase: 'fall' | 'scan'; depth: number }
interface Attack { cells: number[]; power: boolean; colour?: Colour; spread: boolean; adjacent: boolean; homing?: { from: number; exclude: Set<number>; carry?: Power } }
const CLEAR_TIME = .16
const FALL_TIME = .18
const MAX_CASCADES = 40

/** Target-driven private puzzle. Each pending fall owns only its affected columns. */
export class RoyalEngine {
  readonly state: GameState
  private readonly rng: Rng
  private readonly options: EngineOptions
  private nextId = 1
  private events: EffectEvent[] = []
  private jobs: Job[] = []
  private owner = new Map<number, ObstacleState>()

  constructor(level: LevelDefinition, options: EngineOptions = {}) {
    this.options = options
    this.rng = makeRng(options.seed ?? level.seed)
    const copy = structuredClone(level)
    this.state = {
      level: copy, pieces: Array.from({ length: copy.cols * copy.rows }, () => null),
      obstacles: copy.obstacles.map(o => ({ ...o, cells: [...o.cells], initialHp: o.hp, stock: o.stock ?? 1, initialStock: o.stock ?? 1, open: o.open ?? true, ...(o.kind === 'dynamite' ? { colour: o.colour ?? 0 as Colour } : {}) })),
      jelly: Array.from({ length: copy.cols * copy.rows }, (_, i) => copy.jelly.includes(i)),
      goals: copy.goals.map(g => ({ ...g, remaining: g.count })), moves: copy.moves,
      status: 'playing', locked: new Set(), turn: 0, combo: 0,
    }
    this.reindex()
    this.fillInitial()
    for (let attempt = 0; attempt < 30 && this.matches().length; attempt++) this.fillInitial()
    for (const fixed of copy.pieces ?? []) {
      if (this.free(fixed.cell)) this.state.pieces[fixed.cell] = { id: this.nextId++, colour: fixed.colour, ...(fixed.power ? { power: fixed.power } : {}) }
    }
    for (const power of options.startingBoosters ?? []) {
      const available = this.state.pieces.flatMap((p, i) => p && !p.power ? [i] : [])
      if (available.length) this.state.pieces[this.rng.pick(available)]!.power = power
    }
    if (!this.hint()) this.shuffleBoard(false)
    this.finishIfIdle()
  }

  private emit(event: EffectEvent): void { this.events.push(event) }
  drainEvents(): EffectEvent[] { const result = this.events; this.events = []; return result }
  private get cols(): number { return this.state.level.cols }
  private get rows(): number { return this.state.level.rows }
  private free(cell: number): boolean { return cellPlayable(this.state.level, cell) && !this.owner.has(cell) }
  private neighbours(cell: number): number[] {
    const c = cell % this.cols, r = Math.floor(cell / this.cols)
    return [c > 0 ? cell - 1 : -1, c + 1 < this.cols ? cell + 1 : -1, r > 0 ? cell - this.cols : -1, r + 1 < this.rows ? cell + this.cols : -1].filter(i => cellPlayable(this.state.level, i))
  }
  private reindex(): void {
    this.owner.clear()
    for (const obstacle of this.state.obstacles) for (const cell of obstacle.cells) this.owner.set(cell, obstacle)
  }
  private fresh(): Piece { return { id: this.nextId++, colour: this.rng.int(Math.min(4, Math.max(3, this.state.level.colours))) as Colour } }
  private fillInitial(): void {
    const { pieces } = this.state
    pieces.fill(null)
    for (let cell = 0; cell < pieces.length; cell++) {
      if (!this.free(cell)) continue
      const c = cell % this.cols, r = Math.floor(cell / this.cols)
      const forbidden = new Set<number>()
      if (c > 1 && pieces[cell - 1] && pieces[cell - 1]?.colour === pieces[cell - 2]?.colour) forbidden.add(pieces[cell - 1]!.colour)
      if (r > 1 && pieces[cell - this.cols] && pieces[cell - this.cols]?.colour === pieces[cell - this.cols * 2]?.colour) forbidden.add(pieces[cell - this.cols]!.colour)
      if (r > 0 && c > 0 && pieces[cell - 1] && pieces[cell - 1]?.colour === pieces[cell - this.cols]?.colour && pieces[cell - 1]?.colour === pieces[cell - this.cols - 1]?.colour) forbidden.add(pieces[cell - 1]!.colour)
      const available = [0, 1, 2, 3].slice(0, Math.max(3, Math.min(4, this.state.level.colours)))
      const palette = available.filter(colour => !forbidden.has(colour))
      pieces[cell] = { id: this.nextId++, colour: this.rng.pick(palette.length ? palette : available) as Colour }
    }
  }

  private normalColour(cell: number, includeLocked = false): Colour | undefined {
    if (!includeLocked && this.state.locked.has(cell)) return undefined
    const piece = this.state.pieces[cell]
    return piece && !piece.power ? piece.colour : undefined
  }

  /** Union overlapping line/square matches, then select one creation per group. */
  private matches(preferred: number[] = [], includeLocked = false): Match[] {
    const shapes: { cells: number[]; colour: Colour; type: 'h' | 'v' | 'square' }[] = []
    for (const type of ['h', 'v'] as const) {
      const outer = type === 'h' ? this.rows : this.cols
      const inner = type === 'h' ? this.cols : this.rows
      for (let a = 0; a < outer; a++) {
        let run: number[] = [], colour: Colour | undefined
        const finish = () => { if (run.length >= 3 && colour !== undefined) shapes.push({ cells: run, colour, type }) }
        for (let b = 0; b <= inner; b++) {
          const cell = type === 'h' ? a * this.cols + b : b * this.cols + a
          const next = b < inner ? this.normalColour(cell, includeLocked) : undefined
          if (next !== undefined && next === colour) run.push(cell)
          else { finish(); run = next === undefined ? [] : [cell]; colour = next }
        }
      }
    }
    for (let r = 0; r < this.rows - 1; r++) for (let c = 0; c < this.cols - 1; c++) {
      const cell = r * this.cols + c, colour = this.normalColour(cell, includeLocked)
      const cells = [cell, cell + 1, cell + this.cols, cell + this.cols + 1]
      if (colour !== undefined && cells.every(i => this.normalColour(i, includeLocked) === colour)) shapes.push({ cells, colour, type: 'square' })
    }
    const groups: typeof shapes[] = []
    for (const shape of shapes) {
      const overlapping = groups.filter(g => g.some(s => s.colour === shape.colour && s.cells.some(i => shape.cells.includes(i))))
      if (!overlapping.length) groups.push([shape])
      else {
        const first = overlapping[0]!
        first.push(shape)
        for (const other of overlapping.slice(1)) { first.push(...other); groups.splice(groups.indexOf(other), 1) }
      }
    }
    return groups.map(group => {
      const cells = [...new Set(group.flatMap(g => g.cells))]
      const line5 = group.find(g => g.type !== 'square' && g.cells.length >= 5)
      const horizontal = group.filter(g => g.type === 'h'), vertical = group.filter(g => g.type === 'v')
      const crossing = horizontal.flatMap(h => vertical.flatMap(v => h.cells.filter(i => v.cells.includes(i))))
      const line4 = group.find(g => g.type !== 'square' && g.cells.length >= 4)
      const power: Power | undefined = line5 ? 'lightball' : crossing.length ? 'tnt' : line4 ? line4.type === 'h' ? 'rocket-h' : 'rocket-v' : group.some(g => g.type === 'square') ? 'propeller' : undefined
      const centre = preferred.find(i => cells.includes(i)) ?? crossing[0] ?? cells[Math.floor(cells.length / 2)]!
      return { cells, colour: group[0]!.colour, centre, ...(power ? { power } : {}) }
    })
  }

  private ready(cell?: number): boolean {
    return this.state.status === 'playing' && (this.options.unlimitedMoves === true || this.state.moves > 0) && (cell === undefined || (this.free(cell) && !!this.state.pieces[cell] && !this.state.locked.has(cell)))
  }
  private spendMove(): void { if (!this.options.unlimitedMoves) this.state.moves--; this.state.turn++; this.state.combo = 1 }
  private toggleNests(): void { for (const o of this.state.obstacles) if (o.kind === 'cuckoo') o.open = !o.open }
  private columns(cells: Iterable<number>): Set<number> { return new Set([...cells].filter(i => cellPlayable(this.state.level, i)).map(i => i % this.cols)) }
  private hasColumnConflict(cells: Iterable<number>): boolean { return [...this.columns(cells)].some(c => this.jobs.some(j => j.columns.has(c))) }
  private affectedByMatches(groups: Match[]): number[] {
    const result = new Set(groups.flatMap(g => g.cells))
    for (const cell of [...result]) for (const n of this.neighbours(cell)) {
      const o = this.owner.get(n)
      if (o) {
        if (o.kind === 'dynamite') return this.state.pieces.map((_, i) => i)
        for (const covered of o.cells) result.add(covered)
      }
    }
    return [...result]
  }

  swap(a: number, b: number): boolean {
    if (!this.ready(a) || !this.ready(b) || !this.neighbours(a).includes(b)) return false
    const pa = this.state.pieces[a]!, pb = this.state.pieces[b]!
    if ((pa.power || pb.power) && this.jobs.length) return false
    this.state.pieces[a] = pb; this.state.pieces[b] = pa
    const groups = this.matches([b, a]).filter(g => g.cells.includes(a) || g.cells.includes(b))
    if (!pa.power && !pb.power && (!groups.length || this.hasColumnConflict(this.affectedByMatches(groups)))) {
      this.state.pieces[a] = pa; this.state.pieces[b] = pb
      this.emit({ kind: 'invalid', cells: [a, b], from: a, to: b }); return false
    }
    this.spendMove(); this.emit({ kind: 'swap', cells: [a, b], from: a, to: b })
    let affected: Set<number>
    if (pa.power && pb.power) affected = this.resolve([], this.comboAttacks(a, b, pb.power, pa.power), new Set([a, b]))
    else if (pa.power || pb.power) {
      const cell = pa.power ? b : a, power = (pa.power ?? pb.power)!
      affected = this.resolve([], this.powerAttacks(cell, power, power === 'lightball' ? (pa.power ? pb.colour : pa.colour) : undefined), new Set([cell]))
    } else affected = this.resolve(groups)
    affected.add(a); affected.add(b)
    this.toggleNests(); this.schedule(affected); return true
  }

  tap(cell: number): boolean {
    if (!this.ready(cell) || this.jobs.length) return false
    const power = this.state.pieces[cell]?.power
    if (!power) return false
    this.spendMove()
    const affected = this.resolve([], this.powerAttacks(cell, power), new Set([cell]))
    affected.add(cell); this.toggleNests(); this.schedule(affected); return true
  }

  useTool(tool: Tool, cell?: number): boolean {
    if (this.state.status !== 'playing' || this.jobs.length) return false
    if (tool === 'shuffle') { this.shuffleBoard(true); return true }
    if (cell === undefined || !cellPlayable(this.state.level, cell)) return false
    let cells: number[]
    if (tool === 'arrow') cells = this.row(cell)
    else if (tool === 'cannon') cells = this.column(cell)
    else cells = [cell]
    const affected = this.resolve([], [{ cells, power: true, spread: cells.some(i => this.state.jelly[i]), adjacent: false }])
    for (const c of cells) affected.add(c)
    this.schedule(affected); return true
  }

  private row(cell: number): number[] { return Array.from({ length: this.cols }, (_, c) => Math.floor(cell / this.cols) * this.cols + c).filter(i => cellPlayable(this.state.level, i)) }
  private column(cell: number): number[] { return Array.from({ length: this.rows }, (_, r) => r * this.cols + cell % this.cols).filter(i => cellPlayable(this.state.level, i)) }
  private radius(cell: number, range: number): number[] {
    const c = cell % this.cols, r = Math.floor(cell / this.cols), result: number[] = []
    for (let y = Math.max(0, r - range); y <= Math.min(this.rows - 1, r + range); y++) for (let x = Math.max(0, c - range); x <= Math.min(this.cols - 1, c + range); x++) {
      const i = y * this.cols + x
      if (cellPlayable(this.state.level, i)) result.push(i)
    }
    return result
  }
  private mostCommon(): Colour {
    const counts = [0, 0, 0, 0]
    for (const p of this.state.pieces) if (p && !p.power) counts[p.colour] = counts[p.colour]! + 1
    return counts.indexOf(Math.max(...counts)) as Colour
  }
  private target(exclude: Set<number> = new Set(), spreadsJelly = false): number {
    const goals = new Set(this.state.goals.filter(g => g.remaining > 0).map(g => g.kind))
    const candidates = this.state.obstacles.filter(o => o.kind !== 'cuckoo' || o.open).flatMap(o => o.cells.slice(0, 1))
    if (spreadsJelly && goals.has('jelly')) for (let i = 0; i < this.state.pieces.length; i++) if (cellPlayable(this.state.level, i) && !this.state.jelly[i]) candidates.push(i)
    const all = this.state.pieces.flatMap((p, i) => p ? [i] : [])
    const available = [...new Set(candidates)].filter(i => !exclude.has(i))
    const fallback = all.filter(i => !exclude.has(i))
    return this.rng.pick(available.length ? available : fallback.length ? fallback : all.length ? all : [0])
  }
  private attack(cells: number[], spread: boolean): Attack { return { cells, power: true, adjacent: false, spread } }
  private homing(from: number, spread: boolean, exclude: Set<number>, carry?: Power): Attack {
    return { cells: [], power: true, adjacent: false, spread, homing: { from, exclude, ...(carry ? { carry } : {}) } }
  }
  private powerAttacks(cell: number, power: Power, colour?: Colour, forcedSpread?: boolean): Attack[] {
    const spread = forcedSpread ?? this.state.jelly[cell] ?? false
    this.emit({ kind: power.startsWith('rocket') ? 'rocket' : power as 'propeller' | 'tnt' | 'lightball', cells: [cell], power })
    if (power === 'rocket-h') return [this.attack(this.row(cell), spread)]
    if (power === 'rocket-v') return [this.attack(this.column(cell), spread)]
    if (power === 'tnt') return [this.attack(this.radius(cell, 2), spread)]
    if (power === 'propeller') {
      const nearby = [cell, ...this.neighbours(cell)]
      return [this.attack(nearby, spread), this.homing(cell, spread, new Set(nearby))]
    }
    const selected = colour ?? this.mostCommon()
    const cells = [cell, ...this.state.pieces.flatMap((p, i) => p?.colour === selected && !p.power ? [i] : [])]
    const result = [this.attack(cells, spread)]
    if (this.options.superLightBall) result.push(this.attack(cells, spread))
    return result
  }

  private comboAttacks(a: number, b: number, p: Power, q: Power): Attack[] {
    const spread = !!(this.state.jelly[a] || this.state.jelly[b])
    const rocket = (v: Power) => v === 'rocket-h' || v === 'rocket-v'
    this.emit({ kind: 'power', cells: [a, b], combo: 2 })
    if (p === 'lightball' || q === 'lightball') {
      if (p === 'lightball' && q === 'lightball') {
        const cells = this.state.pieces.map((_, i) => i).filter(i => cellPlayable(this.state.level, i))
        return Array.from({ length: this.options.superLightBall ? 2 : 1 }, () => this.attack(cells, spread))
      }
      const other = p === 'lightball' ? q : p, colour = this.mostCommon()
      const targets = this.state.pieces.flatMap((piece, i) => piece && !piece.power && piece.colour === colour ? [i] : [])
      const attacks = [this.attack([a, b], spread)]
      for (const i of targets) {
        const next: Power = rocket(other) ? (this.rng.int(2) ? 'rocket-h' : 'rocket-v') : other
        // Converted power-ups are immediately activated once, in this same wave.
        attacks.push(...this.powerAttacks(i, next, undefined, spread))
      }
      if (this.options.superLightBall) attacks.push(...attacks.map(at => ({ ...at, cells: [...at.cells] })))
      return attacks
    }
    if (rocket(p) && rocket(q)) return [this.attack([...this.row(b), ...this.column(b), a], spread)]
    if ((rocket(p) && q === 'tnt') || (rocket(q) && p === 'tnt')) {
      const cells = new Set([a, b]), c = b % this.cols, r = Math.floor(b / this.cols)
      for (let y = Math.max(0, r - 1); y <= Math.min(this.rows - 1, r + 1); y++) for (const i of this.row(y * this.cols)) cells.add(i)
      for (let x = Math.max(0, c - 1); x <= Math.min(this.cols - 1, c + 1); x++) for (const i of this.column(x)) cells.add(i)
      return [this.attack([...cells], spread)]
    }
    if (p === 'tnt' && q === 'tnt') return [this.attack([...this.radius(b, 4), a], spread)]
    const nearby = [a, b, ...this.neighbours(b)]
    if (p === 'propeller' && q === 'propeller') {
      const used = new Set(nearby)
      return [this.attack(nearby, spread), ...Array.from({ length: 3 }, () => this.homing(b, spread, used))]
    }
    const other = p === 'propeller' ? q : p
    return [this.attack(nearby, spread), this.homing(b, spread, new Set(nearby), other)]
  }

  private progress(kind: GoalKind, count: number, colour?: Colour): void {
    for (const goal of this.state.goals) if (goal.kind === kind && (kind !== 'colour' || goal.colour === undefined || goal.colour === colour)) goal.remaining = Math.max(0, goal.remaining - count)
  }

  /** Process all damage from a wave; one attack can hit a multi-cell entity once. */
  private resolve(groups: Match[], extra: Attack[] = [], consumed: Set<number> = new Set()): Set<number> {
    const affected = new Set<number>(), queue: Attack[] = [], created = new Map<number, Piece>()
    const fired = new Set<number>(consumed), removed = new Set<number>(), dynamiteFired = new Set<string>()
    for (const cell of consumed) { if (this.state.pieces[cell]) { this.state.pieces[cell] = null; affected.add(cell); removed.add(cell) } }
    for (const group of groups) {
      const spread = group.cells.some(i => this.state.jelly[i])
      if (group.power) {
        created.set(group.centre, { id: this.nextId++, colour: group.colour, power: group.power })
        this.emit({ kind: 'power', cells: [group.centre], power: group.power })
      }
      queue.push({ cells: group.cells, colour: group.colour, power: false, adjacent: true, spread })
    }
    queue.push(...extra)
    let safety = 0
    while (queue.length && safety++ < 2000) {
      const attack = queue.shift()!, hit = new Set<string>()
      if (attack.homing) {
        const { from, exclude, carry } = attack.homing
        const to = this.target(exclude, attack.spread)
        exclude.add(to)
        this.emit({ kind: 'propeller', cells: [from, to], from, to })
        if (carry) { queue.unshift(...this.powerAttacks(to, carry, undefined, attack.spread)); continue }
        attack.cells = [to]
      }
      const cells = [...new Set(attack.cells)].filter(i => cellPlayable(this.state.level, i))
      for (const cell of cells) {
        affected.add(cell)
        if (attack.spread && !this.state.jelly[cell]) { this.state.jelly[cell] = true; this.progress('jelly', 1); this.emit({ kind: 'collect', cells: [cell] }) }
        const piece = this.state.pieces[cell]
        if (piece && !created.has(cell)) {
          if (piece.power && !fired.has(cell)) { fired.add(cell); queue.push(...this.powerAttacks(cell, piece.power, undefined, attack.spread || this.state.jelly[cell])) }
          if (!piece.power) this.progress('colour', 1, piece.colour)
          this.state.pieces[cell] = null; removed.add(cell)
        } else if (piece && created.has(cell) && !piece.power && !removed.has(cell)) {
          this.progress('colour', 1, piece.colour); removed.add(cell)
        }
        const possible = attack.adjacent ? [cell, ...this.neighbours(cell)] : [cell]
        for (const target of possible) {
          const obstacle = this.owner.get(target)
          if (!obstacle || hit.has(obstacle.id)) continue
          hit.add(obstacle.id)
          if (obstacle.kind === 'stone' && !attack.power) continue
          if (obstacle.kind === 'cuckoo' && !obstacle.open) continue
          if (obstacle.kind === 'dynamite' && !attack.power && attack.colour !== obstacle.colour) continue
          if (obstacle.kind === 'dynamite' && dynamiteFired.has(obstacle.id)) continue
          for (const i of obstacle.cells) affected.add(i)
          obstacle.hp--
          this.emit({ kind: 'damage', cells: [...obstacle.cells] })
          if (obstacle.kind === 'ice' && obstacle.hp > 0 && obstacle.cells.length > 1) {
            const released = obstacle.cells.pop()!
            this.owner.delete(released)
            this.emit({ kind: 'collect', cells: [released] })
          }
          if (obstacle.hp > 0) continue
          const stock = obstacle.stock ?? 1
          if (obstacle.kind === 'cuckoo' || obstacle.kind === 'dynamite') {
            obstacle.stock = stock - 1
            this.progress(obstacle.kind, 1)
            if (obstacle.kind === 'dynamite') {
              dynamiteFired.add(obstacle.id)
              const visible = this.state.pieces.map((_, i) => i).filter(i => cellPlayable(this.state.level, i))
              queue.push(this.attack(visible, attack.spread)); this.emit({ kind: 'lightball', cells: [...obstacle.cells] })
              obstacle.colour = (((obstacle.colour ?? 0) + 1) % Math.min(4, Math.max(3, this.state.level.colours))) as Colour
            }
            if (obstacle.stock > 0) { obstacle.hp = obstacle.initialHp; continue }
          } else this.progress(obstacle.kind === 'gift' ? 'toy' : obstacle.kind, obstacle.kind === 'gift' ? stock : 1)
          this.state.obstacles.splice(this.state.obstacles.indexOf(obstacle), 1)
          for (const i of obstacle.cells) this.owner.delete(i)
          this.emit({ kind: 'collect', cells: [...obstacle.cells] })
        }
      }
    }
    for (const [cell, piece] of created) if (this.free(cell)) { this.state.pieces[cell] = piece; affected.add(cell) }
    if (removed.size) this.emit({ kind: 'clear', cells: [...removed], combo: this.state.combo })
    return affected
  }

  private schedule(cells: Iterable<number>, depth = 0): void {
    const columns = this.columns(cells)
    if (!columns.size) { this.finishIfIdle(); return }
    this.jobs.push({ columns, delay: CLEAR_TIME, phase: 'fall', depth })
    this.relock()
  }
  private relock(): void {
    this.state.locked.clear()
    for (const job of this.jobs) for (const col of job.columns) for (let r = 0; r < this.rows; r++) {
      const cell = r * this.cols + col
      if (cellPlayable(this.state.level, cell)) this.state.locked.add(cell)
    }
  }
  private gravity(columns: Set<number>): void {
    const moved: number[] = []
    for (const c of columns) {
      let segment: number[] = []
      const drop = () => {
        if (!segment.length) return
        const existing = segment.map(i => ({ cell: i, piece: this.state.pieces[i] })).filter((v): v is {cell: number; piece: Piece} => !!v.piece)
        for (const cell of segment) this.state.pieces[cell] = null
        let pos = segment.length - 1
        for (let i = existing.length - 1; i >= 0; i--) {
          const entry = existing[i]!, dest = segment[pos--]!
          this.state.pieces[dest] = entry.piece
          if (dest !== entry.cell) this.emit({ kind: 'fall', cells: [dest], from: entry.cell, to: dest })
        }
        while (pos >= 0) { const dest = segment[pos--]!; this.state.pieces[dest] = this.fresh(); moved.push(dest) }
        segment = []
      }
      for (let r = 0; r <= this.rows; r++) {
        const cell = r * this.cols + c
        if (r < this.rows && this.free(cell)) segment.push(cell)
        else drop()
      }
    }
    if (moved.length) this.emit({ kind: 'fall', cells: moved })
  }

  update(dtSeconds: number): void {
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0 || this.state.status !== 'playing') return
    const dt = Math.min(1, dtSeconds)
    const due = this.jobs.filter(job => { job.delay -= dt; return job.delay <= 0 })
    for (const job of due) {
      if (!this.jobs.includes(job)) continue
      if (job.phase === 'fall') { this.gravity(job.columns); job.phase = 'scan'; job.delay = FALL_TIME; continue }
      this.jobs.splice(this.jobs.indexOf(job), 1); this.relock()
      const groups = this.matches().filter(g => g.cells.some(i => job.columns.has(i % this.cols)))
      const safe = groups.filter(g => !this.hasColumnConflict(this.affectedByMatches([g])))
      if (safe.length && job.depth < MAX_CASCADES) {
        this.state.combo = Math.min(99, this.state.combo + 1)
        const affected = this.resolve(safe)
        this.schedule(affected, job.depth + 1)
      } else if (safe.length) {
        // Bounded cascade recovery preserves obstacles/goals and all placed powerups.
        this.shuffleBoard(false)
      }
    }
    this.relock()
    this.finishIfIdle()
  }

  private finishIfIdle(): void {
    if (this.jobs.length || this.state.status !== 'playing') return
    // Matches crossing previously separate resolving columns are checked once they settle.
    const pending = this.matches()
    if (pending.length && this.state.turn > 0) { this.state.combo++; this.schedule(this.resolve(pending), 0); return }
    if (this.state.goals.every(g => g.remaining <= 0)) { this.state.status = 'won'; this.emit({ kind: 'win', cells: [] }); return }
    if (!this.options.unlimitedMoves && this.state.moves <= 0) { this.state.status = 'lost'; this.emit({ kind: 'lose', cells: [] }); return }
    if (!this.hint()) this.shuffleBoard(true)
  }

  hint(): [number, number] | null {
    // Suggest the power itself rather than a neighbouring ordinary piece. This
    // also preserves a jelly-carrying power's floor when it is activated.
    if (!this.jobs.length) for (let cell = 0; cell < this.state.pieces.length; cell++) {
      if (!this.state.pieces[cell]?.power) continue
      const partner = this.neighbours(cell).find(i => this.state.pieces[i]?.power)
      return partner === undefined ? [cell, cell] : [cell, partner]
    }
    for (let a = 0; a < this.state.pieces.length; a++) {
      const piece = this.state.pieces[a]
      if (!piece || this.state.locked.has(a)) continue
      if (piece.power && !this.jobs.length) return [a, a]
      for (const b of [a + 1, a + this.cols]) {
        if (!this.neighbours(a).includes(b) || !this.state.pieces[b] || this.state.locked.has(b)) continue
        const second = this.state.pieces[b]!
        if (piece.power || second.power) { if (!this.jobs.length) return [a, b]; continue }
        this.state.pieces[a] = second; this.state.pieces[b] = piece
        const groups = this.matches().filter(g => g.cells.includes(a) || g.cells.includes(b))
        this.state.pieces[a] = piece; this.state.pieces[b] = second
        if (groups.length && !this.hasColumnConflict(this.affectedByMatches(groups))) return [a, b]
      }
    }
    return null
  }

  private shuffleBoard(emit: boolean): void {
    if (this.jobs.length) return
    const cells = this.state.pieces.flatMap((piece, cell) => piece && !piece.power ? [cell] : [])
    for (let attempt = 0; attempt < 100; attempt++) {
      for (let i = cells.length - 1; i > 0; i--) {
        const a = cells[i]!, b = cells[this.rng.int(i + 1)]!
        ;[this.state.pieces[a], this.state.pieces[b]] = [this.state.pieces[b]!, this.state.pieces[a]!]
      }
      if (!this.matches().length && this.hint()) { if (emit) this.emit({ kind: 'shuffle', cells }); return }
      if (attempt > 40) for (const cell of cells) this.state.pieces[cell]!.colour = this.fresh().colour
    }
    // Some custom boards have only separated triples: no permutation can create
    // a legal ordinary swap. Finish on a stable pattern, never on free matches.
    const palette = [0, 1, 2, 3].slice(0, Math.max(3, Math.min(4, this.state.level.colours)))
    const offset = this.rng.int(palette.length)
    for (const cell of cells) this.state.pieces[cell]!.colour = palette[(Math.floor(cell / this.cols) + cell % this.cols + offset) % palette.length] as Colour
    if (!this.hint() && cells.length) {
      const origin = cells.find(i => this.state.jelly[i]) ?? cells[0]!
      this.state.pieces[origin]!.power = 'propeller'
    }
    if (emit) this.emit({ kind: 'shuffle', cells })
  }
}
