import test from 'node:test'
import assert from 'node:assert/strict'
import { RoyalEngine } from './engine.ts'
import type { Colour, LevelDefinition, ObstacleDefinition, Power } from './model.ts'

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
    assert.equal(game.state.pieces[destination]?.power, expected)
    assert.equal(game.state.moves, 19)
    settle(game)
  })
}

test('one match touching two cells of a gift damages its shared HP only once', () => {
  const game = fixture({ obstacles: [obstacle('gift', [22, 23], 4, { stock: 2 })], goals: [{ kind: 'toy', count: 2 }] })
  colour(game, 15, 0); colour(game, 16, 1); colour(game, 17, 0); colour(game, 9, 0)
  assert.equal(game.swap(9, 16), true)
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
  assert.equal(game.state.obstacles[0]!.open, true)
  settle(game)
  assert.equal(game.useTool('hammer', 23), true)
  assert.equal(game.state.goals[0]!.remaining, 1)
  assert.equal(game.state.obstacles[0]!.open, true, 'free tools do not toggle turn state')
})

test('dynamite rejects wrong-colour adjacency and a matching colour triggers one global wave', () => {
  for (const targetColour of [0, 1] as const) {
    const game = fixture({ obstacles: [obstacle('dynamite', [22, 23, 29, 30], 1, { stock: 8, colour: targetColour })], goals: [{ kind: 'dynamite', count: 8 }] })
    colour(game, 15, 0); colour(game, 16, 1); colour(game, 17, 0); colour(game, 9, 0)
    assert.equal(game.swap(9, 16), true)
    assert.equal(game.state.obstacles[0]!.stock, targetColour === 0 ? 7 : 8)
    assert.equal(game.state.goals[0]!.remaining, targetColour === 0 ? 7 : 8)
    if (targetColour === 0) assert.equal(game.state.pieces.filter(Boolean).length, 0)
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
  assert.equal(game.state.pieces[23], null)
  assert.equal(game.state.pieces[24], null)
  assert.equal(game.state.moves, 19)
  const events = game.drainEvents()
  assert.ok(events.some(e => e.kind === 'power' && e.combo === 2))
  settle(game)
  assert.ok(game.state.pieces.every((p, i) => p || !game.state.level.mask[Math.floor(i / 7)]?.[i % 7]))
})

test('lightball + lightball removes exactly one obstacle layer in the initial wave', () => {
  const game = fixture({ obstacles: [obstacle('box', [0, 1], 3)], goals: [{ kind: 'box', count: 1 }] })
  power(game, 23, 'lightball'); power(game, 24, 'lightball')
  assert.equal(game.swap(23, 24), true)
  assert.equal(game.state.obstacles[0]!.hp, 2)
})

test('super lightball pair removes two layers, normal pair one', () => {
  const game = new RoyalEngine(level({ obstacles: [obstacle('box', [0, 1], 3)] }), { superLightBall: true })
  power(game, 23, 'lightball'); power(game, 24, 'lightball')
  assert.equal(game.swap(23, 24), true)
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
    assert.equal(game.state.goals[0]!.remaining, 0, 'at least four flyers reach four still-live boxes')
    assert.equal(game.state.obstacles.length, 0)
  }
})

test('a custom dynamite box without a colour uses the default crown colour', () => {
  const game = fixture({ obstacles: [obstacle('dynamite', [22, 23, 29, 30], 1, { stock: 2 })], goals: [{ kind: 'dynamite', count: 2 }] })
  colour(game, 15, 0); colour(game, 16, 1); colour(game, 17, 0); colour(game, 9, 0)
  assert.equal(game.swap(9, 16), true)
  assert.equal(game.state.goals[0]!.remaining, 1)
})

test('single lightball reports its origin and every cleared colour target for visible rays', () => {
  const game = fixture()
  power(game, 24, 'lightball')
  assert.equal(game.tap(24), true)
  const events = game.drainEvents(), beam = events.find(e => e.kind === 'lightball')!, clear = events.find(e => e.kind === 'clear')!
  assert.equal(beam.from, 24)
  assert.ok(beam.cells.length > 1, 'the visual includes destinations, not only the source')
  assert.deepEqual(new Set(beam.cells), new Set(clear.cells))
  assert.equal(game.state.moves, 19)
})

