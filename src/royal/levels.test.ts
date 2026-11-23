import test from 'node:test'
import assert from 'node:assert/strict'
import { AUTHORED_LEVEL_COUNT, CAMPAIGN_MAX_COLS, CAMPAIGN_MAX_ROWS, LEVEL_PREVIEWS, createBlankLevel, deriveGoals, getLevel, validateLevel } from './levels.ts'
import { cellPlayable, type LevelDefinition, type ObstacleDefinition } from './model.ts'
import { MAX_LEVEL } from './progression.ts'

function accepted(level: LevelDefinition): LevelDefinition {
  const result = validateLevel(level)
  assert.deepEqual(result.errors, [], `level ${level.id}: ${result.errors.join('; ')}`)
  assert.ok(result.level)
  return result.level
}
function rejected(value: unknown, message?: RegExp): void {
  const result = validateLevel(value)
  assert.equal(result.level, undefined)
  assert.ok(result.errors.length)
  if (message) assert.match(result.errors.join(' '), message)
}
function hasFreeMatchArea(level: LevelDefinition, occupied: Set<number>): boolean {
  for (let row = 0; row <= level.rows - 3; row++) for (let col = 0; col <= level.cols - 3; col++) {
    const cells = Array.from({ length: 9 }, (_, i) => (row + Math.floor(i / 3)) * level.cols + col + i % 3)
    if (cells.every(cell => cellPlayable(level, cell) && !occupied.has(cell))) return true
  }
  return false
}

test('curated progression teaches distinct goals on varied board geometries', () => {
  assert.equal(AUTHORED_LEVEL_COUNT, 32)
  const levels = Array.from({ length: AUTHORED_LEVEL_COUNT }, (_, i) => accepted(getLevel(i + 1)))
  assert.equal(levels[0]!.goals[0]!.kind, 'colour')
  assert.ok(levels[2]!.goals.some(g => g.kind === 'box'))
  assert.ok(levels[4]!.goals.some(g => g.kind === 'toy'))
  assert.ok(levels[6]!.goals.some(g => g.kind === 'jelly'))
  assert.ok(levels[8]!.goals.some(g => g.kind === 'ice'))
  assert.ok(levels[10]!.goals.some(g => g.kind === 'cuckoo'))
  assert.ok(levels[12]!.goals.some(g => g.kind === 'stone'))
  assert.ok(levels[13]!.goals.some(g => g.kind === 'dynamite'))
  assert.ok(levels.every(level => level.provenance === 'authored'))
  assert.ok(new Set(levels.map(level => level.mask.join('/'))).size >= 18, 'compact boards keep distinct terraces, wings, courtyards and other shapes')
  assert.ok(new Set(levels.map(level => JSON.stringify(level.obstacles))).size >= 26, 'shared dimensions still have distinct obstacle layouts')
  for (const preview of LEVEL_PREVIEWS) {
    const level = levels[preview.id - 1]!
    assert.deepEqual([preview.cols, preview.rows], [level.cols, level.rows])
  }
  assert.equal(new Set(levels.map(level => level.difficulty)).size, 4)
  assert.equal(levels[20]!.difficulty, 'normal')
  assert.ok(levels[20]!.obstacles.length < levels[19]!.obstacles.length, 'a simpler board follows the challenge')
})

