import { makeRng, type Rng } from '../game/rng.ts'
import { SWAP_DURATION, INVALID_SWAP_DURATION, MATCH_CONVERGE_DURATION, POWER_CREATION_DURATION, CLEAR_DURATION, TNT_WINDUP, TNT_FLASH_DURATION, PROPELLER_LIFT_DURATION, LIGHTBALL_CHARGE_DURATION, LIGHTBALL_RAY_DURATION, ROCKET_WINDUP, SUPER_REPEAT_DELAY, fallDuration, propellerDuration, rocketDuration } from './timing.ts'
import { cellPlayable, type Colour, type EffectEvent, type EngineOptions, type GameState, type GoalKind, type LevelDefinition, type ObstacleState, type Piece, type Power, type Tool } from './model.ts'

interface Match { cells: number[]; colour: Colour; power?: Power; centre: number }
type EventInput = Omit<EffectEvent, 'at'>
interface Job { columns: Set<number>; matchUntil?: number; at: number; phase: 'action' | 'impact' | 'clear' | 'fall'; depth: number; action?: () => void; wave?: Wave }
interface Attack { cells: number[]; power: boolean; colour?: Colour; spread: boolean; adjacent: boolean; delay?: number; impact?: EventInput[]; launch?: () => Attack[]; homing?: { from: number; exclude: Set<number>; carry?: Power } }
interface Wave { pending: { at: number; attack: Attack }[]; created: Map<number, Piece>; installed: Set<number>; affected: Set<number>; fired: Set<number>; dynamiteFired: Set<string>; creationReady: number; operations: number }
interface Flight { columns: Set<number>; at: number; from: number; to: number; spread: boolean; exclude: Set<number>; carry?: Power; targetId: string | number | null; attempts: number }
const MAX_CASCADES = 40

/** Target-driven private puzzle. Each pending fall owns only its affected columns. */
export class RoyalEngine {
  readonly state: GameState
  private readonly rng: Rng
  private readonly options: EngineOptions
  private nextId = 1
  private events: EffectEvent[] = []
  private jobs: Job[] = []
  private flights: Flight[] = []
  private clock = 0
  private pendingNestToggles = 0
  get time(): number { return this.clock }
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

