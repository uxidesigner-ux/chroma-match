/**
 * Visible-board audit policy, also importable by browser regression checks.
 * No engine access, future refills, seeded tie prediction, or state mutation.
 * Power footprints are a bounded heuristic; homing ties/random conversions and
 * cascades are intentionally not simulated. This is not an optimal solver.
 */
const goalKind = obstacle => obstacle.kind === 'gift' ? 'toy' : obstacle.kind
const adjacent = (cell, cols, size) => [cell % cols ? cell - 1 : -1, cell % cols < cols - 1 ? cell + 1 : -1, cell - cols, cell + cols].filter(i => i >= 0 && i < size)

function matchedAt(pieces, cell, cols, rows) {
  const colour = pieces[cell]?.power ? undefined : pieces[cell]?.colour
  if (colour === undefined) return { cells: [], creation: 0 }
  const at = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols && !pieces[r * cols + c]?.power ? pieces[r * cols + c]?.colour : undefined
  const r = Math.floor(cell / cols), c = cell % cols, cells = new Set(), lines = []
  for (const [dr, dc] of [[0, 1], [1, 0]]) {
    const line = [cell]
    for (const sign of [-1, 1]) for (let n = 1; at(r + sign * n * dr, c + sign * n * dc) === colour; n++) line.push((r + sign * n * dr) * cols + c + sign * n * dc)
    if (line.length >= 3) { line.forEach(i => cells.add(i)); lines.push(line.length) }
  }
  let square = false
  for (const y of [r - 1, r]) for (const x of [c - 1, c]) if ([at(y, x), at(y + 1, x), at(y, x + 1), at(y + 1, x + 1)].every(v => v === colour)) {
    square = true
    ;[y * cols + x, y * cols + x + 1, (y + 1) * cols + x, (y + 1) * cols + x + 1].forEach(i => cells.add(i))
  }
  return { cells: [...cells], creation: lines.some(n => n >= 5) ? 150 : lines.length > 1 ? 100 : lines.some(n => n >= 4) ? 65 : square ? 80 : 0 }
}

/** Enumerates all immediately legal ordinary swaps and power taps/swaps. */
export function visibleMoves(state) {
  const { cols, rows } = state.level, pieces = [...state.pieces], candidates = []
  for (let a = 0; a < pieces.length; a++) {
    if (!pieces[a]) continue
    if (pieces[a].power) candidates.push({ a, b: a, power: true })
    for (const b of [a % cols < cols - 1 ? a + 1 : -1, a + cols]) {
      if (b < 0 || !pieces[b]) continue
      if (pieces[a].power || pieces[b].power) { candidates.push({ a, b, power: true }); continue }
      ;[pieces[a], pieces[b]] = [pieces[b], pieces[a]]
      const first = matchedAt(pieces, a, cols, rows), second = matchedAt(pieces, b, cols, rows)
      const cells = [...new Set([...first.cells, ...second.cells])]
      if (cells.length) candidates.push({ a, b, power: false, cells, creation: Math.max(first.creation, second.creation) })
      ;[pieces[a], pieces[b]] = [pieces[b], pieces[a]]
    }
  }
  return candidates
}

