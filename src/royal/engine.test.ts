import test from 'node:test'
import assert from 'node:assert/strict'
import { RoyalEngine } from './engine.ts'
import { SWAP_DURATION, MATCH_CONVERGE_DURATION, POWER_CREATION_DURATION, CLEAR_DURATION, TNT_WINDUP, PROPELLER_LIFT_DURATION, LIGHTBALL_CHARGE_DURATION, LIGHTBALL_RAY_DURATION, ROCKET_WINDUP, SUPER_REPEAT_DELAY, fallDuration, rocketDuration } from './timing.ts'
import type { Colour, EffectEvent, LevelDefinition, ObstacleDefinition, Power } from './model.ts'

function level(overrides: Partial<LevelDefinition> = {}): LevelDefinition {
  return { version: 1, id: 1, name: 'Test garden', cols: 7, rows: 7, mask: Array(7).fill('1111111'), moves: 20, difficulty: 'normal', colours: 4, seed: 341, goals: [{ kind: 'colour', colour: 0, count: 9999 }], obstacles: [], jelly: [], provenance: 'custom', ...overrides }
}
function fixture(overrides: Partial<LevelDefinition> = {}): RoyalEngine {
  const game = new RoyalEngine(level(overrides))
  for (let i = 0; i < game.state.pieces.length; i++) if (game.state.pieces[i]) game.state.pieces[i] = { id: i + 1000, colour: ((Math.floor(i / game.state.level.cols) + i % game.state.level.cols) % 4) as Colour }
  game.drainEvents(); return game
}
function colour(game: RoyalEngine, cell: number, value: Colour): void { game.state.pieces[cell] = { id: cell + 1000, colour: value } }
function power(game: RoyalEngine, cell: number, value: Power): void { game.state.pieces[cell] = { id: cell + 1000, colour: 0, power: value } }
function settle(game: RoyalEngine): void {
  for (let i = 0; i < 3000 && game.state.locked.size && game.state.status === 'playing'; i++) game.update(.2)
  assert.equal(game.state.locked.size, 0, 'cascade must eventually settle')
}
function advanceTo(game: RoyalEngine, time: number): void { game.update(Math.max(0, time - game.time) + 1e-7) }
function cleared(events: EffectEvent[]): Set<number> { return new Set(events.filter(e => e.kind === 'clear').flatMap(e => e.cells)) }
function windup(power: Power): number { return power === 'propeller' ? PROPELLER_LIFT_DURATION : power === 'tnt' ? TNT_WINDUP : power === 'lightball' ? LIGHTBALL_CHARGE_DURATION : ROCKET_WINDUP }
function obstacle(kind: ObstacleDefinition['kind'], cells: number[], hp: number, extra: Partial<ObstacleDefinition> = {}): ObstacleDefinition {
  return { id: 'obstacle', kind, cells, hp, ...extra }
}

test('same seed reproduces a playable initial board without automatic scoring goals', () => {
  const a = new RoyalEngine(level()), b = new RoyalEngine(level())
  assert.deepEqual(a.state.pieces, b.state.pieces)
  assert.ok(a.hint())
  assert.deepEqual(a.state.goals, [{ kind: 'colour', colour: 0, count: 9999, remaining: 9999 }])
})

test('invalid and non-adjacent swaps preserve pieces and move budget', () => {
  const game = fixture(), before = structuredClone(game.state.pieces)
  assert.equal(game.swap(0, 48), false)
  assert.equal(game.swap(0, 1), false)
  assert.deepEqual(game.state.pieces, before)
  assert.equal(game.state.moves, 20)
})

for (const [name, cells, destination, source, expected] of [
  ['four in a row', [14, 15, 16, 17], 16, 9, 'rocket-h'],
  ['five in a row', [14, 15, 16, 17, 18], 16, 9, 'lightball'],
  ['L / T intersection', [15, 16, 17, 23, 30], 16, 9, 'tnt'],
  ['two by two', [15, 16, 22, 23], 23, 24, 'propeller'],
] as const) {
  test(`${name} creates ${expected} at the swap destination`, () => {
    const game = fixture()
    for (const i of cells) colour(game, i, 0)
    colour(game, destination, 1); colour(game, source, 0)
    // Isolate the intended line from the next default block.
    if (name === 'four in a row') colour(game, 18, 2)
    assert.equal(game.swap(source, destination), true)
    assert.equal(game.state.pieces[destination]?.power, undefined, 'swap starts before power creation')
    advanceTo(game, SWAP_DURATION + MATCH_CONVERGE_DURATION)
    assert.equal(game.state.pieces[destination]?.power, expected)
    assert.equal(game.state.moves, 19)
    settle(game)
  })
}

test('one match touching two cells of a gift damages its shared HP only once', () => {
  const game = fixture({ obstacles: [obstacle('gift', [22, 23], 4, { stock: 2 })], goals: [{ kind: 'toy', count: 2 }] })
  colour(game, 15, 0); colour(game, 16, 1); colour(game, 17, 0); colour(game, 9, 0)
  assert.equal(game.swap(9, 16), true)
  advanceTo(game, SWAP_DURATION)
  assert.equal(game.state.obstacles[0]!.hp, 3)
  assert.equal(game.state.goals[0]!.remaining, 2)
})