  private emit(event: EventInput): void { this.events.push({ ...event, at: this.clock }) }
  private snapshots(cells: Iterable<number>): { cell: number; piece: Piece }[] { return [...cells].flatMap(cell => this.state.pieces[cell] ? [{ cell, piece: { ...this.state.pieces[cell]! } }] : []) }
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
  private matches(preferred: number[] = [], includeLocked = false, allowedColumns?: Set<number>): Match[] {
    const colourAt = (cell: number) => allowedColumns && !allowedColumns.has(cell % this.cols) ? undefined : this.normalColour(cell, includeLocked)
    const shapes: { cells: number[]; colour: Colour; type: 'h' | 'v' | 'square' }[] = []
    for (const type of ['h', 'v'] as const) {
      const outer = type === 'h' ? this.rows : this.cols
      const inner = type === 'h' ? this.cols : this.rows
      for (let a = 0; a < outer; a++) {
        let run: number[] = [], colour: Colour | undefined
        const finish = () => { if (run.length >= 3 && colour !== undefined) shapes.push({ cells: run, colour, type }) }
        for (let b = 0; b <= inner; b++) {
          const cell = type === 'h' ? a * this.cols + b : b * this.cols + a
          const next = b < inner ? colourAt(cell) : undefined
          if (next !== undefined && next === colour) run.push(cell)
          else { finish(); run = next === undefined ? [] : [cell]; colour = next }
        }
      }
    }
    for (let r = 0; r < this.rows - 1; r++) for (let c = 0; c < this.cols - 1; c++) {
      const cell = r * this.cols + c, colour = colourAt(cell)
      const cells = [cell, cell + 1, cell + this.cols, cell + this.cols + 1]
      if (colour !== undefined && cells.every(i => colourAt(i) === colour)) shapes.push({ cells, colour, type: 'square' })
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
  private spendMove(): void { if (!this.options.unlimitedMoves) this.state.moves--; this.state.turn++; this.state.combo = 1; this.pendingNestToggles++ }
  private toggleNests(): void { for (const o of this.state.obstacles) if (o.kind === 'cuckoo') o.open = !o.open }
  private columns(cells: Iterable<number>): Set<number> { return new Set([...cells].filter(i => cellPlayable(this.state.level, i)).map(i => i % this.cols)) }
  private hasColumnConflict(cells: Iterable<number>): boolean { return [...this.columns(cells)].some(c => this.jobs.some(j => j.columns.has(c)) || this.flights.some(f => f.columns.has(c))) }
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

  private makeJob(cells: Iterable<number>, delay: number, action: () => void, depth = 0): Job {
    const job: Job = { columns: this.columns(cells), at: this.clock + delay, phase: 'action', depth, action }
    this.jobs.push(job); this.relock(); return job
  }
  private allCells(): number[] { return this.state.pieces.map((_, i) => i).filter(i => cellPlayable(this.state.level, i)) }
  private windup(powers: Power[]): number {
    return Math.max(...powers.map(p => p === 'propeller' ? PROPELLER_LIFT_DURATION : p === 'tnt' ? TNT_WINDUP : p === 'lightball' ? LIGHTBALL_CHARGE_DURATION : ROCKET_WINDUP))
  }
  private powerFootprint(cell: number, power: Power): number[] {
    return power === 'lightball' ? this.allCells() : power === 'tnt' ? this.radius(cell, 2) : power === 'rocket-h' ? this.row(cell) : power === 'rocket-v' ? this.column(cell) : [cell, ...this.neighbours(cell)]
  }
  private protectedUntil(cells: Iterable<number>, except?: Job): number {
    const columns = this.columns(cells)
    const until = Math.max(this.clock, ...this.jobs.filter(job => job !== except && job.matchUntil && [...job.columns].some(col => columns.has(col))).map(job => job.matchUntil!))
    // The accepted match must run first even if an older blast job is queued at
    // its exact deadline. Keep this margin above the scheduler's 1e-8 tolerance.
    return until > this.clock ? until + 1e-6 : until
  }
  private armActivation(job: Job, event: EventInput, footprint: number[], duration: number, launch: () => void): void {
    const attempt = () => {
      const remaining = this.protectedUntil(footprint, job) - this.clock
      if (remaining > 1e-8) {
        // The protected match may have just started its measured gravity travel.
        // Retain the same artwork while waiting for those accepted pieces to land.
        this.emit({ ...event, duration: remaining })
        job.at = this.clock + remaining; job.action = attempt
      } else launch()
    }
    this.emit({ ...event, duration })
    job.phase = 'action'; job.at = this.clock + duration; job.action = attempt
  }
  private activate(job: Job, cells: number[], powers: Power[], launch: () => Attack[]): void {
    const footprint = cells.flatMap((cell, index) => this.powerFootprint(cell, powers[index] ?? powers[0]!))
    const duration = Math.max(this.windup(powers), this.protectedUntil(footprint, job) - this.clock)
    this.armActivation(job, { kind: 'activate', cells, pieces: this.snapshots(cells), ...(powers.length > 1 ? { combo: 2 } : { power: powers[0]! }) }, footprint, duration, () => this.resolve(job, [], launch(), new Set(cells)))
  }

  swap(a: number, b: number): boolean {
    if (!this.ready(a) || !this.ready(b) || !this.neighbours(a).includes(b)) return false
    const pa = this.state.pieces[a]!, pb = this.state.pieces[b]!
    if ((pa.power || pb.power) && (this.jobs.length || this.flights.length)) return false
    const before = this.snapshots([a, b])
    this.state.pieces[a] = pb; this.state.pieces[b] = pa
    const groups = this.matches([b, a]).filter(g => g.cells.includes(a) || g.cells.includes(b))
    if (!pa.power && !pb.power && (!groups.length || this.hasColumnConflict(this.affectedByMatches(groups)))) {
      this.state.pieces[a] = pa; this.state.pieces[b] = pb
      this.emit({ kind: 'invalid', cells: [a, b], from: a, to: b, pieces: before, duration: INVALID_SWAP_DURATION }); return false
    }
    this.spendMove(); this.emit({ kind: 'swap', cells: [a, b], from: a, to: b, pieces: before, duration: SWAP_DURATION })
    const affected = pa.power || pb.power ? this.allCells() : [...this.affectedByMatches(groups), a, b]
    const job = this.makeJob(affected, SWAP_DURATION, () => {
      if (pa.power && pb.power) this.activate(job, [a, b], [pb.power, pa.power], () => this.comboAttacks(a, b, pb.power!, pa.power!))
      else if (pa.power || pb.power) {
        const cell = pa.power ? b : a, power = (pa.power ?? pb.power)!
        this.activate(job, [cell], [power], () => this.powerAttacks(cell, power, power === 'lightball' ? (pa.power ? pb.colour : pa.colour) : undefined))
      } else {
        // Independent effects can change the board during travel. Resolve only
        // the actual match in this action's reserved columns, never stale cells.
        const arrived = this.matches([b, a], true, job.columns).filter(group => group.cells.includes(a) || group.cells.includes(b))
        if (!arrived.length) {
          if (!this.options.unlimitedMoves) this.state.moves++
          this.state.turn--; this.pendingNestToggles--
        }
        this.resolve(job, arrived)
      }
    })
    if (!pa.power && !pb.power) job.matchUntil = this.clock + SWAP_DURATION + (groups.some(group => group.power) ? POWER_CREATION_DURATION : 0)
    return true
  }

  tap(cell: number): boolean {
    if (!this.ready(cell) || this.jobs.length || this.flights.length) return false
    const power = this.state.pieces[cell]?.power
    if (!power) return false
    this.spendMove()
    const job = this.makeJob(this.allCells(), 0, () => {})
    this.activate(job, [cell], [power], () => this.powerAttacks(cell, power))
    return true
  }

  useTool(tool: Tool, cell?: number): boolean {
    if (this.state.status !== 'playing' || this.jobs.length || this.flights.length) return false
    if (tool === 'shuffle') { this.shuffleBoard(true); return true }
    if (cell === undefined || !cellPlayable(this.state.level, cell)) return false
    const cells = tool === 'arrow' ? this.row(cell) : tool === 'cannon' ? this.column(cell) : [cell]
    const job = this.makeJob(this.allCells(), 0, () => {})
    this.resolve(job, [], [{ cells, power: true, spread: cells.some(i => this.state.jelly[i]), adjacent: false }])
    return true
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
    if (power === 'rocket-h' || power === 'rocket-v') {
      const cells = power === 'rocket-h' ? this.row(cell) : this.column(cell)
      const distance = Math.max(...cells.map(i => Math.abs(i % this.cols - cell % this.cols) + Math.abs(Math.floor(i / this.cols) - Math.floor(cell / this.cols))))
      const duration = rocketDuration(distance)
      const event: EventInput = { kind: 'rocket', cells, from: cell, power }
      this.emit({ ...event, stage: 'launch', duration })
      return [{ ...this.attack(cells, spread), delay: duration, impact: [{ ...event, stage: 'impact', duration: CLEAR_DURATION }] }]
    }
    if (power === 'tnt') {
      const cells = this.radius(cell, 2)
      return [{ ...this.attack(cells, spread), impact: [{ kind: 'tnt', cells, from: cell, power, radius: 2, stage: 'impact', duration: TNT_FLASH_DURATION }] }]
    }
    if (power === 'propeller') {
      const nearby = [cell, ...this.neighbours(cell)]
      return [this.attack(nearby, spread), this.homing(cell, spread, new Set(nearby))]
    }
    const selected = colour ?? this.mostCommon()
    const cells = [cell, ...this.state.pieces.flatMap((p, i) => p?.colour === selected && !p.power ? [i] : [])]
    const event: EventInput = { kind: 'lightball', cells, from: cell, power, colour: selected }
    this.emit({ ...event, stage: 'launch', duration: LIGHTBALL_RAY_DURATION })
    return Array.from({ length: this.options.superLightBall ? 2 : 1 }, (_, repeat) => ({ ...this.attack(cells, spread), delay: LIGHTBALL_RAY_DURATION + repeat * SUPER_REPEAT_DELAY, impact: [{ ...event, stage: 'impact', duration: TNT_FLASH_DURATION }] }))
  }

  private comboAttacks(a: number, b: number, p: Power, q: Power): Attack[] {
    const spread = !!(this.state.jelly[a] || this.state.jelly[b])
    const rocket = (v: Power) => v === 'rocket-h' || v === 'rocket-v'
    if (p === 'lightball' || q === 'lightball') {
      if (p === 'lightball' && q === 'lightball') {
        const cells = this.allCells(), event: EventInput = { kind: 'lightball', cells, from: b, power: 'lightball', combo: 2 }
        this.emit({ ...event, stage: 'launch', duration: LIGHTBALL_RAY_DURATION })
        return Array.from({ length: this.options.superLightBall ? 2 : 1 }, (_, repeat) => ({ ...this.attack(cells, spread), delay: LIGHTBALL_RAY_DURATION + repeat * SUPER_REPEAT_DELAY, impact: [{ ...event, stage: 'impact', duration: TNT_FLASH_DURATION }] }))
      }
      const other = p === 'lightball' ? q : p, colour = this.mostCommon()
      const targets = this.state.pieces.flatMap((piece, i) => piece && !piece.power && piece.colour === colour ? [i] : [])
      this.emit({ kind: 'lightball', cells: [a, b, ...targets], from: p === 'lightball' ? a : b, power: 'lightball', colour, combo: 2, stage: 'launch', duration: LIGHTBALL_RAY_DURATION })
      const attacks: Attack[] = [this.attack([a, b], spread)]
      for (const i of targets) {
        const next: Power = rocket(other) ? (this.rng.int(2) ? 'rocket-h' : 'rocket-v') : other
        for (let repeat = 0; repeat < (this.options.superLightBall ? 2 : 1); repeat++) attacks.push({ cells: [], power: true, adjacent: false, spread, delay: LIGHTBALL_RAY_DURATION + repeat * SUPER_REPEAT_DELAY, launch: () => {
          const duration = this.windup([next])
          this.emit({ kind: 'activate', cells: [i], power: next, pieces: this.snapshots([i]).map(s => ({ cell: s.cell, piece: { ...s.piece, power: next } })), duration })
          return [{ cells: [], power: true, adjacent: false, spread, delay: duration, launch: () => this.powerAttacks(i, next, undefined, spread) }]
        } })
      }
      return attacks
    }
    if (rocket(p) && rocket(q)) {
      const row = this.row(b), column = this.column(b), duration = rocketDuration(Math.max(this.cols, this.rows) / 2)
      const beams: EventInput[] = [{ kind: 'rocket', cells: row, from: b, power: 'rocket-h', combo: 2 }, { kind: 'rocket', cells: column, from: b, power: 'rocket-v', combo: 2 }]
      beams.forEach(event => this.emit({ ...event, stage: 'launch', duration }))
      return [{ ...this.attack([...row, ...column, a], spread), delay: duration, impact: beams.map(event => ({ ...event, stage: 'impact', duration: CLEAR_DURATION })) }]
    }
    if ((rocket(p) && q === 'tnt') || (rocket(q) && p === 'tnt')) {
      const cells = new Set([a, b]), c = b % this.cols, r = Math.floor(b / this.cols), beams: EventInput[] = []
      const duration = rocketDuration(Math.max(this.cols, this.rows) / 2)
      for (let y = Math.max(0, r - 1); y <= Math.min(this.rows - 1, r + 1); y++) {
        const row = this.row(y * this.cols); for (const i of row) cells.add(i)
        if (row.length) beams.push({ kind: 'rocket', cells: row, from: y * this.cols + c, power: 'rocket-h', combo: 2 })
      }
      for (let x = Math.max(0, c - 1); x <= Math.min(this.cols - 1, c + 1); x++) {
        const column = this.column(x); for (const i of column) cells.add(i)
        if (column.length) beams.push({ kind: 'rocket', cells: column, from: r * this.cols + x, power: 'rocket-v', combo: 2 })
      }
      beams.forEach(event => this.emit({ ...event, stage: 'launch', duration }))
      return [{ ...this.attack([...cells], spread), delay: duration, impact: beams.map(event => ({ ...event, stage: 'impact', duration: CLEAR_DURATION })) }]
    }
    if (p === 'tnt' && q === 'tnt') {
      const cells = [...new Set([...this.radius(b, 4), a])]
      return [{ ...this.attack(cells, spread), impact: [{ kind: 'tnt', cells, from: b, power: 'tnt', radius: 4, combo: 2, stage: 'impact', duration: TNT_FLASH_DURATION }] }]
    }
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

  /** Start a resolution wave. Effects are applied at their scheduled impacts. */
  private resolve(job: Job, groups: Match[], extra: Attack[] = [], consumed: Set<number> = new Set()): void {
    const wave: Wave = { pending: [], created: new Map(), installed: new Set(), affected: new Set(), fired: new Set(consumed), dynamiteFired: new Set(), creationReady: this.clock, operations: 0 }
    job.wave = wave; job.phase = 'impact'
    // Cascades can begin before a travelling power expands into their columns.
    // Protect their gathering pieces exactly like an accepted player match.
    if (groups.length) job.matchUntil = Math.max(job.matchUntil ?? 0, this.clock + (groups.some(group => group.power) ? POWER_CREATION_DURATION : 0))
    const consumedPieces = this.snapshots(consumed)
    for (const cell of consumed) { if (this.state.pieces[cell]) { this.state.pieces[cell] = null; wave.affected.add(cell) } }
    if (consumedPieces.length) this.emit({ kind: 'clear', cells: consumedPieces.map(p => p.cell), pieces: consumedPieces, duration: CLEAR_DURATION, combo: this.state.combo })
    for (const group of groups) {
      if (group.power) {
        const createdPiece: Piece = { id: this.nextId++, colour: group.colour, power: group.power }
        wave.created.set(group.centre, createdPiece)
        wave.creationReady = Math.max(wave.creationReady, this.clock + POWER_CREATION_DURATION)
        this.emit({ kind: 'power', cells: [group.centre], to: group.centre, power: group.power, pieces: this.snapshots(group.cells), createdPiece: { ...createdPiece }, duration: POWER_CREATION_DURATION })
      }
      this.enqueue(wave, { cells: group.cells, colour: group.colour, power: false, adjacent: true, spread: group.cells.some(i => this.state.jelly[i]), delay: group.power ? MATCH_CONVERGE_DURATION : 0 })
    }
    for (const attack of extra) this.enqueue(wave, attack)
    for (const col of this.columns([...groups.flatMap(g => g.cells), ...extra.flatMap(a => a.cells)])) job.columns.add(col)
    this.processWave(job)
  }
  private enqueue(wave: Wave, attack: Attack): void { wave.pending.push({ at: this.clock + (attack.delay ?? 0), attack }) }
  private processWave(job: Job): void {
    const wave = job.wave!
    while (wave.pending.some(p => p.at <= this.clock + 1e-8) && wave.operations++ < 2000) {
      const index = wave.pending.findIndex(p => p.at <= this.clock + 1e-8)
      const { attack } = wave.pending.splice(index, 1)[0]!
      if (attack.launch) { for (const next of attack.launch()) this.enqueue(wave, next); continue }
      if (attack.homing) {
        this.launchFlight(attack.homing.from, attack.spread, attack.homing.exclude, attack.homing.carry)
        continue
      }
      this.applyAttack(wave, attack)
    }
    if (wave.operations >= 2000) wave.pending = []
    if (wave.pending.length) {
      job.at = Math.min(...wave.pending.map(p => p.at)); job.phase = 'impact'
      for (const col of this.columns(wave.pending.flatMap(p => p.attack.cells))) job.columns.add(col)
      this.relock(); return
    }
    job.columns = this.columns(wave.affected)
    if (!job.columns.size) { this.jobs.splice(this.jobs.indexOf(job), 1); this.relock(); return }
    job.phase = 'clear'; job.at = Math.max(this.clock + CLEAR_DURATION, wave.creationReady)
    // Impacts arriving during another clear/fall merge their settlement work.
    for (const other of [...this.jobs]) if (other !== job && (other.phase === 'clear' || other.phase === 'fall') && [...other.columns].some(c => job.columns.has(c))) {
      other.columns.forEach(c => job.columns.add(c)); job.at = Math.max(job.at, other.at); job.depth = Math.max(job.depth, other.depth)
      if (other.matchUntil !== undefined) job.matchUntil = Math.max(job.matchUntil ?? 0, other.matchUntil)
      this.jobs.splice(this.jobs.indexOf(other), 1)
    }
    delete job.wave; this.relock()
  }
  private applyAttack(wave: Wave, attack: Attack): void {
    for (const event of attack.impact ?? []) this.emit(event)
    const removed: {cell: number; piece: Piece}[] = [], hit = new Set<string>()
    const cells = [...new Set(attack.cells)].filter(i => cellPlayable(this.state.level, i))
    for (const cell of cells) {
      wave.affected.add(cell)
      if (attack.spread && !this.state.jelly[cell]) { this.state.jelly[cell] = true; this.progress('jelly', 1); this.emit({ kind: 'collect', cells: [cell], duration: CLEAR_DURATION }) }
      const piece = this.state.pieces[cell]
      if (piece && !wave.installed.has(cell)) {
        if (piece.power && !wave.fired.has(cell)) {
          wave.fired.add(cell)
          const power = piece.power, footprint = this.powerFootprint(cell, power), duration = Math.max(this.windup([power]), this.protectedUntil(footprint) - this.clock)
          const chained = this.makeJob(footprint, duration, () => {})
          this.armActivation(chained, { kind: 'activate', cells: [cell], pieces: [{cell, piece: {...piece}}], power }, footprint, duration, () => this.resolve(chained, [], this.powerAttacks(cell, power, undefined, attack.spread || this.state.jelly[cell])))
        }
        if (!piece.power) this.progress('colour', 1, piece.colour)
        removed.push({cell, piece: {...piece}}); this.state.pieces[cell] = null
      }
      const possible = attack.adjacent ? [cell, ...this.neighbours(cell)] : [cell]
      for (const target of possible) {
        const obstacle = this.owner.get(target)
        if (!obstacle || hit.has(obstacle.id)) continue
        hit.add(obstacle.id)
        if (obstacle.kind === 'stone' && !attack.power) continue
        if (obstacle.kind === 'cuckoo' && !obstacle.open) continue
        if (obstacle.kind === 'dynamite' && !attack.power && attack.colour !== obstacle.colour) continue
        if (obstacle.kind === 'dynamite' && wave.dynamiteFired.has(obstacle.id)) continue
        for (const i of obstacle.cells) wave.affected.add(i)
        obstacle.hp--
        this.emit({ kind: 'damage', cells: [...obstacle.cells], duration: CLEAR_DURATION })
        if (obstacle.kind === 'ice' && obstacle.hp > 0 && obstacle.cells.length > 1) {
          const released = obstacle.cells.pop()!; this.owner.delete(released); this.emit({ kind: 'collect', cells: [released], duration: CLEAR_DURATION })
        }
        if (obstacle.hp > 0) continue
        const stock = obstacle.stock ?? 1
        if (obstacle.kind === 'cuckoo' || obstacle.kind === 'dynamite') {
          obstacle.stock = stock - 1; this.progress(obstacle.kind, 1)
          if (obstacle.kind === 'dynamite') {
            wave.dynamiteFired.add(obstacle.id)
            const visible = this.allCells(), from = obstacle.cells[0]!
            this.emit({ kind: 'activate', cells: [...obstacle.cells], duration: TNT_WINDUP })
            this.enqueue(wave, { ...this.attack(visible, attack.spread), delay: TNT_WINDUP, impact: [{ kind: 'lightball', cells: visible, from, stage: 'impact', duration: TNT_FLASH_DURATION }] })
            obstacle.colour = (((obstacle.colour ?? 0) + 1) % Math.min(4, Math.max(3, this.state.level.colours))) as Colour
          }
          if (obstacle.stock > 0) { obstacle.hp = obstacle.initialHp; continue }
        } else this.progress(obstacle.kind === 'gift' ? 'toy' : obstacle.kind, obstacle.kind === 'gift' ? stock : 1)
        this.state.obstacles.splice(this.state.obstacles.indexOf(obstacle), 1)
        for (const i of obstacle.cells) this.owner.delete(i)
        this.emit({ kind: 'collect', cells: [...obstacle.cells], duration: CLEAR_DURATION })
      }
    }
    for (const cell of cells) if (wave.created.has(cell) && !wave.installed.has(cell) && this.free(cell)) {
      this.state.pieces[cell] = wave.created.get(cell)!; wave.installed.add(cell)
    }
    if (removed.length) this.emit({ kind: 'clear', cells: removed.map(p => p.cell), pieces: removed, combo: this.state.combo, duration: CLEAR_DURATION })
  }
  private launchFlight(from: number, spread: boolean, exclude: Set<number>, carry?: Power, attempts = 0, preferred?: number): void {
    const to = preferred ?? this.target(exclude, spread)
    exclude.add(to)
    const distance = Math.hypot(to % this.cols - from % this.cols, Math.floor(to / this.cols) - Math.floor(from / this.cols))
    const duration = propellerDuration(distance)
    const reservedPower = carry ?? this.state.pieces[to]?.power
    const columns = this.columns(reservedPower ? this.powerFootprint(to, reservedPower) : [to])
    const flight: Flight = { columns, at: this.clock + duration, from, to, spread, exclude, targetId: this.owner.get(to)?.id ?? this.state.pieces[to]?.id ?? null, attempts, ...(carry ? {carry} : {}) }
    this.flights.push(flight)
    this.emit({ kind: 'propeller', cells: [from, to], from, to, stage: 'launch', duration, ...(carry ? {carriedPower:carry} : {}) })
    this.relock()
  }
  private arrive(flight: Flight): void {
    this.flights.splice(this.flights.indexOf(flight), 1)
    const owner = this.owner.get(flight.to), piece = this.state.pieces[flight.to]
    const live = flight.targetId === null ? flight.spread && !this.state.jelly[flight.to] : typeof flight.targetId === 'string' ? owner?.id === flight.targetId && (owner.kind !== 'cuckoo' || owner.open) : piece?.id === flight.targetId
    if (!live && flight.attempts < 2 && this.state.goals.some(g => g.remaining > 0)) {
      const moved = typeof flight.targetId === 'number' ? this.state.pieces.findIndex(p => p?.id === flight.targetId) : -1
      this.launchFlight(flight.to, flight.spread, flight.exclude, flight.carry, flight.attempts + 1, moved >= 0 ? moved : undefined)
      return
    }
    this.emit({ kind: 'propeller', cells: [flight.to], from: flight.to, to: flight.to, stage: 'impact', duration: CLEAR_DURATION, ...(flight.carry ? {carriedPower:flight.carry} : {}) })
    const job = this.makeJob(flight.carry ? this.powerFootprint(flight.to, flight.carry) : [flight.to], 0, () => {})
    if (flight.carry) {
      const power = flight.carry, duration = Math.max(this.windup([power]), this.protectedUntil(this.powerFootprint(flight.to, power), job) - this.clock)
      this.armActivation(job, { kind: 'activate', cells: [flight.to], power, pieces: [{cell:flight.to,piece:{id:this.nextId++,colour:0,power}}] }, this.powerFootprint(flight.to, power), duration, () => this.resolve(job, [], this.powerAttacks(flight.to, power, undefined, flight.spread)))
    } else this.resolve(job, [], [this.attack([flight.to], flight.spread)])
    this.relock()
  }

  private relock(): void {
    this.state.locked.clear()
    for (const job of this.jobs) for (const col of job.columns) for (let r = 0; r < this.rows; r++) {
      const cell = r * this.cols + col
      if (cellPlayable(this.state.level, cell)) this.state.locked.add(cell)
    }
    for (const flight of this.flights) for (const col of flight.columns) for (let row = 0; row < this.rows; row++) {
      const cell = row * this.cols + col
      if (cellPlayable(this.state.level, cell)) this.state.locked.add(cell)
    }
  }
  private gravity(columns: Set<number>): number {
    let duration = 0
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
          if (dest !== entry.cell) {
            const fromRow = Math.floor(entry.cell / this.cols), travel = fallDuration(Math.floor(dest / this.cols) - fromRow)
            duration = Math.max(duration, travel)
            this.emit({ kind: 'fall', cells: [dest], from: entry.cell, fromRow, to: dest, pieces: [{cell:dest,piece:{...entry.piece}}], duration: travel })
          }
        }
        const missing = pos + 1, segmentTop = Math.floor(segment[0]! / this.cols)
        while (pos >= 0) {
          const index = pos, dest = segment[pos--]!, piece = this.fresh(), fromRow = segmentTop - missing + index
          this.state.pieces[dest] = piece
          const travel = fallDuration(Math.floor(dest / this.cols) - fromRow)
          duration = Math.max(duration, travel)
          this.emit({ kind: 'fall', cells: [dest], fromRow, to: dest, pieces: [{cell:dest,piece:{...piece}}], duration: travel })
        }
        segment = []
      }
      for (let r = 0; r <= this.rows; r++) {
        const cell = r * this.cols + c
        if (r < this.rows && this.free(cell)) segment.push(cell)
        else drop()
      }
    }
    return duration
  }

