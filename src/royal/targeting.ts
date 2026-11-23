import { cellPlayable, type Colour, type GameState, type GoalKind, type ObstacleState, type Power } from './model.ts'

export interface PropellerReservation { cell: number; carry?: Power; spreadsJelly?: boolean }
export interface PropellerTargetOptions {
  exclude?: ReadonlySet<number>
  spreadsJelly?: boolean
  carry?: Power
  /** Destinations already claimed by live flights, in their expected arrival order. */
  reservations?: readonly PropellerReservation[]
}

const goalKey = (kind: GoalKind, colour?: Colour): string => `${kind}:${colour ?? ''}`
const obstacleGoal = (obstacle: ObstacleState): GoalKind => obstacle.kind === 'gift' ? 'toy' : obstacle.kind
const collectable = (obstacle: ObstacleState): boolean => obstacle.kind !== 'cuckoo' || obstacle.open !== false

function footprint(state: GameState, cell: number, power?: Power): number[] {
  const { cols, rows } = state.level, x = cell % cols, y = Math.floor(cell / cols)
  const cells: number[] = []
  if (!power) return cellPlayable(state.level, cell) ? [cell] : []
  if (power === 'lightball') {
    const counts = [0, 0, 0, 0]
    for (const piece of state.pieces) if (piece && !piece.power) counts[piece.colour] = counts[piece.colour]! + 1
    const colour = counts.indexOf(Math.max(...counts))
    return [cell, ...state.pieces.flatMap((piece, index) => piece && !piece.power && piece.colour === colour ? [index] : [])]
  }
  const radius = power === 'tnt' ? 2 : power === 'propeller' ? 1 : 0
  const minRow = power === 'rocket-v' ? 0 : Math.max(0, y - radius)
  const maxRow = power === 'rocket-v' ? rows - 1 : Math.min(rows - 1, y + radius)
  const minCol = power === 'rocket-h' ? 0 : Math.max(0, x - radius)
  const maxCol = power === 'rocket-h' ? cols - 1 : Math.min(cols - 1, x + radius)
  for (let row = minRow; row <= maxRow; row++) for (let col = minCol; col <= maxCol; col++) {
    const included = power !== 'propeller' || Math.abs(col - x) + Math.abs(row - y) <= 1
    const index = row * cols + col
    if (included && cellPlayable(state.level, index)) cells.push(index)
  }
  return cells
}

/** Includes deterministic power chains, but deliberately does not predict random refills or later homing. */
function affectedCells(state: GameState, cell: number, power?: Power, removed?: ReadonlySet<number>): Set<number> {
  const result = new Set(footprint(state, cell, power)), fired = new Set<number>()
  for (const index of result) {
    const chained = state.pieces[index]?.power
    if (!chained || fired.has(index) || removed?.has(index)) continue
    fired.add(index)
    for (const extra of footprint(state, index, chained)) result.add(extra)
  }
  return result
}

interface Projection {
  hp: Map<string, number>
  stock: Map<string, number>
  remaining: Map<string, number>
  removed: Set<number>
  jelly: Set<number>
  reserved: Set<number>
}

function pendingState(state: GameState, owners: Map<number, ObstacleState>, reservations: readonly PropellerReservation[]): Projection {
  const result: Projection = {
    hp: new Map(state.obstacles.map(obstacle => [obstacle.id, obstacle.hp])),
    stock: new Map(state.obstacles.map(obstacle => [obstacle.id, obstacle.stock ?? 1])),
    remaining: new Map(), removed: new Set(), jelly: new Set(), reserved: new Set(),
  }
  for (const goal of state.goals) {
    const key = goalKey(goal.kind, goal.colour)
    // Progress updates every matching goal, so the largest remaining duplicate is sufficient.
    result.remaining.set(key, Math.max(result.remaining.get(key) ?? 0, goal.remaining))
  }
  const progress = (key: string, count: number) => result.remaining.set(key, Math.max(0, (result.remaining.get(key) ?? 0) - count))
  for (const reservation of reservations) {
    const hit = new Set<string>()
    result.reserved.add(reservation.cell)
    const destination = owners.get(reservation.cell)
    // A flyer whose destination disappears will re-target. Do not predict an
    // extra blast at its abandoned cell, or count an already-consumed power twice.
    if (destination ? (result.stock.get(destination.id) ?? 0) <= 0
      : state.pieces[reservation.cell] ? result.removed.has(reservation.cell) : result.jelly.has(reservation.cell)) continue
    for (const cell of affectedCells(state, reservation.cell, reservation.carry, result.removed)) {
      if (reservation.spreadsJelly && !state.jelly[cell] && !result.jelly.has(cell)) {
        result.jelly.add(cell); progress(goalKey('jelly'), 1)
      }
      const piece = state.pieces[cell]
      if (piece && !result.removed.has(cell)) {
        result.removed.add(cell)
        if (!piece.power) { progress(goalKey('colour', piece.colour), 1); progress(goalKey('colour'), 1) }
      }
      const obstacle = owners.get(cell)
      if (!obstacle || hit.has(obstacle.id) || !collectable(obstacle) || (result.stock.get(obstacle.id) ?? 0) <= 0) continue
      hit.add(obstacle.id)
      const hp = (result.hp.get(obstacle.id) ?? obstacle.hp) - 1
      result.hp.set(obstacle.id, hp)
      if (hp > 0) continue
      const stock = result.stock.get(obstacle.id) ?? 1
      progress(goalKey(obstacleGoal(obstacle)), obstacle.kind === 'gift' ? stock : 1)
      if ((obstacle.kind === 'cuckoo' || obstacle.kind === 'dynamite') && stock > 1) {
        result.stock.set(obstacle.id, stock - 1); result.hp.set(obstacle.id, obstacle.initialHp)
      } else result.stock.set(obstacle.id, 0)
    }
  }
  return result
}

