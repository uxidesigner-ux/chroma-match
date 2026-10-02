import assert from 'node:assert/strict'
import { test } from 'node:test'
import { figureScale, seatField, sculptChest, sculptSeat } from './body-shape.ts'

test('the seat has a rounded foundation even at minimum hips, with bounded symmetric falloff', () => {
  const peak = seatField(.06, .83, -.075)
  assert.ok(peak >= .031 && peak <= .0321)
  assert.ok(peak * figureScale(0, .26) > .023, 'minimum hips erased the rounded foundation')
  for (const x of [0, .04, .08, .12, .16, .18]) for (const y of [.65, .68, .72, .78, .83, .88, .94, .95, 1]) {
    const value = seatField(x, y, -.075)
    assert.ok(value >= 0 && value <= .0321)
    assert.equal(value, seatField(-x, y, -.075))
    if (y <= .68 || y >= .95 || x >= .165) assert.equal(value, 0)
  }
  for (const z of [0, .05, -.005, -.008]) assert.equal(seatField(.06, .83, z), 0, 'belly/forward surface moved')
})

test('seat sculpt keeps hands, front, lower legs and source untouched and never accumulates', () => {
  const rest = {
    position: new Float32Array([.06, .83, -.075, -.06, .83, -.075, .06, .83, .075, .06, .5, -.075, .06, .83, -.075]),
    normal: new Float32Array([0, 0, -1, 0, 0, -1, 0, 0, 1, 0, 0, -1, 0, 0, -1]),
    joints: new Uint16Array([3, 0, 0, 0, 3, 0, 0, 0, 3, 0, 0, 0, 3, 0, 0, 0, 36, 0, 0, 0]),
    weights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
  }
  const original = rest.position.slice(), position = rest.position.slice(), normal = rest.normal.slice()
  const into = { setPosition: (i: number, x: number, y: number, z: number) => position.set([x, y, z], i * 3), setNormal: (i: number, x: number, y: number, z: number) => normal.set([x, y, z], i * 3) }
  const apply = () => { sculptChest(0, false, rest, into); sculptSeat(rest, into) }
  apply(); const once = position.slice(); apply()
  assert.deepEqual(position, once)
  assert.deepEqual(rest.position, original)
  assert.ok(position[2]! < original[2]! - .03)
  assert.equal(position[2], position[5])
  assert.deepEqual(position.slice(6), original.slice(6))
  for (let i = 0; i < normal.length; i += 3) assert.ok(Math.abs(Math.hypot(...normal.slice(i, i + 3)) - 1) < 1e-6)
})

test('seat normals are perpendicular to the deformed surface, including the side transition', () => {
  const x = .13, y = .88, z = -.03, epsilon = .0001
  const rest = { position: new Float32Array([x, y, z]), normal: new Float32Array([0, 0, -1]), joints: [3, 0, 0, 0], weights: [1, 0, 0, 0] }
  let normal = [0, 0, -1]
  sculptSeat(rest, { setPosition: () => {}, setNormal: (_i, nx, ny, nz) => { normal = [nx, ny, nz] } })
  const dx = -(seatField(x + epsilon, y, z) - seatField(x - epsilon, y, z)) / (2 * epsilon)
  const dy = -(seatField(x, y + epsilon, z) - seatField(x, y - epsilon, z)) / (2 * epsilon)
  assert.ok(Math.abs(normal[0]! + dx * normal[2]!) < 1e-6)
  assert.ok(Math.abs(normal[1]! + dy * normal[2]!) < 1e-6)
})
