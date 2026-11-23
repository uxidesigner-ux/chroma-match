import test from 'node:test'
import assert from 'node:assert/strict'
import { propellerTargets } from './targeting.ts'
import type { GameState, GoalDefinition, ObstacleState } from './model.ts'

function obstacle(id: string, kind: ObstacleState['kind'], cells: number[], hp = 1, extra: Partial<ObstacleState> = {}): ObstacleState {
  return { id, kind, cells, hp, initialHp: hp, stock: 1, initialStock: 1, open: true, ...extra }
}
function board(goals: GoalDefinition[], obstacles: ObstacleState[] = [], size = 7): GameState {
  const occupied = new Set(obstacles.flatMap(item => item.cells))
  return {
    level: { version: 1, id: 1, name: 'Target evaluation', cols: size, rows: size, mask: Array(size).fill('1'.repeat(size)),
      moves: 20, difficulty: 'normal', colours: 4, seed: 3, goals, obstacles, jelly: [], provenance: 'custom' },
    pieces: Array.from({ length: size * size }, (_, cell) => occupied.has(cell) ? null : { id: cell + 1, colour: 0 }),
    obstacles, jelly: Array(size * size).fill(false), goals: goals.map(goal => ({ ...goal, remaining: goal.count })),
    moves: 20, status: 'playing', locked: new Set(), turn: 0, combo: 0,
  }
}

test('an incomplete goal beats unrelated and already-completed obstacle goals', () => {
  const state = board([{ kind: 'box', count: 1 }, { kind: 'stone', count: 2 }], [
    obstacle('irrelevant-gift', 'gift', [0], 1, { stock: 8 }), obstacle('finished-stone', 'stone', [1]), obstacle('needed-box', 'box', [48]),
  ])
  state.goals[1]!.remaining = 0
  assert.deepEqual(propellerTargets(state), [48])
})

test('last power-only stone wins over incidental progress toward a large colour goal', () => {
  const state = board([{ kind: 'stone', count: 1 }, { kind: 'colour', colour: 0, count: 1000 }], [obstacle('stone', 'stone', [0])])
  assert.deepEqual(propellerTargets(state), [0])
  const targets = propellerTargets(state, { carry: 'tnt' })
  assert(targets.length > 0)
  assert(targets.every(cell => cell % 7 <= 2 && Math.floor(cell / 7) <= 2), 'every chosen TNT landing can hit the stone')
})

test('closed cuckoos cannot be destinations and an open stock-bearing nest remains useful', () => {
  const state = board([{ kind: 'cuckoo', count: 3 }], [
    obstacle('closed', 'cuckoo', [0, 1], 1, { open: false, stock: 3 }), obstacle('open', 'cuckoo', [47, 48], 1, { stock: 3 }),
  ])
  assert.deepEqual(propellerTargets(state), [47, 48])
  state.obstacles[1]!.open = false
  assert(propellerTargets(state).every(cell => ![0, 1, 47, 48].includes(cell)))
})

test('ready-to-collect obstacles outrank deeper layers, while partial layers beat irrelevant tiles', () => {
  const state = board([{ kind: 'box', count: 2 }], [obstacle('deep', 'box', [0], 4), obstacle('ready', 'box', [48])])
  assert.deepEqual(propellerTargets(state), [48])
  state.obstacles.pop(); state.pieces[48] = { id: 49, colour: 0 }
  assert.deepEqual(propellerTargets(state), [0])
})

test('gift yield is capped by remaining toys and collected only after the last layer', () => {
  const state = board([{ kind: 'toy', count: 3 }], [
    obstacle('many', 'gift', [0], 1, { stock: 3 }), obstacle('one', 'gift', [48], 1, { stock: 1 }),
    obstacle('deep', 'gift', [6], 2, { stock: 3 }),
  ])
  assert.deepEqual(propellerTargets(state), [0])
  state.goals[0]!.remaining = 1
  assert.deepEqual(propellerTargets(state), [0, 48], 'excess toys do not make an already sufficient hit look stronger')
})

test('a TNT carrier chooses a landing that reaches several goals instead of an isolated goal', () => {
  const state = board([{ kind: 'box', count: 4 }], [
    obstacle('a', 'box', [0]), obstacle('b', 'box', [1]), obstacle('c', 'box', [7]), obstacle('d', 'box', [48]),
  ])
  const targets = propellerTargets(state, { carry: 'tnt' })
  assert(targets.length > 0)
  assert(targets.every(cell => [0, 1, 7].every(target => Math.abs(target % 7 - cell % 7) <= 2 && Math.abs(Math.floor(target / 7) - Math.floor(cell / 7)) <= 2)))
})

test('when cargo covers the same objective either way, it visibly targets the live goal itself', () => {
  const state = board([{ kind: 'stone', count: 1 }], [obstacle('stone', 'stone', [0])])
  assert.deepEqual(propellerTargets(state, { carry: 'tnt' }), [0], 'incidental non-goal tile counts only break later ties')
})

