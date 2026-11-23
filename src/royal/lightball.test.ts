import test from 'node:test'
import assert from 'node:assert/strict'
import { RoyalEngine } from './engine.ts'
import type { Colour, EffectEvent, LevelDefinition, Power } from './model.ts'
import { LIGHTBALL_CHARGE_DURATION, LIGHTBALL_RAY_DURATION, SWAP_DURATION, SUPER_REPEAT_DELAY } from './timing.ts'

function fixture(overrides: Partial<LevelDefinition> = {}, partner?: Power, superLightBall = false): RoyalEngine {
  const level: LevelDefinition = {
    version: 1, id: 1, name: 'Directed lightball', cols: 7, rows: 7, mask: Array(7).fill('1111111'),
    moves: 20, difficulty: 'normal', colours: 4, seed: 341,
    goals: [{ kind: 'colour', colour: 0, count: 1000 }], obstacles: [], jelly: [], provenance: 'custom',
    pieces: Array.from({ length: 49 }, (_, cell) => ({ cell, colour: ((Math.floor(cell / 7) + cell % 7) % 4) as Colour,
      ...(cell === 24 ? { power: 'lightball' as Power } : cell === 25 && partner ? { power: partner } : {}) })), ...overrides,
  }
  const engine = new RoyalEngine(level, { superLightBall })
  engine.drainEvents(); return engine
}
function to(game: RoyalEngine, time: number): EffectEvent[] {
  game.update(Math.max(0, time - game.time)); return game.drainEvents()
}
function launch(events: EffectEvent[]): EffectEvent {
  const result = events.find(event => event.kind === 'lightball' && event.stage === 'launch')
  assert.ok(result?.rays?.length); return result
}

test('a charged lightball destroys every selected block exactly when its own ray arrives', () => {
  const game = fixture(), before = structuredClone(game.state.pieces)
  assert.equal(game.tap(24), true)
  to(game, LIGHTBALL_CHARGE_DURATION - .001)
  assert.deepEqual(game.state.pieces, before, 'charging preserves the full board')
  const beam = launch(to(game, LIGHTBALL_CHARGE_DURATION))
  const targets = before.flatMap((piece, cell) => piece && !piece.power && piece.colour === beam.colour ? [cell] : [])
  assert.equal(beam.from, 24)
  assert.deepEqual(new Set(beam.rays!.map(ray => ray.cell)), new Set(targets))
  assert.equal(beam.pieces?.[0]?.piece.id, before[24]?.id, 'renderer retains the actual emitting sphere')
  assert.ok(beam.duration! <= LIGHTBALL_RAY_DURATION)
  const rays = [...beam.rays!].sort((a, b) => a.delay + a.duration - b.delay - b.duration)
  assert.ok(new Set(rays.map(ray => ray.delay + ray.duration)).size > 3, 'destruction has a travelling sequence')
  for (const ray of rays) {
    const arrival = beam.at + ray.delay + ray.duration
    to(game, arrival - .000001)
    assert.equal(game.state.pieces[ray.cell]?.id, before[ray.cell]?.id, 'destination survives until its ray arrives')
    const events = to(game, arrival)
    assert.equal(game.state.pieces[ray.cell], null)
    const hit = events.find(event => event.kind === 'lightball' && event.stage === 'impact' && event.to === ray.cell)!
    assert.ok(hit); assert.equal(hit.from, 24); assert.ok(Math.abs(hit.at - arrival) < 1e-8)
    const clear = events.find(event => event.kind === 'clear' && event.pieces?.some(item => item.piece.id === before[ray.cell]?.id))!
    assert.ok(clear); assert.equal(clear.at, hit.at)
  }
  for (let cell = 0; cell < before.length; cell++) if (cell !== 24 && !targets.includes(cell)) {
    assert.equal(game.state.pieces[cell]?.id, before[cell]?.id, 'unselected colours remain intact during the volley')
  }
  assert.equal(game.state.moves, 19)
  assert.equal(game.state.turn, 1)
})

test('swapping a lightball uses the neighbouring colour and the sphere destination as its ray origin', () => {
  const game = fixture()
  const picked = game.state.pieces[25]!.colour
  assert.equal(game.swap(24, 25), true)
  const beam = launch(to(game, SWAP_DURATION + LIGHTBALL_CHARGE_DURATION))
  assert.equal(beam.from, 25)
  assert.equal(beam.colour, picked)
  assert.ok(beam.rays!.every(ray => game.state.pieces[ray.cell]?.colour === picked && !game.state.pieces[ray.cell]?.power))
  assert.ok(beam.rays!.some(ray => ray.cell === 24), 'the swapped normal block is still a genuine target')
})