test('gift yields its configured toy stock and a last-target tool wins without spending moves', () => {
  const game = fixture({ obstacles: [obstacle('gift', [22, 23], 1, { stock: 2 })], goals: [{ kind: 'toy', count: 2 }] })
  assert.equal(game.useTool('hammer', 22), true)
  assert.equal(game.state.obstacles.length, 0)
  assert.equal(game.state.goals[0]!.remaining, 0)
  assert.equal(game.state.moves, 20)
  settle(game)
  assert.equal(game.state.status, 'won')
})

test('adjacent ordinary match damages ice but cannot damage stone', () => {
  for (const kind of ['ice', 'stone'] as const) {
    const game = fixture({ obstacles: [obstacle(kind, [23], 3)], goals: [{ kind, count: 1 }] })
    colour(game, 15, 0); colour(game, 16, 1); colour(game, 17, 0); colour(game, 9, 0)
    assert.equal(game.swap(9, 16), true)
    advanceTo(game, SWAP_DURATION)
    assert.equal(game.state.obstacles[0]!.hp, kind === 'ice' ? 2 : 3)
  }
})

test('stone requires three separate power hits and never completes at the first layer', () => {
  const game = fixture({ obstacles: [obstacle('stone', [23], 3)], goals: [{ kind: 'stone', count: 1 }] })
  for (let n = 0; n < 3; n++) {
    assert.equal(game.useTool('hammer', 23), true)
    assert.equal(game.state.goals[0]!.remaining, n === 2 ? 0 : 1)
    settle(game)
  }
  assert.equal(game.state.status, 'won')
})

test('jelly spreads from an existing floor across a match and counts only newly covered cells', () => {
  const game = fixture({ jelly: [15], goals: [{ kind: 'jelly', count: 48 }] })
  colour(game, 15, 0); colour(game, 16, 1); colour(game, 17, 0); colour(game, 9, 0)
  assert.equal(game.swap(9, 16), true)
  advanceTo(game, SWAP_DURATION)
  assert.ok(game.state.jelly[15] && game.state.jelly[16] && game.state.jelly[17])
  assert.equal(game.state.goals[0]!.remaining, 46)
})

test('arrow clears a row and cannon clears a column without move cost', () => {
  for (const tool of ['arrow', 'cannon'] as const) {
    const game = fixture()
    assert.equal(game.useTool(tool, 24), true)
    for (let n = 0; n < 7; n++) assert.equal(game.state.pieces[tool === 'arrow' ? 21 + n : n * 7 + 3], null)
    assert.equal(game.state.moves, 20)
    settle(game)
  }
})

test('cuckoo collects only while open, and a valid move toggles its state once', () => {
  const game = fixture({ obstacles: [obstacle('cuckoo', [23], 1, { stock: 2, open: false })], goals: [{ kind: 'cuckoo', count: 2 }] })
  colour(game, 15, 0); colour(game, 16, 1); colour(game, 17, 0); colour(game, 9, 0)
  assert.equal(game.swap(9, 16), true)
  assert.equal(game.state.obstacles[0]!.stock, 2)
  assert.equal(game.state.obstacles[0]!.open, false, 'pending move keeps the nest state through its impacts')
  settle(game)
  assert.equal(game.state.obstacles[0]!.open, true)
  assert.equal(game.useTool('hammer', 23), true)
  assert.equal(game.state.goals[0]!.remaining, 1)
  assert.equal(game.state.obstacles[0]!.open, true, 'free tools do not toggle turn state')
})

test('dynamite rejects wrong-colour adjacency and a matching colour triggers one global wave', () => {
  for (const targetColour of [0, 1] as const) {
    const game = fixture({ obstacles: [obstacle('dynamite', [22, 23, 29, 30], 1, { stock: 8, colour: targetColour })], goals: [{ kind: 'dynamite', count: 8 }] })
    colour(game, 15, 0); colour(game, 16, 1); colour(game, 17, 0); colour(game, 9, 0)
    assert.equal(game.swap(9, 16), true)
    advanceTo(game, SWAP_DURATION)
    assert.equal(game.state.obstacles[0]!.stock, targetColour === 0 ? 7 : 8)
    assert.equal(game.state.goals[0]!.remaining, targetColour === 0 ? 7 : 8)
    if (targetColour === 0) {
      advanceTo(game, SWAP_DURATION + TNT_WINDUP)
      assert.equal(game.state.pieces.filter(Boolean).length, 0)
    }
  }
})

const combinations: [Power, Power][] = [
  ['rocket-h', 'rocket-v'], ['rocket-h', 'tnt'], ['tnt', 'tnt'], ['propeller', 'propeller'],
  ['propeller', 'rocket-h'], ['propeller', 'tnt'], ['lightball', 'rocket-h'], ['lightball', 'tnt'],
  ['lightball', 'propeller'], ['lightball', 'lightball'],
]
for (const [a, b] of combinations) test(`${a} + ${b} consumes both powers, spends one move and resolves`, () => {
  const game = fixture()
  power(game, 23, a); power(game, 24, b)
  assert.equal(game.swap(23, 24), true)
  advanceTo(game, SWAP_DURATION + Math.max(windup(a), windup(b)))
  assert.equal(game.state.pieces[23], null)
  assert.equal(game.state.pieces[24], null)
  assert.equal(game.state.moves, 19)
  const events = game.drainEvents()
  assert.ok(events.some(e => e.kind === 'activate' && e.combo === 2))
  settle(game)
  assert.ok(game.state.pieces.every((p, i) => p || !game.state.level.mask[Math.floor(i / 7)]?.[i % 7]))
})