/**
 * Returns tied best destinations; the engine supplies its seeded tie-breaker.
 * This is a bounded objective heuristic, not a proof of an optimal winning move.
 * Reserved damage is projected before scoring to avoid wasting several flyers on
 * the same last layer. Partial layers still count when they advance a live goal.
 */
export function propellerTargets(state: GameState, options: PropellerTargetOptions = {}): number[] {
  const owners = new Map<number, ObstacleState>()
  for (const obstacle of state.obstacles) for (const cell of obstacle.cells) owners.set(cell, obstacle)
  const pending = pendingState(state, owners, options.reservations ?? [])
  const jellyGoal = (pending.remaining.get(goalKey('jelly')) ?? 0) > 0
  const candidates = state.pieces.flatMap((piece, cell) => {
    if (!cellPlayable(state.level, cell)) return []
    const obstacle = owners.get(cell)
    if (obstacle && !collectable(obstacle)) return []
    return piece || obstacle || options.spreadsJelly && jellyGoal && !state.jelly[cell] ? [cell] : []
  })
  const outside = candidates.filter(cell => !options.exclude?.has(cell))
  // Only reuse a launch-neighbourhood cell if it is the sole surviving valid target.
  const available = outside.length ? outside : candidates
  let best = -Infinity, bestSecondary = -Infinity
  const targets: number[] = []
  for (const cell of available) {
    const footprint = affectedCells(state, cell, options.carry, pending.removed), hit = new Set<string>()
    const progress = new Map<string, number>(), preparation = new Map<string, number>()
    const add = (map: Map<string, number>, key: string, value: number) => map.set(key, (map.get(key) ?? 0) + value)
    let score = 0, secondary = 0
    for (const affected of footprint) {
      if (options.spreadsJelly && !state.jelly[affected] && !pending.jelly.has(affected)) add(progress, goalKey('jelly'), 1)
      const piece = state.pieces[affected]
      if (piece && !pending.removed.has(affected)) {
        if (!piece.power) { add(progress, goalKey('colour', piece.colour), 1); add(progress, goalKey('colour'), 1) }
        secondary += piece.power ? 2 : .1
      }
      const obstacle = owners.get(affected)
      if (!obstacle || hit.has(obstacle.id) || !collectable(obstacle) || (pending.stock.get(obstacle.id) ?? 0) <= 0) continue
      hit.add(obstacle.id)
      const hp = pending.hp.get(obstacle.id) ?? obstacle.hp, stock = pending.stock.get(obstacle.id) ?? 1
      const key = goalKey(obstacleGoal(obstacle)), remaining = pending.remaining.get(key) ?? 0
      if (hp <= 1) add(progress, key, obstacle.kind === 'gift' ? stock : 1)
      else if (remaining > 0) {
        // Layer work is useful but finishing a goal remains more valuable. Gifts
        // account for their actual toy yield, capped by what the stage still needs.
        const units = obstacle.kind === 'gift' ? Math.min(stock, remaining) : 1
        add(preparation, key, 65 * units / hp / Math.sqrt(remaining))
      }
      if (remaining > 0 && obstacle.kind === 'stone') score += 85 // Only power hits can advance stone.
      if (remaining > 0 && obstacle.kind === 'dynamite' && hp <= 1) score += 30 // Its triggered board hit is additional value.
      secondary += hp <= 1 ? 3 : 1 // Board space is a tie-breaker, never a replacement for objective utility.
    }
    for (const [key, amount] of progress) {
      const remaining = pending.remaining.get(key) ?? 0, units = Math.min(remaining, amount)
      if (units <= 0) continue
      score += units * 100 / Math.sqrt(remaining)
      if (amount >= remaining) score += 180
    }
    for (const [key, value] of preparation) if ((pending.remaining.get(key) ?? 0) > 0) score += Math.min(150, value)
    const owner = owners.get(cell)
    const consumedDestination = owner ? (pending.stock.get(owner.id) ?? 0) <= 0 : !!state.pieces[cell] && pending.removed.has(cell)
    if (consumedDestination || !owner && !state.pieces[cell] && pending.jelly.has(cell)) score -= 100_000
    else {
      if (pending.reserved.has(cell) || owner && (options.reservations ?? []).some(flight => owners.get(flight.cell)?.id === owner.id)) secondary -= 2
      const piece = state.pieces[cell]
      const directGoal = owner ? (pending.remaining.get(goalKey(obstacleGoal(owner))) ?? 0) > 0
        : piece && !piece.power && ((pending.remaining.get(goalKey('colour', piece.colour)) ?? 0) > 0 || (pending.remaining.get(goalKey('colour')) ?? 0) > 0)
      if (directGoal || options.spreadsJelly && jellyGoal && !state.jelly[cell] && !pending.jelly.has(cell)) secondary += 5
    }
    const sameObjective = Math.abs(score - best) <= 1e-6
    if (score > best + 1e-6 || sameObjective && secondary > bestSecondary + 1e-6) {
      best = score; bestSecondary = secondary; targets.length = 0; targets.push(cell)
    } else if (sameObjective && Math.abs(secondary - bestSecondary) <= 1e-6) targets.push(cell)
  }
  return targets
}