test('compact campaign geometry and collectible inventories stay structurally possible across many seeds', () => {
  const geometry = new Set<string>(), layouts = new Set<string>(), difficulties = new Set<string>()
  const ids = [...Array.from({ length: 1000 }, (_, i) => i + 1), 12000, 12297, 15321, 20000, 65535, 100000, 999999, 1000000, 0x100000000+12000, MAX_LEVEL-1, MAX_LEVEL]
  for (const id of ids) {
    const level = accepted(getLevel(id)), occupied = new Set<number>()
    for (const o of level.obstacles) for (const cell of o.cells) {
      assert.ok(cellPlayable(level, cell))
      assert.ok(!occupied.has(cell), `overlap at ${id}:${cell}`)
      occupied.add(cell)
    }
    const free = level.mask.join('').split('').filter(c => c === '1').length - occupied.size
    assert.ok(free >= 9)
    if (level.provenance !== 'reference-reconstruction') {
      assert.ok(level.cols <= CAMPAIGN_MAX_COLS && level.rows <= CAMPAIGN_MAX_ROWS, `campaign ${id} must fit the mobile board limit`)
      assert.ok(hasFreeMatchArea(level, occupied), `campaign ${id} needs an unobstructed 3×3 starting match area`)
    }
    assert.ok(level.goals.length >= 1)
    assert.deepEqual(level.goals.filter(goal => goal.kind !== 'colour'), deriveGoals(level).filter(goal => goal.kind !== 'colour'), `level ${id} goals must match the placed inventory and unpainted jelly`)
    geometry.add(level.mask.join('/')); layouts.add(JSON.stringify([level.mask, level.obstacles])); difficulties.add(level.difficulty)
  }
  assert.ok(geometry.size >= 45, 'a compact vocabulary still varies the board silhouette')
  assert.ok(layouts.size > 500, 'obstacle placements supply variety within the smaller dimensions')
  assert.equal(difficulties.size, 4)
})

test('level 23 keeps its ice and bird challenge within nine rows', () => {
  const level = accepted(getLevel(23))
  assert.deepEqual([level.cols, level.rows, level.moves], [8, 9, 31])
  assert.deepEqual(level.goals, [{ kind: 'cuckoo', count: 2 }, { kind: 'ice', count: 8 }])
  assert.equal(level.obstacles.filter(o => o.kind === 'ice').length, 8)
  assert.equal(level.obstacles.filter(o => o.kind === 'cuckoo').length, 1)
  assert.match(level.description!, /테라스의 얼음/)
})

test('authored boards keep their established challenge and generated IDs keep their seed identity', () => {
  const established = [
    { id: 23, seed: 1411741688, moves: 31, difficulty: 'normal' },
    { id: 30, seed: 3898530721, moves: 29, difficulty: 'extreme' },
  ]
  for (const expected of established) {
    const { id, seed, moves, difficulty } = getLevel(expected.id)
    assert.deepEqual({ id, seed, moves, difficulty }, expected)
  }
  for (const [id, seed] of [[33, 133707470], [42, 2546429461], [12000, 179753471], [20000, 3437083967], [999999, 1018891664]]) assert.equal(getLevel(id!).seed, seed)
})

test('reference 12297 remains a labelled reconstruction with its own mask and achievable observations', () => {
  const level = accepted(getLevel(12297))
  assert.equal(level.provenance, 'reference-reconstruction')
  assert.equal(level.cols, 9); assert.equal(level.rows, 11)
  assert.deepEqual(level.mask.slice(0, 4), Array(4).fill('111111111'))
  assert.deepEqual(level.mask.slice(4), Array(7).fill('111001111'))
  assert.deepEqual(level.goals, [
    { kind: 'toy', count: 18 }, { kind: 'dynamite', count: 8 }, { kind: 'cuckoo', count: 2 }, { kind: 'jelly', count: 81 },
  ])
  assert.deepEqual(level.obstacles.find(o => o.kind === 'dynamite')?.cells, [21, 22, 30, 31])
  assert.deepEqual(level.obstacles.find(o => o.kind === 'cuckoo')?.cells, [24, 25, 33, 34])
  assert.equal(level.mask.join('').split('').filter(c => c === '1').length - level.jelly.length, 81)
  assert.match(level.description!, /재구성/)
  assert.notEqual(level.moves, 22, 'remaining video moves must not become a claimed starting budget')
})

test('definitions are deterministic independent copies and tolerate invalid requested ids safely', () => {
  const a = getLevel(91), b = getLevel(91)
  assert.deepEqual(a, b)
  a.mask[0] = '0'.repeat(a.cols)
  a.goals[0]!.count = 1
  a.obstacles[0]!.cells.length = 0
  assert.deepEqual(getLevel(91), b)
  for (const value of [NaN, Infinity, -1, 0, 1.5, MAX_LEVEL+1]) assert.equal(getLevel(value).id, 1)
  assert.equal(getLevel(999999).id, 999999)
})