/** Returns [a,b]; identical cells mean a real power tap. */
export function chooseVisibleMove(state) {
  const candidates = visibleMoves(state)
  if (!candidates.length) return null
  const { cols, rows, mask } = state.level, size = cols * rows
  const all = Array.from({ length: size }, (_, i) => i).filter(i => mask[Math.floor(i / cols)]?.[i % cols] === '1')
  const active = new Set(all), owners = new Map(state.obstacles.flatMap(o => o.cells.map(i => [i, o])))
  const goals = state.goals.filter(g => g.remaining > 0)
  const row = cell => all.filter(i => Math.floor(i / cols) === Math.floor(cell / cols))
  const column = cell => all.filter(i => i % cols === cell % cols)
  const radius = (cell, reach) => all.filter(i => Math.abs(i % cols - cell % cols) <= reach && Math.abs(Math.floor(i / cols) - Math.floor(cell / cols)) <= reach)
  const near = cell => adjacent(cell, cols, size).filter(i => active.has(i))
  const mostCommon = pieces => {
    const counts = [0, 0, 0, 0]
    for (const piece of pieces) if (piece && !piece.power) counts[piece.colour]++
    return counts.indexOf(Math.max(...counts))
  }
  const scoreCells = (cells, pieces, power, spread) => {
    const hit = new Set(), matchedColours = new Map(), touched = new Set(cells)
    for (const cell of cells) {
      const piece = pieces[cell]
      if (piece && !piece.power) matchedColours.set(piece.colour, (matchedColours.get(piece.colour) ?? 0) + 1)
      if (power && owners.has(cell)) hit.add(owners.get(cell))
      if (!power) for (const n of near(cell)) {
        const obstacle = owners.get(n)
        if (obstacle && obstacle.kind !== 'stone' && (obstacle.kind !== 'dynamite' || obstacle.colour === piece?.colour)) hit.add(obstacle)
      }
    }
    let score = cells.length * .12
    for (const goal of goals) {
      let progress = goal.kind === 'colour' ? goal.colour === undefined ? [...matchedColours.values()].reduce((a,b)=>a+b,0) : matchedColours.get(goal.colour) ?? 0
        : goal.kind === 'jelly' && spread ? [...touched].filter(i => !state.jelly[i]).length : 0
      for (const obstacle of hit) {
        if (goalKind(obstacle) !== goal.kind || obstacle.kind === 'cuckoo' && !obstacle.open) continue
        const units = obstacle.kind === 'gift' ? Math.min(obstacle.stock ?? 1, goal.remaining) : 1
        if (obstacle.hp <= 1) progress += units
        else score += 65 * units / obstacle.hp / Math.sqrt(goal.remaining)
        if (obstacle.kind === 'stone') score += 70
        if (obstacle.kind === 'dynamite' && obstacle.hp <= 1) score += 45
      }
      score += Math.min(goal.remaining, progress) * 100 / Math.sqrt(goal.remaining)
      if (progress >= goal.remaining) score += 120
    }
    return score
  }
  let best = -Infinity, chosen = candidates[0]
  for (const candidate of candidates) {
    const { a, b } = candidate, pieces = [...state.pieces]
    if (a !== b) [pieces[a], pieces[b]] = [pieces[b], pieces[a]]
    let score
    if (!candidate.power) score = scoreCells(candidate.cells, pieces, false, candidate.cells.some(i => state.jelly[i])) + candidate.creation
    else {
      const p = pieces[a]?.power, q = pieces[b]?.power, spread = !!(state.jelly[a] || state.jelly[b]), cells = new Set([a, b]), fired = new Set([a, b])
      const homing = (from, carry, count = 1) => {
        const excluded = new Set(cells)
        for (let n = 0; n < count; n++) {
          let target, targetScore = -Infinity
          for (const cell of all) {
            const obstacle = owners.get(cell)
            if (excluded.has(cell) || obstacle?.kind === 'cuckoo' && !obstacle.open || !pieces[cell] && !obstacle && !(spread && !state.jelly[cell])) continue
            const footprint = carry === 'tnt' ? radius(cell, 2) : carry === 'rocket-h' ? row(cell) : carry === 'rocket-v' ? column(cell) : [cell]
            const value = scoreCells(footprint, pieces, true, spread)
            if (value > targetScore) { target = footprint; targetScore = value }
          }
          if (target) for (const cell of target) { cells.add(cell); excluded.add(cell) }
        }
      }
      const addPower = (cell, power, selected) => {
        if (power === 'rocket-h') row(cell).forEach(i => cells.add(i))
        else if (power === 'rocket-v') column(cell).forEach(i => cells.add(i))
        else if (power === 'tnt') radius(cell, 2).forEach(i => cells.add(i))
        else if (power === 'lightball') pieces.forEach((piece, i) => { if (piece && !piece.power && piece.colour === (selected ?? mostCommon(pieces))) cells.add(i) })
        else if (power === 'propeller') { near(cell).forEach(i => cells.add(i)); homing(cell) }
      }
      const rocket = p => p === 'rocket-h' || p === 'rocket-v'
      if (a === b) addPower(a, p)
      else if (p && q) {
        if (p === 'lightball' && q === 'lightball') all.forEach(i => cells.add(i))
        else if (p === 'lightball' || q === 'lightball') {
          const other = p === 'lightball' ? q : p, colour = mostCommon(pieces)
          // Random rocket orientations are unknown. Use the partner's visible
          // orientation as an approximation, never ask the engine/RNG to preview.
          pieces.forEach((piece, cell) => { if (piece && !piece.power && piece.colour === colour) { cells.add(cell); addPower(cell, other) } })
        } else if (rocket(p) && rocket(q)) [...row(b), ...column(b)].forEach(i => cells.add(i))
        else if (p === 'tnt' && q === 'tnt') radius(b, 4).forEach(i => cells.add(i))
        else if (p === 'propeller' || q === 'propeller') { near(b).forEach(i => cells.add(i)); homing(b, p === 'propeller' && q === 'propeller' ? undefined : p === 'propeller' ? q : p, p === 'propeller' && q === 'propeller' ? 3 : 1) }
        else for (const cell of all) if (Math.abs(cell % cols - b % cols) <= 1 || Math.abs(Math.floor(cell / cols) - Math.floor(b / cols)) <= 1) cells.add(cell)
      } else {
        const cell = p ? a : b, other = p ? b : a
        addPower(cell, p ?? q, pieces[other]?.colour)
      }
      for (const cell of cells) if (pieces[cell]?.power && !fired.has(cell)) { fired.add(cell); addPower(cell, pieces[cell].power) }
      score = scoreCells([...cells], pieces, true, spread)
    }
    // Stable tie breaking uses positions/turn only, never the game's seed.
    score += (((a * 37 + b * 101 + state.turn * 29) % 97) / 97) * .001
    if (score > best) { best = score; chosen = candidate }
  }
  return [chosen.a, chosen.b]
}

/** Remaining layer work, separate from goal units (gift stock is not HP). */
export function visibleGoalWork(state) {
  return state.goals.map(goal => ({ kind: goal.kind, ...(goal.colour === undefined ? {} : { colour: goal.colour }), remaining: goal.remaining,
    work: goal.remaining <= 0 ? 0 : goal.kind === 'colour' || goal.kind === 'jelly' ? goal.remaining
      : state.obstacles.filter(o => goalKind(o) === goal.kind).reduce((sum, o) => sum + o.hp + (o.kind === 'cuckoo' || o.kind === 'dynamite' ? Math.max(0, (o.stock ?? 1) - 1) * (o.initialHp ?? o.hp) : 0), 0) }))
}