test('conversion rays arrive before child power activation, and all targets receive their rays before child blasts', () => {
  const game = fixture({}, 'tnt')
  assert.equal(game.swap(24, 25), true)
  const beam = launch(to(game, SWAP_DURATION + LIGHTBALL_CHARGE_DURATION))
  const snapshots = structuredClone(game.state.pieces)
  const events: EffectEvent[] = []
  for (const ray of [...beam.rays!].sort((a, b) => a.delay + a.duration - b.delay - b.duration)) {
    const at = beam.at + ray.delay + ray.duration
    events.push(...to(game, at - .000001))
    assert.equal(game.state.pieces[ray.cell]?.id, snapshots[ray.cell]?.id)
    const arrived = to(game, at); events.push(...arrived)
    assert.ok(arrived.some(event => event.kind === 'activate' && event.power === 'tnt' && event.cells.includes(ray.cell)))
    assert.ok(!arrived.some(event => event.kind === 'tnt'), 'conversion contact is not an early TNT blast')
  }
  assert.ok(!events.some(event => event.kind === 'tnt'))
  events.push(...to(game, beam.at + beam.duration! + .1))
  assert.ok(events.some(event => event.kind === 'tnt'))
})

test('double lightball rays hit a multi-cell obstacle once per volley and repeat with a visible second launch', () => {
  const game = fixture({ obstacles: [{ id: 'long-box', kind: 'box', cells: [0, 1, 2], hp: 4 }], goals: [{ kind: 'box', count: 1 }] }, 'lightball', true)
  assert.equal(game.swap(24, 25), true)
  const first = launch(to(game, SWAP_DURATION + LIGHTBALL_CHARGE_DURATION))
  const firstEvents = to(game, first.at + first.duration!)
  assert.equal(firstEvents.filter(event => event.kind === 'damage' && event.cells.includes(0)).length, 1)
  assert.equal(game.state.obstacles[0]!.hp, 3)
  assert.equal(first.sourceHold, SUPER_REPEAT_DELAY)
  const second = launch(to(game, first.at + first.duration! + SUPER_REPEAT_DELAY))
  assert.deepEqual(new Set(second.rays!.map(ray => ray.cell)), new Set([0, 1, 2]), 'repeat rays only target the surviving obstacle, never empty cells')
  const secondEvents = to(game, second.at + second.duration!)
  assert.equal(secondEvents.filter(event => event.kind === 'damage' && event.cells.includes(0)).length, 1)
  assert.equal(game.state.obstacles[0]!.hp, 2)
  assert.equal(second.from, first.from)
  assert.equal(game.state.moves, 19)
})

test('super board clear does not invent another volley when no real targets survive', () => {
  const game = fixture({}, 'lightball', true)
  assert.equal(game.swap(24, 25), true)
  const beam = launch(to(game, SWAP_DURATION + LIGHTBALL_CHARGE_DURATION))
  const events = to(game, beam.at + beam.duration! + SUPER_REPEAT_DELAY)
  assert.equal(beam.sourceHold, undefined)
  assert.equal(events.filter(event => event.kind === 'lightball' && event.stage === 'launch').length, 0)
})

test('super conversion does not recreate power blasts at destinations already destroyed by the first wave', () => {
  const game = fixture({}, 'tnt', true)
  assert.equal(game.swap(24, 25), true)
  const beam = launch(to(game, SWAP_DURATION + LIGHTBALL_CHARGE_DURATION))
  to(game, beam.at + beam.duration! + .1)
  assert.ok(beam.rays!.every(ray => game.state.pieces[ray.cell] === null))
  const events = to(game, beam.at + beam.duration! + .1 + SUPER_REPEAT_DELAY)
  assert.equal(events.filter(event => event.kind === 'lightball' && event.stage === 'launch').length, 0)
})

test('per-target impacts and final state are identical at coarse and fine update sizes', () => {
  const coarse = fixture(), fine = fixture()
  coarse.tap(24); fine.tap(24)
  coarse.update(5)
  for (let i = 0; i < 500; i++) fine.update(.01)
  const signature = (events: EffectEvent[]) => events.filter(event => event.kind === 'lightball' || event.kind === 'clear')
    .map(event => ({ kind: event.kind, at: +event.at.toFixed(7), cells: event.cells, from: event.from, to: event.to, stage: event.stage }))
  assert.deepEqual(signature(coarse.drainEvents()), signature(fine.drainEvents()))
  assert.deepEqual(coarse.state, fine.state)
  assert.equal(coarse.state.locked.size, 0)
})

test('a large double-lightball volley assigns a distinct arrival to every destination within its time budget', () => {
  const game = fixture({ cols: 11, rows: 11, mask: Array(11).fill('11111111111'),
    pieces: Array.from({ length: 121 }, (_, cell) => ({ cell, colour: ((Math.floor(cell / 11) + cell % 11) % 4) as Colour,
      ...([60, 61].includes(cell) ? { power: 'lightball' as Power } : {}) })),
  })
  assert.equal(game.swap(60, 61), true)
  const beam = launch(to(game, SWAP_DURATION + LIGHTBALL_CHARGE_DURATION))
  assert.equal(beam.rays!.length, 120)
  assert.equal(new Set(beam.rays!.map(ray => +(ray.delay + ray.duration).toFixed(8))).size, 120)
  assert.ok(beam.duration! <= LIGHTBALL_RAY_DURATION + 1e-8)
  const events = to(game, beam.at + beam.duration!)
  assert.equal(events.filter(event => event.kind === 'lightball' && event.stage === 'impact').length, 120)
})