test('editor goals reflect inventory, not HP, and subtract already painted jelly', () => {
  const level = createBlankLevel(8, 9)
  level.obstacles = [
    { id: 'box', kind: 'box', cells: [0], hp: 3 },
    { id: 'gift', kind: 'gift', cells: [1, 9], hp: 4, stock: 5 },
    { id: 'ice', kind: 'ice', cells: [2], hp: 3 },
    { id: 'bird', kind: 'cuckoo', cells: [3], hp: 1, stock: 2 },
    { id: 'dyn', kind: 'dynamite', cells: [4], hp: 1, stock: 8, colour: 0 },
  ]
  level.jelly = [30, 31]
  level.goals = deriveGoals(level)
  accepted(level)
  assert.deepEqual(level.goals, [
    { kind: 'toy', count: 5 }, { kind: 'dynamite', count: 8 }, { kind: 'cuckoo', count: 2 },
    { kind: 'box', count: 1 }, { kind: 'ice', count: 1 }, { kind: 'jelly', count: 70 },
  ])
  assert.deepEqual(deriveGoals(createBlankLevel()), [{ kind: 'colour', colour: 0, count: 20 }])
})

test('validator rejects malformed top-level inputs and bounded numeric violations', () => {
  for (const bad of [null, [], 'level', 1, true]) rejected(bad)
  for (const [key, values] of Object.entries({
    id: [0, MAX_LEVEL+1, NaN, Infinity, '1'], cols: [4, 13, 1e9, null], rows: [0, 1000],
    moves: [0, -1, 201, 1.5, NaN], colours: [2, 5, null], seed: [-1, 0x100000000, Infinity],
    version: [2, null], difficulty: ['impossible'], provenance: ['official'], name: ['', 'x'.repeat(81)],
  })) for (const value of values) rejected({ ...createBlankLevel(), [key]: value })
  rejected({ ...createBlankLevel(), injected: 'unexpected' }, /알 수 없는/)
  rejected({ ...createBlankLevel(), description: 123 })
})

test('validator rejects malformed masks before trying to use cell indexes', () => {
  for (const mask of [null, [], Array(9).fill('11111'), Array(9).fill('xxxxxxxx'), [...Array(8).fill('11111111'), 123]]) rejected({ ...createBlankLevel(), mask })
  rejected({ ...createBlankLevel(), mask: Array(9).fill('00000000') }, /최소/)
})

test('validator rejects overlapping, out-of-range, disconnected and duplicate obstacle cells', () => {
  const base = createBlankLevel()
  const box: ObstacleDefinition = { id: 'a', kind: 'box', cells: [0], hp: 2 }
  const withObstacles = (obstacles: unknown[]) => ({ ...base, obstacles })
  rejected(withObstacles([box, { ...box, id: 'b' }]), /겹/)
  rejected(withObstacles([box, { ...box, cells: [1] }]), /ID/)
  rejected(withObstacles([{ ...box, cells: [-1] }]))
  rejected(withObstacles([{ ...box, cells: [72] }]))
  rejected(withObstacles([{ ...box, cells: [0, 0] }]), /겹/)
  rejected(withObstacles([{ ...box, cells: [0, 71] }]), /연결/)
  rejected(withObstacles([{ ...box, hp: NaN }]))
  rejected(withObstacles([{ ...box, kind: 'ice-cream' }]))
  rejected(withObstacles([{ ...box, stock: 0 }]))
  rejected(withObstacles([{ ...box, open: 'yes' }]))
  rejected(withObstacles([{ ...box, colour: 4 }]))
  rejected(withObstacles([{ ...box, unexpected: true }]))
  const holed = { ...base, mask: ['01111111', ...base.mask.slice(1)], obstacles: [box] }
  rejected(holed)
})