  update(dtSeconds: number): void {
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return
    const targetTime = this.clock + dtSeconds
    let guard = 0
    while (this.state.status === 'playing' && guard++ < 4000) {
      const next = Math.min(...this.jobs.map(job => job.at), ...this.flights.map(flight => flight.at))
      if (!Number.isFinite(next) || next > targetTime + 1e-8) break
      this.clock = Math.max(this.clock, next)
      for (const flight of [...this.flights]) if (flight.at <= this.clock + 1e-8) this.arrive(flight)
      for (const job of [...this.jobs]) {
        if (!this.jobs.includes(job) || job.at > this.clock + 1e-8) continue
        if (job.phase === 'action') { const action = job.action; delete job.action; action?.(); continue }
        if (job.phase === 'impact') { this.processWave(job); continue }
        if (job.phase === 'clear') {
          const travel = this.gravity(job.columns)
          job.phase = 'fall'; job.at = this.clock + travel
          if (job.matchUntil !== undefined) job.matchUntil = Math.max(job.matchUntil, job.at)
          continue
        }
        this.jobs.splice(this.jobs.indexOf(job), 1); this.relock()
        const groups = this.matches().filter(g => g.cells.some(i => job.columns.has(i % this.cols)))
        const safe = groups.filter(g => !this.hasColumnConflict(this.affectedByMatches([g])))
        if (safe.length && job.depth < MAX_CASCADES) {
          this.state.combo = Math.min(99, this.state.combo + 1)
          const cascade = this.makeJob(this.affectedByMatches(safe), 0, () => {}, job.depth + 1)
          this.resolve(cascade, safe)
        } else if (safe.length) this.shuffleBoard(false)
      }
      this.relock(); this.finishIfIdle()
    }
    this.clock = targetTime
    this.relock(); this.finishIfIdle()
  }