test('lightball + lightball removes exactly one obstacle layer in the initial wave', () => {
  const game = fixture({ obstacles: [obstacle('box', [0, 1], 3)], goals: [{ kind: 'box', count: 1 }] })
  power(game, 23, 'lightball'); power(game, 24, 'lightball')
  assert.equal(game.swap(23, 24), true)
  advanceTo(game, SWAP_DURATION + LIGHTBALL_CHARGE_DURATION + LIGHTBALL_RAY_DURATION)
  assert.equal(game.state.obstacles[0]!.hp, 2)
})

test('super lightball pair removes two layers, normal pair one', () => {
  const game = new RoyalEngine(level({ obstacles: [obstacle('box', [0, 1], 3)] }), { superLightBall: true })
  power(game, 23, 'lightball'); power(game, 24, 'lightball')
  assert.equal(game.swap(23, 24), true)
  advanceTo(game, SWAP_DURATION + LIGHTBALL_CHARGE_DURATION + LIGHTBALL_RAY_DURATION + SUPER_REPEAT_DELAY)
  assert.equal(game.state.obstacles[0]!.hp, 1)
})

test('last move wins after cascades settle before evaluating failure', () => {
  const game = fixture({ moves: 1, goals: [{ kind: 'colour', colour: 0, count: 3 }] })
  colour(game, 15, 0); colour(game, 16, 1); colour(game, 17, 0); colour(game, 9, 0)
  assert.equal(game.swap(9, 16), true)
  assert.equal(game.state.moves, 0)
  assert.equal(game.state.status, 'playing')
  assert.equal(game.swap(40, 41), false)
  settle(game)
  assert.equal(game.state.status, 'won')
})

test('last move loses only after an unfinished goal has settled', () => {
  const game = fixture({ moves: 1 })
  power(game, 24, 'tnt')
  assert.equal(game.tap(24), true)
  assert.equal(game.state.status, 'playing')
  settle(game)
  assert.equal(game.state.status, 'lost')
  assert.equal(game.useTool('hammer', 0), false)
})

test('stable independent columns accept a second swap while the first region resolves', () => {
  const game = fixture({ cols: 9, rows: 7, mask: Array(7).fill('111111111') })
  // Two vertical matches in disjoint column pairs.
  for (const i of [9, 18, 27, 19]) colour(game, i, 0)
  colour(game, 18, 1)
  for (const i of [16, 25, 34, 26]) colour(game, i, 2)
  colour(game, 25, 1)
  assert.equal(game.swap(19, 18), true)
  assert.ok(game.state.locked.has(18))
  assert.equal(game.swap(18, 19), false)
  assert.equal(game.state.locked.has(25), false)
  assert.equal(game.swap(26, 25), true)
  assert.equal(game.state.moves, 18)
  settle(game)
})

test('gravity preserves separated void segments and obstacle occupancy', () => {
  const game = fixture({ mask: ['1111111', '1111111', '1101111', '1111111', '1111111', '1111111', '1111111'], obstacles: [obstacle('stone', [31], 3)] })
  game.useTool('cannon', 2)
  settle(game)
  assert.equal(game.state.pieces[16], null)
  assert.equal(game.state.pieces[31], null)
  for (const cell of [2, 9, 23, 30, 37, 44]) assert.ok(game.state.pieces[cell])
})

test('shuffle preserves powers and obstacle layers and leaves a legal move', () => {
  const game = fixture({ obstacles: [obstacle('gift', [22, 23], 4)] })
  power(game, 3, 'lightball')
  assert.equal(game.useTool('shuffle'), true)
  assert.equal(game.state.pieces[3]?.power, 'lightball')
  assert.equal(game.state.obstacles[0]!.hp, 4)
  assert.equal(game.state.moves, 20)
  assert.ok(game.hint())
})

test('unlimited moves stays playable after repeated accepted moves', () => {
  const game = new RoyalEngine(level({ moves: 1 }), { unlimitedMoves: true })
  for (let i = 0; i < 10; i++) {
    const hint = game.hint()!
    assert.ok(hint)
    assert.equal(hint[0] === hint[1] ? game.tap(hint[0]) : game.swap(...hint), true)
    settle(game)
  }
  assert.equal(game.state.moves, 1)
  assert.equal(game.state.status, 'playing')
})

