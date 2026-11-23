import assert from 'node:assert/strict'
import { RoyalEngine } from '../src/royal/engine.ts'

// Optional bounded stress audit: node scripts/audit-royal-motion.mjs
// Drive only the public engine API; never edit the live board to force a race.
const starts = [.50, .58, .64, .70, .76, .82, .88, .94, 1.00]
const powers = ['tnt', 'rocket-h', 'propeller', 'lightball']
let checked = 0, rejected = 0, creations = 0

for (const chain of powers) for (const start of starts) for (let seed = 1; seed <= 200; seed++) {
  const colours = Array.from({ length: 81 }, (_, cell) => (Math.floor(cell / 9) + cell % 9) % 4)
  colours[22] = 0
  const level = {
    version: 1, id: 1, name: 'bounded temporal audit', cols: 9, rows: 9,
    mask: Array(9).fill('111111111'), moves: 20, difficulty: 'normal', colours: 4, seed,
    goals: [{ kind: 'colour', colour: 0, count: 1000 }, { kind: 'stone', count: 1 }],
    obstacles: [{ id: 'target', kind: 'stone', cells: [0], hp: 1 }], jelly: [], provenance: 'custom',
    pieces: colours.map((colour, cell) => ({ cell, colour,
      ...(cell === 79 ? { power: 'propeller' } : cell === 80 ? { power: 'tnt' } : cell === 20 ? { power: chain } : {}),
    })),
  }
  const engine = new RoyalEngine(level, { seed })
  engine.drainEvents()
  assert(engine.swap(79, 80))
  engine.update(start)
  const events = engine.drainEvents()
  if (!engine.swap(13, 12)) { rejected++; continue }
  engine.update(3)
  events.push(...engine.drainEvents())
  for (let step = 0; step < 40 && engine.state.locked.size; step++) {
    engine.update(.5)
    events.push(...engine.drainEvents())
  }
  const context = JSON.stringify({ chain, start, seed })
  const clears = events.filter(event => event.kind === 'clear')
  for (const event of events.filter(event => event.kind === 'power')) {
    creations++
    const deadline = event.at + .15
    for (const original of event.pieces ?? []) {
      const removals = clears.filter(clear => clear.pieces?.some(item => item.piece.id === original.piece.id))
      assert.equal(removals.length, 1, `contributor must clear exactly once: ${context}, cell ${original.cell}`)
      assert(Math.abs(removals[0].at - deadline) < 1e-7,
        `contributor cleared outside its convergence: ${context}, created ${event.at}, cleared ${removals[0].at}`)
    }
  }
  const removed = new Set()
  for (const clear of clears) for (const { piece } of clear.pieces ?? []) {
    assert(!removed.has(piece.id), `duplicate clear ID ${piece.id}: ${context}`)
    removed.add(piece.id)
  }
  assert.equal(engine.state.locked.size, 0, `unsettled: ${context}`)
  const occupied = new Set(engine.state.obstacles.flatMap(obstacle => obstacle.cells))
  assert(engine.state.pieces.every((piece, cell) => piece || occupied.has(cell)), `orphan hole: ${context}`)
  const ids = engine.state.pieces.filter(Boolean).map(piece => piece.id)
  assert.equal(new Set(ids).size, ids.length, `duplicate final ID: ${context}`)
  checked++
}

console.log(JSON.stringify({ checked, rejected, creations,
  result: 'Contributors cleared once at their own convergence; settled occupancy and IDs valid.',
}))