  private finishIfIdle(): void {
    if (this.jobs.length || this.flights.length || this.state.status !== 'playing') return
    const pending = this.matches()
    if (pending.length && this.state.turn > 0) {
      this.state.combo++
      const cascade = this.makeJob(this.affectedByMatches(pending), 0, () => {})
      this.resolve(cascade, pending); return
    }
    if (this.pendingNestToggles % 2) this.toggleNests()
    this.pendingNestToggles = 0
    if (this.state.goals.every(g => g.remaining <= 0)) {
      this.state.status = 'won'; this.emit({ kind: 'win', cells: this.allCells() }); return
    }
    if (!this.options.unlimitedMoves && this.state.moves <= 0) { this.state.status = 'lost'; this.emit({ kind: 'lose', cells: [] }); return }
    if (!this.hint()) this.shuffleBoard(true)
  }

  hint(): [number, number] | null {
    // Suggest the power itself rather than a neighbouring ordinary piece. This
    // also preserves a jelly-carrying power's floor when it is activated.
    if (!this.jobs.length && !this.flights.length) for (let cell = 0; cell < this.state.pieces.length; cell++) {
      if (!this.state.pieces[cell]?.power) continue
      const partner = this.neighbours(cell).find(i => this.state.pieces[i]?.power)
      return partner === undefined ? [cell, cell] : [cell, partner]
    }
    for (let a = 0; a < this.state.pieces.length; a++) {
      const piece = this.state.pieces[a]
      if (!piece || this.state.locked.has(a)) continue
      if (piece.power && !this.jobs.length && !this.flights.length) return [a, a]
      for (const b of [a + 1, a + this.cols]) {
        if (!this.neighbours(a).includes(b) || !this.state.pieces[b] || this.state.locked.has(b)) continue
        const second = this.state.pieces[b]!
        if (piece.power || second.power) { if (!this.jobs.length && !this.flights.length) return [a, b]; continue }
        this.state.pieces[a] = second; this.state.pieces[b] = piece
        const groups = this.matches().filter(g => g.cells.includes(a) || g.cells.includes(b))
        this.state.pieces[a] = piece; this.state.pieces[b] = second
        if (groups.length && !this.hasColumnConflict(this.affectedByMatches(groups))) return [a, b]
      }
    }
    return null
  }

  private shuffleBoard(emit: boolean): void {
    if (this.jobs.length || this.flights.length) return
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