test('rocket carriers evaluate the actual row or column of their landing', () => {
  const state = board([{ kind: 'box', count: 4 }], [
    obstacle('a', 'box', [7]), obstacle('b', 'box', [10]), obstacle('c', 'box', [13]), obstacle('d', 'box', [42]),
  ])
  assert(propellerTargets(state, { carry: 'rocket-h' }).every(cell => Math.floor(cell / 7) === 1))
  assert(propellerTargets(state, { carry: 'rocket-v' }).every(cell => cell % 7 === 0))
})

test('a multi-cell obstacle contributes only one hit to a rocket footprint', () => {
  const state = board([{ kind: 'box', count: 3 }], [
    obstacle('wide', 'box', [0, 1, 2, 3]), obstacle('a', 'box', [42]), obstacle('b', 'box', [48]),
  ])
  assert(propellerTargets(state, { carry: 'rocket-h' }).every(cell => Math.floor(cell / 7) === 6))
})

test('flyers reserve whole obstacle identities, avoiding another tile of an already doomed obstacle', () => {
  const state = board([{ kind: 'box', count: 2 }], [obstacle('wide', 'box', [0, 1]), obstacle('other', 'box', [48])])
  assert.deepEqual(propellerTargets(state, { reservations: [{ cell: 0 }] }), [48])
})

test('reserved damage can usefully finish a layered obstacle but prefers an equally useful free target', () => {
  const state = board([{ kind: 'box', count: 2 }], [obstacle('layered', 'box', [0], 2), obstacle('other', 'box', [48])])
  assert.deepEqual(propellerTargets(state, { reservations: [{ cell: 0 }] }), [48])
  state.obstacles.pop(); state.pieces[48] = { id: 49, colour: 0 }
  assert.deepEqual(propellerTargets(state, { reservations: [{ cell: 0 }] }), [0], 'a second hit is useful when the first does not destroy the obstacle')
})

test('cargo reservations project every hit so subsequent flyers spread across live goals', () => {
  const state = board([{ kind: 'box', count: 3 }], [
    obstacle('a', 'box', [0]), obstacle('b', 'box', [1]), obstacle('c', 'box', [48]),
  ])
  assert.deepEqual(propellerTargets(state, { reservations: [{ cell: 7, carry: 'tnt' }] }), [48])
})

test('colour objectives choose that colour and jelly spread only scores currently uncovered cells', () => {
  const state = board([{ kind: 'colour', colour: 2, count: 1 }])
  state.pieces[48]!.colour = 2
  assert.deepEqual(propellerTargets(state), [48])
  state.goals = [{ kind: 'jelly', count: 49, remaining: 1 }]
  state.jelly.fill(true); state.jelly[6] = false
  assert.deepEqual(propellerTargets(state, { spreadsJelly: true }), [6])
  assert.notDeepEqual(propellerTargets(state), [6], 'without carrying jelly, uncovered terrain has no goal benefit')
})

test('a colour goal without a specified colour counts every normal block, including reserved clears', () => {
  const state = board([{ kind: 'colour', count: 1 }, { kind: 'box', count: 2 }], [obstacle('box', 'box', [48], 2)])
  assert(propellerTargets(state).every(cell => cell !== 48), 'any normal block finishes the wildcard colour goal')
  assert.deepEqual(propellerTargets(state, { reservations: [{ cell: 0 }] }), [48], 'once the wildcard goal is reserved, another flyer works on the obstacle')
})

test('cutouts, launch neighbours and reserved colour pieces are not mistaken for useful targets', () => {
  const state = board([{ kind: 'colour', colour: 2, count: 2 }])
  state.pieces[0]!.colour = 2; state.pieces[6]!.colour = 2; state.pieces[48]!.colour = 2
  state.level.mask[0] = '0111111'
  assert.deepEqual(propellerTargets(state, { exclude: new Set([6]) }), [48])
  assert.deepEqual(propellerTargets(state, { reservations: [{ cell: 6 }] }), [48])
})

test('known power chains can advance a remote goal without projecting random future cascades', () => {
  const state = board([{ kind: 'stone', count: 1 }], [obstacle('stone', 'stone', [48])])
  state.pieces[42]!.power = 'rocket-h'
  assert.deepEqual(propellerTargets(state, { exclude: new Set([48]) }), [42])
})

test('target evaluation is deterministic and does not mutate the board or reservation inputs', () => {
  const state = board([{ kind: 'box', count: 2 }], [obstacle('a', 'box', [0], 2), obstacle('b', 'box', [48], 2)])
  const before = structuredClone(state), reservations = [{ cell: 0 }], originalReservations = structuredClone(reservations)
  const first = propellerTargets(state, { reservations })
  assert.deepEqual(propellerTargets(state, { reservations }), first)
  assert.deepEqual(state, before)
  assert.deepEqual(reservations, originalReservations)
  assert.deepEqual(propellerTargets(state), [0, 48], 'equal value remains a tie for the seeded engine chooser')
})