test('long ice releases one occupied cell per hit before its object goal is completed', () => {
  const game = fixture({ obstacles: [obstacle('ice', [8, 15, 22], 3)], goals: [{ kind: 'ice', count: 1 }] })
  assert.equal(game.useTool('hammer', 8), true)
  assert.deepEqual(game.state.obstacles[0]!.cells, [8, 15])
  assert.equal(game.state.goals[0]!.remaining, 1)
  settle(game)
  assert.ok(game.state.pieces[22], 'released end cell becomes part of the falling column')
  assert.equal(game.useTool('hammer', 8), true)
  assert.deepEqual(game.state.obstacles[0]!.cells, [8])
  settle(game)
  assert.equal(game.useTool('hammer', 8), true)
  settle(game)
  assert.equal(game.state.status, 'won')
})

test('three-colour custom boards never refill with a fourth colour', () => {
  const game = new RoyalEngine(level({ colours: 3 }), { unlimitedMoves: true })
  for (let turn = 0; turn < 25; turn++) {
    assert.ok(game.state.pieces.every(piece => !piece || piece.colour < 3))
    const hint = game.hint()!
    assert.equal(hint[0] === hint[1] ? game.tap(hint[0]) : game.swap(...hint), true)
    settle(game)
  }
})

test('a global power action waits for active falling columns without spending another move', () => {
  const game = fixture()
  power(game, 48, 'lightball')
  colour(game, 14, 0); colour(game, 21, 1); colour(game, 28, 0); colour(game, 22, 0)
  assert.equal(game.swap(22, 21), true)
  assert.equal(game.tap(48), false)
  assert.equal(game.state.moves, 19)
  settle(game)
  assert.equal(game.tap(48), true)
})

test('geometrically deadlocked separated triples recover to a stable jelly-carrying power', () => {
  const custom = level({ cols: 6, rows: 7, mask: ['111000', '000000', '111000', '000000', '111000', '000000', '111000'], jelly: [1, 13, 25, 37], goals: [{ kind: 'jelly', count: 8 }] })
  for (let seed = 1; seed <= 8; seed++) {
    const game = new RoyalEngine(custom, { seed, unlimitedMoves: true })
    const first = game.hint()!
    assert.equal(first[0], first[1])
    assert.equal(game.state.pieces[first[0]]?.power, 'propeller')
    assert.ok(game.state.jelly[first[0]], 'recovery power can carry jelly into the other components')
    assert.equal(game.state.goals[0]!.remaining, 8, 'shuffle never awards free objective progress')
    for (const start of [0, 12, 24, 36]) {
      const row = game.state.pieces.slice(start, start + 3)
      assert.ok(row.some(p => p?.power) || new Set(row.map(p => p?.colour)).size > 1, 'recovery does not leave unprocessed matches')
    }
    for (let turns = 0; turns < 12 && game.state.status === 'playing'; turns++) {
      const hint = game.hint()!
      assert.ok(hint)
      assert.equal(hint[0] === hint[1] ? game.tap(hint[0]) : game.swap(...hint), true)
      settle(game)
    }
    assert.equal(game.state.status, 'won', 'all four components remain finishable without external tools')
  }
})

test('multiple converted propellers retarget after earlier flyers destroy their destinations', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const boxes = [20, 21, 23, 24].map((cell, i) => ({ ...obstacle('box', [cell], 1), id: `box-${i}` }))
    const game = fixture({ cols: 5, rows: 5, mask: Array(5).fill('11111'), seed, obstacles: boxes, goals: [{ kind: 'box', count: 4 }] })
    const converted = new Set([0, 1, 2, 5, 6, 7])
    let other = 0
    for (let cell = 0; cell < 25; cell++) if (game.state.pieces[cell]) colour(game, cell, converted.has(cell) ? 0 : (1 + other++ % 3) as Colour)
    power(game, 3, 'lightball'); power(game, 4, 'propeller')
    assert.equal(game.swap(3, 4), true)
    settle(game)
    assert.equal(game.state.goals[0]!.remaining, 0, 'at least four flyers reach four still-live boxes')
    assert.equal(game.state.obstacles.length, 0)
  }
})

test('a custom dynamite box without a colour uses the default crown colour', () => {
  const game = fixture({ obstacles: [obstacle('dynamite', [22, 23, 29, 30], 1, { stock: 2 })], goals: [{ kind: 'dynamite', count: 2 }] })
  colour(game, 15, 0); colour(game, 16, 1); colour(game, 17, 0); colour(game, 9, 0)
  assert.equal(game.swap(9, 16), true)
  advanceTo(game, SWAP_DURATION)
  assert.equal(game.state.goals[0]!.remaining, 1)
})

test('single lightball reports its origin and every cleared colour target for visible rays', () => {
  const game = fixture()
  power(game, 24, 'lightball')
  assert.equal(game.tap(24), true)
  advanceTo(game, LIGHTBALL_CHARGE_DURATION + LIGHTBALL_RAY_DURATION)
  const events = game.drainEvents(), beam = events.find(e => e.kind === 'lightball' && e.stage === 'launch')!
  assert.equal(beam.from, 24)
  assert.ok(beam.cells.length > 1, 'the visual includes destinations, not only the source')
  assert.deepEqual(new Set(beam.cells), cleared(events))
  assert.equal(game.state.moves, 19)
})