test('validator rejects missing inventory, duplicate goals and inaccessible colour choices', () => {
  const base = createBlankLevel()
  rejected({ ...base, goals: [] })
  rejected({ ...base, goals: [{ kind: 'toy', count: 1 }] }, /실제/)
  rejected({ ...base, goals: [{ kind: 'colour', count: 5 }] }, /색/)
  rejected({ ...base, colours: 3, goals: [{ kind: 'colour', colour: 3, count: 5 }] }, /색/)
  rejected({ ...base, goals: [base.goals[0], base.goals[0]] }, /중복/)
  rejected({ ...base, goals: [{ kind: 'score', count: 1000 }] })
  rejected({ ...base, obstacles: [{ id: 'gift', kind: 'gift', cells: [0], hp: 4, stock: 2 }], goals: [{ kind: 'toy', count: 3 }] }, /실제/)
  rejected({ ...base, goals: [{ kind: 'colour', colour: 0, count: NaN }] })
})

test('jelly objectives require reachable seeds and a possible remaining count', () => {
  const base = createBlankLevel()
  rejected({ ...base, goals: [{ kind: 'jelly', count: 5 }] }, /시작 젤리/)
  rejected({ ...base, jelly: [0], goals: [{ kind: 'jelly', count: 72 }] }, /아직 칠하지 않은/)
  rejected({ ...base, jelly: [0, 0], goals: [{ kind: 'jelly', count: 70 }] }, /중복/)
  rejected({ ...base, mask: Array(9).fill('11100111'), jelly: [0], goals: [{ kind: 'jelly', count: 10 }] }, /분리/)
  accepted({ ...base, mask: Array(9).fill('11100111'), jelly: [0, 5], goals: [{ kind: 'jelly', count: 52 }] })
})

test('initial powers preserve authored placements and cannot overlap or inject unknown power types', () => {
  const base = createBlankLevel()
  const power = { cell: 0, colour: 0 as const, power: 'propeller' as const }
  const level = accepted({ ...base, pieces: [power] })
  assert.deepEqual(level.pieces, [power])
  power.cell = 1
  assert.equal(level.pieces![0]!.cell, 0)
  rejected({ ...base, pieces: [{ ...power, power: 'nuke' }] })
  rejected({ ...base, pieces: [power, power] })
  rejected({ ...base, pieces: [{ ...power, colour: NaN }] })
  rejected({ ...base, obstacles: [{ id: 'box', kind: 'box', cells: [1], hp: 1 }], pieces: [power] })
})

test('editor dimensions are bounded before allocation and validator returns isolated data', () => {
  assert.equal(createBlankLevel(1000000000, NaN).cols, 8)
  assert.equal(createBlankLevel(1000000000, NaN).rows, 9)
  accepted(createBlankLevel(5, 5))
  const custom = createBlankLevel(12, 12), restored = accepted(JSON.parse(JSON.stringify(custom)))
  assert.deepEqual([restored.cols, restored.rows], [12, 12], 'campaign caps must not resize existing custom boards')
  assert.deepEqual(restored, custom)
  const input = getLevel(12297), output = accepted(input)
  output.obstacles[0]!.cells[0] = 98
  output.goals[0]!.count = 1
  assert.notEqual(input.obstacles[0]!.cells[0], 98)
  assert.equal(input.goals[0]!.count, 18)
})

test('high level bits affect generated boards instead of repeating at every 2^32 levels',()=>{
  const first=getLevel(20000)
  for(const multiple of [1,2,17,1024]){
    const id=20000+multiple*0x100000000,high=accepted(getLevel(id))
    assert.equal(high.id,id)
    assert.notEqual(high.seed,first.seed)
    assert.notDeepEqual({mask:high.mask,obstacles:high.obstacles},{mask:first.mask,obstacles:first.obstacles})
    assert.deepEqual(high,getLevel(id),'a high-numbered board remains reproducible')
  }
  assert.equal(accepted(getLevel(MAX_LEVEL)).id,MAX_LEVEL)
})