test('double rockets report one horizontal and one vertical beam matching their damage footprint', () => {
  const game = fixture()
  power(game, 23, 'rocket-h'); power(game, 24, 'rocket-v')
  assert.equal(game.swap(23, 24), true)
  const events = game.drainEvents(), beams = events.filter(e => e.kind === 'rocket')
  assert.equal(beams.length, 2)
  assert.deepEqual(new Set(beams.map(e => e.power)), new Set(['rocket-h', 'rocket-v']))
  assert.ok(beams.every(e => e.from === 24 && e.combo === 2))
  assert.deepEqual(new Set(beams.flatMap(e => e.cells)), new Set(events.find(e => e.kind === 'clear')!.cells))
})

test('rocket and TNT report all six sweeping lines without adding extra damage', () => {
  const game = fixture({ obstacles: [obstacle('box', [10], 3)] })
  power(game, 23, 'rocket-h'); power(game, 24, 'tnt')
  assert.equal(game.swap(23, 24), true)
  const events = game.drainEvents(), beams = events.filter(e => e.kind === 'rocket')
  assert.equal(beams.filter(e => e.power === 'rocket-h').length, 3)
  assert.equal(beams.filter(e => e.power === 'rocket-v').length, 3)
  assert.equal(game.state.obstacles[0]!.hp, 2, 'six visual beams still belong to one combo damage wave')
  const footprint = new Set(beams.flatMap(e => e.cells))
  const affected = new Set([...events.find(e => e.kind === 'clear')!.cells, 10])
  assert.deepEqual(footprint, affected)
  assert.equal(game.state.moves, 19)
})

test('double TNT carries a larger presentation radius and actual blast footprint', () => {
  for (const double of [false, true]) {
    const game = fixture({ cols: 9, rows: 9, mask: Array(9).fill('111111111') })
    power(game, 40, 'tnt')
    if (double) { power(game, 39, 'tnt'); assert.equal(game.swap(39, 40), true) }
    else assert.equal(game.tap(40), true)
    const events = game.drainEvents(), blast = events.find(e => e.kind === 'tnt')!
    assert.equal(blast.from, 40)
    assert.equal(blast.radius, double ? 4 : 2)
    assert.equal(blast.cells.length, double ? 81 : 25)
    assert.deepEqual(new Set(blast.cells), new Set(events.find(e => e.kind === 'clear')!.cells))
  }
})

test('double lightball rays cover the playable board and skip cutout cells', () => {
  const game = fixture({ mask: ['0111110', ...Array(5).fill('1111111'), '0111110'] })
  power(game, 23, 'lightball'); power(game, 24, 'lightball')
  assert.equal(game.swap(23, 24), true)
  const events = game.drainEvents(), beam = events.find(e => e.kind === 'lightball')!
  assert.equal(beam.from, 24)
  assert.equal(beam.combo, 2)
  assert.equal(beam.cells.length, 45)
  assert.ok([0, 6, 42, 48].every(cell => !beam.cells.includes(cell)))
  assert.deepEqual(new Set(beam.cells), new Set(events.find(e => e.kind === 'clear')!.cells))
})

test('lightball conversion identifies the source and selected colour before child blasts', () => {
  const game = fixture()
  power(game, 23, 'lightball'); power(game, 24, 'tnt')
  const counts = [0, 0, 0, 0]
  for (const piece of game.state.pieces) if (piece && !piece.power) counts[piece.colour] = counts[piece.colour]! + 1
  const mostCommon = counts.indexOf(Math.max(...counts))
  const targets = game.state.pieces.flatMap((piece, cell) => piece && !piece.power && piece.colour === mostCommon ? [cell] : [])
  assert.equal(game.swap(23, 24), true)
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