test('double rockets report one horizontal and one vertical beam matching their damage footprint', () => {
  const game = fixture()
  power(game, 23, 'rocket-h'); power(game, 24, 'rocket-v')
  assert.equal(game.swap(23, 24), true)
  advanceTo(game, SWAP_DURATION + ROCKET_WINDUP + rocketDuration(3.5))
  const events = game.drainEvents(), beams = events.filter(e => e.kind === 'rocket' && e.stage === 'launch')
  assert.equal(beams.length, 2)
  assert.deepEqual(new Set(beams.map(e => e.power)), new Set(['rocket-h', 'rocket-v']))
  assert.ok(beams.every(e => e.from === 24 && e.combo === 2))
  assert.deepEqual(new Set(beams.flatMap(e => e.cells)), cleared(events))
})

test('rocket and TNT report all six sweeping lines without adding extra damage', () => {
  const game = fixture({ obstacles: [obstacle('box', [10], 3)] })
  power(game, 23, 'rocket-h'); power(game, 24, 'tnt')
  assert.equal(game.swap(23, 24), true)
  advanceTo(game, SWAP_DURATION + TNT_WINDUP + rocketDuration(3.5))
  const events = game.drainEvents(), beams = events.filter(e => e.kind === 'rocket' && e.stage === 'launch')
  assert.equal(beams.filter(e => e.power === 'rocket-h').length, 3)
  assert.equal(beams.filter(e => e.power === 'rocket-v').length, 3)
  assert.equal(game.state.obstacles[0]!.hp, 2, 'six visual beams still belong to one combo damage wave')
  const footprint = new Set(beams.flatMap(e => e.cells))
  const affected = new Set([...cleared(events), 10])
  assert.deepEqual(footprint, affected)
  assert.equal(game.state.moves, 19)
})

test('double TNT carries a larger presentation radius and actual blast footprint', () => {
  for (const double of [false, true]) {
    const game = fixture({ cols: 9, rows: 9, mask: Array(9).fill('111111111') })
    power(game, 40, 'tnt')
    if (double) { power(game, 39, 'tnt'); assert.equal(game.swap(39, 40), true) }
    else assert.equal(game.tap(40), true)
    advanceTo(game, (double ? SWAP_DURATION : 0) + TNT_WINDUP)
    const events = game.drainEvents(), blast = events.find(e => e.kind === 'tnt')!
    assert.equal(blast.from, 40)
    assert.equal(blast.radius, double ? 4 : 2)
    assert.equal(blast.cells.length, double ? 81 : 25)
    assert.deepEqual(new Set(blast.cells), cleared(events))
  }
})

test('double lightball rays cover the playable board and skip cutout cells', () => {
  const game = fixture({ mask: ['0111110', ...Array(5).fill('1111111'), '0111110'] })
  power(game, 23, 'lightball'); power(game, 24, 'lightball')
  assert.equal(game.swap(23, 24), true)
  advanceTo(game, SWAP_DURATION + LIGHTBALL_CHARGE_DURATION + LIGHTBALL_RAY_DURATION)
  const events = game.drainEvents(), beam = events.find(e => e.kind === 'lightball' && e.stage === 'launch')!
  assert.equal(beam.from, 24)
  assert.equal(beam.combo, 2)
  assert.equal(beam.cells.length, 45)
  assert.ok([0, 6, 42, 48].every(cell => !beam.cells.includes(cell)))
  assert.deepEqual(new Set(beam.cells), cleared(events))
})

test('lightball conversion identifies the source and selected colour before child blasts', () => {
  const game = fixture()
  power(game, 23, 'lightball'); power(game, 24, 'tnt')
  const counts = [0, 0, 0, 0]
  for (const piece of game.state.pieces) if (piece && !piece.power) counts[piece.colour] = counts[piece.colour]! + 1
  const mostCommon = counts.indexOf(Math.max(...counts))
  const targets = game.state.pieces.flatMap((piece, cell) => piece && !piece.power && piece.colour === mostCommon ? [cell] : [])
  assert.equal(game.swap(23, 24), true)
  advanceTo(game, SWAP_DURATION + LIGHTBALL_CHARGE_DURATION + LIGHTBALL_RAY_DURATION + TNT_WINDUP)
  const events = game.drainEvents(), conversion = events.find(e => e.kind === 'lightball')!
  assert.equal(conversion.from, 24)
  assert.equal(conversion.colour, mostCommon)
  assert.deepEqual(new Set(conversion.cells), new Set([23, 24, ...targets]))
  assert.ok(events.indexOf(conversion) < events.findIndex(e => e.kind === 'tnt'))
})

test('victory emits one board-wide celebration after its final fall, without cutout cells', () => {
  const game = fixture({ mask: ['0111110', ...Array(6).fill('1111111')], obstacles: [obstacle('box', [24], 1)], goals: [{ kind: 'box', count: 1 }] })
  assert.equal(game.useTool('hammer', 24), true)
  assert.equal(game.drainEvents().some(e => e.kind === 'win'), false)
  settle(game)
  const wins = game.drainEvents().filter(e => e.kind === 'win')
  assert.equal(wins.length, 1)
  assert.equal(wins[0]!.cells.length, 47)
  assert.ok(!wins[0]!.cells.includes(0) && !wins[0]!.cells.includes(6))
  game.update(1)
  assert.equal(game.drainEvents().length, 0)
})

