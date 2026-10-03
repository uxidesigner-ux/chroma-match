import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hairGeometry, hairShading } from './hair-strands.ts'

test('ponytail remains the licensed original; new cuts carry their own geometry', () => {
  assert.equal(hairGeometry('tails'), null)
  const bob = hairGeometry('bob')!, long = hairGeometry('long')!
  const low = (values: Float32Array) => Math.min(...values.filter((_, i) => i % 3 === 1))
  assert.ok(low(bob.positions) > -.08, 'bob stops at the jaw/neck')
  assert.ok(low(long.positions) < -.35, 'long reaches mid-back, not a stretched bob')
})

test('both cuts are closed, symmetric, finite shells with usable outward normals', () => {
  for (const style of ['bob', 'long'] as const) {
    const shape = hairGeometry(style)!
    const count = shape.positions.length / 3
    assert.ok(count < 2000, 'bounded mobile geometry')
    for (const values of [shape.positions, shape.normals, shape.uv])
      assert.ok(values.every(Number.isFinite))
    assert.equal(shape.normals.length, shape.positions.length)
    assert.equal(shape.uv.length, count * 2)
    const edges = new Map<string, number>()
    for (let i = 0; i < shape.index.length; i += 3) {
      const triangle = Array.from(shape.index.slice(i, i + 3))
      for (let edge = 0; edge < 3; edge++) {
        const a = triangle[edge]!, b = triangle[(edge + 1) % 3]!
        assert.ok(a >= 0 && a < count && b >= 0 && b < count)
        const key = a < b ? `${a}:${b}` : `${b}:${a}`
        edges.set(key, (edges.get(key) ?? 0) + 1)
      }
    }
    assert.ok([...edges.values()].every(n => n === 2), 'no open ribbon edges/gaps')
    for (let i = 0; i < count; i++) {
      const n = shape.normals.slice(i * 3, i * 3 + 3)
      assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-5)
    }
    const points = new Set(Array.from({ length: count }, (_, i) =>
      Array.from(shape.positions.slice(i * 3, i * 3 + 3)).map(v => v.toFixed(5)).join('|')))
    for (let i = 0; i < count; i++) {
      const [x, y, z] = shape.positions.slice(i * 3, i * 3 + 3)
      const mirrored = [-x!, y!, z!].map(v => (Math.abs(v) < .000005 ? 0 : v).toFixed(5)).join('|')
      assert.ok(points.has(mirrored), `${style} is asymmetric: ${mirrored}`)
    }
    // Centre back, outer layer: face outward toward -Z, not into the scalp.
    const at = (6 * 65 + 32) * 3
    assert.ok(shape.normals[at + 2]! < -.8)
  }
})

test('strand shading is opaque, neutral, bounded and deterministic', () => {
  const pixels = hairShading()
  assert.deepEqual(pixels, hairShading())
  assert.equal(pixels.rgba.length, pixels.width * pixels.height * 4)
  for (let i = 0; i < pixels.rgba.length; i += 4) {
    assert.equal(pixels.rgba[i], pixels.rgba[i + 1])
    assert.equal(pixels.rgba[i], pixels.rgba[i + 2])
    assert.equal(pixels.rgba[i + 3], 255)
    assert.ok(pixels.rgba[i]! >= 232 && pixels.rgba[i]! <= 255)
  }
  const shades = pixels.rgba.filter((_, i) => i % 4 === 0)
  assert.equal(Math.min(...shades), 232)
  assert.equal(Math.max(...shades), 255)
})

test('gear clearance moves long hair backward, never widens or changes its cut', () => {
  const bare = hairGeometry('long')!, equipped = hairGeometry('long', true)!
  assert.deepEqual(bare.index, equipped.index)
  for (let i = 0; i < bare.positions.length; i += 3) {
    assert.equal(bare.positions[i], equipped.positions[i])
    assert.equal(bare.positions[i + 1], equipped.positions[i + 1])
    assert.ok(equipped.positions[i + 2]! <= bare.positions[i + 2]! + 1e-7)
  }
  assert.deepEqual(hairGeometry('bob'), hairGeometry('bob', true))
})