test('accepted swap snapshots keep source identities and delay damage until visual arrival', () => {
  const game = fixture({ goals: [{ kind: 'colour', colour: 0, count: 3 }] })
  colour(game, 15, 0); colour(game, 16, 1); colour(game, 17, 0); colour(game, 9, 0)
  const original = [structuredClone(game.state.pieces[9]), structuredClone(game.state.pieces[16])]
  assert.equal(game.swap(9, 16), true)
  const swap = game.drainEvents()[0]!
  assert.equal(swap.kind, 'swap')
  assert.equal(swap.at, 0)
  assert.equal(swap.duration, SWAP_DURATION)
  assert.deepEqual(swap.pieces, [{ cell: 9, piece: original[0] }, { cell: 16, piece: original[1] }])
  assert.equal(game.state.pieces[16]?.id, original[0]!.id)
  assert.equal(game.state.goals[0]!.remaining, 3)
  game.update(SWAP_DURATION - .001)
  assert.equal(game.state.goals[0]!.remaining, 3)
  assert.equal(game.drainEvents().length, 0)
  advanceTo(game, SWAP_DURATION)
  assert.equal(game.state.goals[0]!.remaining, 0)
  const clear = game.drainEvents().find(event => event.kind === 'clear')!
  assert.equal(clear.at, SWAP_DURATION)
  assert.deepEqual(clear.pieces?.find(snapshot => snapshot.cell === 16)?.piece, original[0])
  assert.equal(game.state.status, 'playing', 'the goal awaits its clear and fall animations')
  assert.deepEqual(swap.pieces, [{ cell: 9, piece: original[0] }, { cell: 16, piece: original[1] }], 'events retain immutable piece identities after removal')
})

test('power creation gathers old pieces before creation and holds gravity through the flash', () => {
  const game = fixture()
  for (const cell of [14, 15, 17, 9]) colour(game, cell, 0)
  colour(game, 16, 1); colour(game, 18, 2)
  assert.equal(game.swap(9, 16), true)
  advanceTo(game, SWAP_DURATION)
  const creation = game.drainEvents().find(event => event.kind === 'power')!
  assert.equal(creation.at, SWAP_DURATION)
  assert.equal(creation.duration, POWER_CREATION_DURATION)
  assert.deepEqual(new Set(creation.pieces?.map(snapshot => snapshot.cell)), new Set([14, 15, 16, 17]))
  assert.equal(creation.createdPiece?.power, 'rocket-h')
  assert.equal(game.state.pieces[16]?.power, undefined)
  advanceTo(game, SWAP_DURATION + MATCH_CONVERGE_DURATION - .001)
  assert.equal(game.state.pieces[16]?.power, undefined)
  advanceTo(game, SWAP_DURATION + MATCH_CONVERGE_DURATION)
  assert.equal(game.state.pieces[16]?.id, creation.createdPiece?.id)
  advanceTo(game, SWAP_DURATION + POWER_CREATION_DURATION - .001)
  assert.equal(game.drainEvents().some(event => event.kind === 'fall'), false)
  advanceTo(game, SWAP_DURATION + POWER_CREATION_DURATION)
  const falls = game.drainEvents().filter(event => event.kind === 'fall')
  assert.ok(falls.length > 0)
  assert.ok(falls.every(event => event.at === SWAP_DURATION + POWER_CREATION_DURATION))
})

test('gravity spawns above each separated segment and scans only after the longest landing', () => {
  const game = fixture({ mask: ['1111111', '1111111', '1101111', '1111111', '1111111', '1111111', '1111111'] })
  assert.equal(game.useTool('cannon', 2), true)
  game.drainEvents()
  advanceTo(game, CLEAR_DURATION)
  const falls = game.drainEvents().filter(event => event.kind === 'fall')
  assert.equal(falls.length, 6)
  for (const fall of falls) {
    const row = Math.floor(fall.to! / 7), top = row < 2 ? 0 : 3, length = row < 2 ? 2 : 4
    assert.equal(fall.from, undefined, 'new pieces have no fabricated source cell')
    assert.equal(fall.fromRow, row - length)
    assert.ok(fall.fromRow! < top)
    assert.equal(fall.duration, fallDuration(length))
    assert.equal(fall.pieces?.[0]?.piece.id, game.state.pieces[fall.to!]?.id)
  }
  const longestArrival = Math.max(...falls.map(event => event.at + event.duration!))
  advanceTo(game, longestArrival - .001)
  assert.ok(game.state.locked.has(44))
  assert.equal(game.drainEvents().some(event => event.kind === 'clear' || event.kind === 'power'), false, 'settling pieces cannot trigger an early cascade')
  advanceTo(game, longestArrival)
  const cascades = game.drainEvents().filter(event => event.kind === 'clear' || event.kind === 'power')
  assert.ok(cascades.every(event => event.at >= longestArrival))
  settle(game)
  assert.equal(game.state.pieces[16], null)
})

test('TNT chains a lifting propeller while source pieces fall, then hits its last goal on arrival', () => {
  const game = fixture({ cols: 9, rows: 9, mask: Array(9).fill('111111111'), moves: 1, obstacles: [obstacle('box', [8], 1)], goals: [{ kind: 'box', count: 1 }] })
  power(game, 40, 'tnt'); power(game, 42, 'propeller')
  assert.equal(game.tap(40), true)
  advanceTo(game, TNT_WINDUP)
  let events = game.drainEvents()
  const lift = events.find(event => event.kind === 'activate' && event.power === 'propeller')!
  assert.equal(lift.at, TNT_WINDUP)
  assert.equal(lift.duration, PROPELLER_LIFT_DURATION)
  assert.equal(lift.pieces?.[0]?.piece.id, 1042, 'chain activation retains the consumed propeller artwork')
  advanceTo(game, TNT_WINDUP + PROPELLER_LIFT_DURATION)
  events = events.concat(game.drainEvents())
  const flight = events.find(event => event.kind === 'propeller' && event.stage === 'launch')!
  assert.equal(flight.from, 42)
  assert.equal(flight.to, 8)
  assert.equal(flight.at, TNT_WINDUP + PROPELLER_LIFT_DURATION)
  assert.ok(events.some(event => event.kind === 'fall' && event.at < flight.at), 'source gravity runs during propeller lift')
  const arrival = flight.at + flight.duration!
  advanceTo(game, arrival - .001)
  assert.equal(game.state.goals[0]!.remaining, 1)
  assert.equal(game.state.obstacles[0]!.hp, 1)
  assert.equal(game.state.status, 'playing', 'zero moves cannot fail while a projectile is travelling')
  assert.equal(game.useTool('shuffle'), false)
  assert.equal(game.useTool('hammer', 8), false)
  advanceTo(game, arrival)
  const impact = game.drainEvents().find(event => event.kind === 'propeller' && event.stage === 'impact')!
  assert.equal(impact.at, arrival)
  assert.equal(game.state.goals[0]!.remaining, 0)
  assert.equal(game.state.status, 'playing', 'arrival still waits for target clear and refill')
  settle(game)
  assert.equal(game.state.status, 'won')
})

test('absolute effect timestamps and final state are independent of update chunk size', () => {
  const make = () => {
    const game = fixture({ cols: 9, rows: 9, mask: Array(9).fill('111111111'), moves: 1, obstacles: [obstacle('box', [8], 1)], goals: [{ kind: 'box', count: 1 }] })
    power(game, 40, 'tnt'); power(game, 42, 'propeller'); game.tap(40)
    return game
  }
  const fine = make(), coarse = make()
  for (let frame = 0; frame < 300; frame++) fine.update(.01)
  coarse.update(3)
  assert.deepEqual(coarse.state, fine.state)
  const events = coarse.drainEvents()
  assert.deepEqual(events, fine.drainEvents(), 'scheduled substeps must not inherit the outer frame time')
  assert.ok(events.every((event, index) => event.at <= coarse.time && (index === 0 || event.at >= events[index - 1]!.at)))
  const wonAt = events.find(event => event.kind === 'win')!.at
  assert.ok(wonAt < 3)
  coarse.update(.5)
  assert.equal(coarse.time, 3.5, 'the shared rendering clock advances after the game ends')
  assert.equal(coarse.drainEvents().length, 0)
})

function carriedTntFixture(overrides: [number, Colour][], chainedPower?: Power, seed = 2): RoyalEngine {
  const colours = Array.from({ length: 81 }, (_, cell) => ((Math.floor(cell / 9) + cell % 9) % 4) as Colour)
  for (const [cell, value] of overrides) colours[cell] = value
  return new RoyalEngine(level({ cols: 9, rows: 9, mask: Array(9).fill('111111111'), seed, obstacles: [obstacle('stone', [0], 1)], goals: [{ kind: 'colour', colour: 0, count: 1000 }, { kind: 'stone', count: 1 }], pieces: colours.map((value, cell) => ({ cell, colour: value, ...(cell === 79 ? { power: 'propeller' as Power } : cell === 80 ? { power: 'tnt' as Power } : chainedPower && cell === 20 ? { power: chainedPower } : {}) })) }), { seed })
}

for (const phase of ['before arrival', 'during carried TNT windup'] as const) test(`a carried blast reserves its full footprint ${phase} without charging rejected swaps`, () => {
  const game = carriedTntFixture([[10, 0], [11, 1], [12, 0], [13, 0], [20, 0]])
  game.drainEvents()
  assert.equal(game.swap(79, 80), true)
  advanceTo(game, SWAP_DURATION + PROPELLER_LIFT_DURATION)
  const flight = game.drainEvents().find(event => event.kind === 'propeller' && event.stage === 'launch')!
  assert.equal(flight.to, 0)
  advanceTo(game, flight.at + flight.duration! + (phase === 'before arrival' ? -.03 : .01))
  const original = structuredClone(game.state.pieces)
  assert.ok(game.state.locked.has(11), 'columns reached by the future TNT blast are reserved')
  assert.equal(game.swap(11, 20), false)
  assert.equal(game.state.moves, 19)
  assert.equal(game.state.turn, 1)
  assert.deepEqual(game.state.pieces, original)
  advanceTo(game, flight.at + flight.duration! + TNT_WINDUP)
  const events = game.drainEvents()
  assert.equal(events.some(event => event.kind === 'power' && event.to === 11), false, 'no stale four-match may manufacture a power after TNT consumed its cells')
  settle(game)
})

for (const chainedPower of ['rocket-h', 'tnt'] as const) test(`a dynamically chained ${chainedPower} waits through accepted power creation and its landing`, () => {
  const game = carriedTntFixture([[4, 0], [13, 0], [22, 1], [31, 0], [40, 2], [21, 0]], chainedPower)
  game.drainEvents()
  assert.equal(game.swap(79, 80), true)
  advanceTo(game, SWAP_DURATION + PROPELLER_LIFT_DURATION)
  const flight = game.drainEvents().find(event => event.kind === 'propeller' && event.stage === 'launch')!
  const tntImpact = flight.at + flight.duration! + TNT_WINDUP
  advanceTo(game, tntImpact - .04)
  assert.equal(game.state.locked.has(21), false)
  assert.equal(game.state.locked.has(22), false)
  assert.equal(game.swap(21, 22), true, 'columns outside the reserved TNT footprint remain playable')
  const swappedAt = game.time
  assert.equal(game.state.moves, 18)
  advanceTo(game, tntImpact)
  let events = game.drainEvents()
  const chained = events.find(event => event.kind === 'activate' && event.power === chainedPower && event.cells.includes(20))!
  assert.ok(chained.duration! > windup(chainedPower), 'expanded chain waits for the earlier accepted action')
  advanceTo(game, swappedAt + SWAP_DURATION + MATCH_CONVERGE_DURATION)
  events = events.concat(game.drainEvents())
  const creation = events.find(event => event.kind === 'power' && event.to === 22)!
  assert.equal(creation.power, 'rocket-v')
  assert.equal(creation.pieces?.length, 4)
  assert.ok(creation.pieces?.every(snapshot => snapshot.piece.colour === 0))
  assert.equal(game.state.pieces[22]?.id, creation.createdPiece?.id)
  advanceTo(game, creation.at + POWER_CREATION_DURATION)
  events = events.concat(game.drainEvents())
  assert.equal(events.some(event => (event.kind === 'rocket' || event.kind === 'tnt') && event.from === 20), false, 'equal-deadline jobs cannot launch before the protected match finishes')
  const protectedFalls = events.filter(event => event.kind === 'fall' && event.to! % 9 === 4)
  assert.ok(protectedFalls.length > 0)
  const landing = Math.max(...protectedFalls.map(event => event.at + event.duration!))
  advanceTo(game, landing - .001)
  events = events.concat(game.drainEvents())
  assert.equal(events.some(event => (event.kind === 'rocket' || event.kind === 'tnt') && event.from === 20), false, 'the blast cannot hit logical destinations before those pieces visibly land')
  const continuation = events.find(event => event.kind === 'activate' && event.cells.includes(20) && event.at > chained.at)!
  assert.equal(continuation.pieces?.[0]?.piece.id, chained.pieces?.[0]?.piece.id)
  assert.ok(continuation.at + continuation.duration! > landing)
  advanceTo(game, continuation.at + continuation.duration!)
  const launch = game.drainEvents().find(event => (event.kind === 'rocket' || event.kind === 'tnt') && event.from === 20)!
  assert.ok(launch.at > landing)
  settle(game)
  assert.equal(game.state.turn, 2)
  assert.equal(game.state.moves, 18)
})

test('a travelling chain cannot steal gathering pieces from a cascade that began earlier', () => {
  const game = carriedTntFixture([[22, 0]], 'tnt', 37)
  game.drainEvents()
  assert.equal(game.swap(79, 80), true)
  game.update(.64); game.drainEvents()
  assert.equal(game.swap(13, 12), true)
  game.update(3)
  const events = game.drainEvents()
  const cascade = events.find(event => event.kind === 'power' && event.power === 'lightball' && event.pieces?.some(snapshot => snapshot.cell === 4))!
  assert.ok(cascade, 'seed37 produces the five-piece cascade before the remote TNT chain')
  assert.equal(cascade.pieces?.length, 5)
  const originalIds = new Set(cascade.pieces!.map(snapshot => snapshot.piece.id))
  const convergedAt = cascade.at + MATCH_CONVERGE_DURATION
  const earlyClear = events.find(event => event.kind === 'clear' && event.at > cascade.at && event.at < convergedAt - 1e-7 && event.pieces?.some(snapshot => originalIds.has(snapshot.piece.id)))
  assert.equal(earlyClear, undefined, 'remote TNT cannot destroy a piece being gathered by another wave')
  const consumedIds = new Set(events.filter(event => event.kind === 'clear' && Math.abs(event.at - convergedAt) < 1e-7).flatMap(event => event.pieces?.map(snapshot => snapshot.piece.id) ?? []))
  assert.ok([...originalIds].every(id => consumedIds.has(id)), 'all five actual originals participate in creation')
  settle(game)
  assert.equal(game.state.turn, 2)
  assert.equal(game.state.moves, 18)
})
