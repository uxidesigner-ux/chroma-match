import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hairGeometry, hairShading } from './hair-strands.ts'

test('short styles have distinct bounded fitted crowns, outward normals and continuous UV seams', () => {
  const fade = hairGeometry('fade')!, pomade = hairGeometry('pomade')!
  assert.notDeepEqual(fade.positions, pomade.positions)
  for (const style of ['fade', 'pomade'] as const) {
    const shape = hairGeometry(style)!, count = shape.positions.length / 3
    assert.ok(count < 4000)
    assert.ok([...shape.positions, ...shape.normals, ...shape.uv].every(Number.isFinite))
    assert.ok([...shape.index].every(i => i < count))
    assert.equal(shape.normals.length, shape.positions.length)
    assert.equal(shape.uv.length, count * 2)
    assert.deepEqual(shape, hairGeometry(style, true), 'short cuts are unaffected by backpack')
    const layer = 1 + 18 * 65, stride = 65
    for (let inner = 0; inner < 2; inner++) for (let row = 0; row < 18; row++) {
      const a = (inner * layer + 1 + row * stride) * 3, b = a + 64 * 3
      assert.deepEqual(shape.positions.slice(a, a + 3), shape.positions.slice(b, b + 3))
      assert.deepEqual(shape.normals.slice(a, a + 3), shape.normals.slice(b, b + 3), 'no lighting seam at the rear UV join')
    }
    for (let i = 0; i < count; i++) assert.ok(Math.abs(Math.hypot(...shape.normals.slice(i * 3, i * 3 + 3)) - 1) < 1e-5)
    const front = (1 + 10 * stride) * 3
    assert.ok(shape.normals[front + 2]! > .4, 'front faces outward, not through the forehead')
    const pixels = hairShading(style)
    assert.deepEqual(pixels, hairShading(style))
    const values = pixels.rgba.filter((_, i) => i % 4 === 0)
    assert.ok(values.filter(v => v >= 232).length / values.length > .80)
    for (let i = 0; i < pixels.rgba.length; i += 4) {
      assert.equal(pixels.rgba[i], pixels.rgba[i + 1]); assert.equal(pixels.rgba[i], pixels.rgba[i + 2]); assert.equal(pixels.rgba[i + 3], 255)
    }
  }
})

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
    assert.ok(count < 4000, 'bounded mobile geometry including continuous crown')
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
    const key = (values: number[]) => values.map(v => (Math.abs(v) < .000005 ? 0 : v).toFixed(5)).join('|')
    const points = new Set(Array.from({ length: count }, (_, i) =>
      key(Array.from(shape.positions.slice(i * 3, i * 3 + 3)))))
    for (let i = 0; i < count; i++) {
      const [x, y, z] = shape.positions.slice(i * 3, i * 3 + 3)
      const mirrored = key([-x!, y!, z!])
      assert.ok(points.has(mirrored), `${style} is asymmetric: ${mirrored}`)
    }
    // Centre back, outer layer: face outward toward -Z, not into the scalp.
    const at = (18 * 65 + 32) * 3
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
    assert.ok(pixels.rgba[i]! >= 158 && pixels.rgba[i]! <= 255)
  }
  const shades = pixels.rgba.filter((_, i) => i % 4 === 0)
  assert.ok(shades.reduce((a, b) => Math.min(a, b), 255) < 200, 'sparse separations must survive the lit white surface')
  assert.equal(shades.reduce((a, b) => Math.max(a, b), 0), 255)
  assert.ok(shades.filter(value => value >= 232).length / shades.length > .85, 'most of the carrier remains near-white')
  assert.ok(shades.filter(value => value < 220).length / shades.length < .12, 'no all-over grey wash')
})

test('strand lines vary their spacing, width and length, taper and curve without noisy texels', () => {
  const { width, height, rgba } = hairShading()
  assert.ok(width <= 512 && height <= 512, 'one bounded mobile texture, not strand geometry')
  const at = (x: number, y: number) => rgba[(y * width + x) * 4]!
  const runs = (y: number) => {
    const out: { middle: number; width: number }[] = []
    let start = -1
    for (let x = 0; x <= width; x++) {
      if (x < width && at(x, y) < 220) { if (start < 0) start = x }
      else if (start >= 0) { out.push({ middle: (start + x - 1) / 2, width: x - start }); start = -1 }
    }
    return out
  }
  const middle = runs(Math.floor(height / 2)), early = runs(Math.floor(height * .25))
  assert.ok(middle.length >= 12 && middle.length <= 20)
  assert.ok(new Set(middle.map(run => run.width)).size >= 2, 'not identical line weights')
  assert.ok(new Set(middle.slice(1).map((run, i) => run.middle - middle[i]!.middle)).size >= 4, 'not a regular comb')
  assert.notDeepEqual(middle, early, 'paths follow the length rather than straight UV stripes')
  assert.equal(runs(0).length, 0, 'soft root, not an ink seam')
  assert.equal(runs(height - 1).length, 0, 'tapered ends, not squared-off lines')
  let maximumStep = 0
  for (let y = 0; y < height - 1; y++) for (let x = 0; x < width; x++)
    maximumStep = Math.max(maximumStep, Math.abs(at(x, y + 1) - at(x, y)))
  assert.ok(maximumStep < 12, 'smooth along the hair flow, no random speckle')
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

test('crown and curtain share a continuous rounded silhouette and root-to-tip UV flow', () => {
  for (const style of ['bob', 'long'] as const) {
    const shape = hairGeometry(style)!, stride = 65
    const layer = shape.positions.length / 3 / 2, rows = layer / stride - 1
    assert.ok(shape.positions[1]! > .25, 'the surface reaches the crown, not a rim halfway down the head')
    for (let column = 0; column < stride; column++) {
      assert.ok(Math.abs(shape.uv[column * 2 + 1]!) < 1e-6)
      assert.ok(Math.abs(shape.uv[(rows * stride + column) * 2 + 1]! - 1) < 1e-6)
      let previous: number[] | undefined
      for (let row = 1; row <= rows; row++) {
        const a = ((row - 1) * stride + column) * 3, b = (row * stride + column) * 3
        assert.ok(shape.uv[(b / 3) * 2 + 1]! > shape.uv[(a / 3) * 2 + 1]!, 'UV does not restart at the old crown seam')
        const delta = [0, 1, 2].map(axis => shape.positions[b + axis]! - shape.positions[a + axis]!)
        const length = Math.hypot(...delta), direction = delta.map(value => value / length)
        assert.ok(length > 1e-5, 'no collapsed rows')
        if (previous) {
          const cosine = Math.min(1, Math.max(-1, direction.reduce((sum, value, axis) => sum + value * previous![axis]!, 0)))
          assert.ok(Math.acos(cosine) < Math.PI / 9, 'adjacent contour segments turn less than 20 degrees')
        }
        previous = direction
      }
    }
  }
})

test('the curtain falls from the widest crown without an inward neck waist', () => {
  for (const style of ['bob', 'long'] as const) for (const pack of [false, true]) {
    const shape = hairGeometry(style, pack)!, stride = 65
    const rows = shape.positions.length / 3 / 2 / stride - 1
    for (let column = 0; column < stride; column++) {
      let lastWidth = 0, lastBack = 0
      for (let row = 0; row <= rows; row++) {
        const at = (row * stride + column) * 3
        if (shape.positions[at + 1]! > .1351) continue
        const width = Math.abs(shape.positions[at]!), back = -shape.positions[at + 2]!
        assert.ok(width >= lastWidth - 1e-6, `${style}/${pack}: no inward side pinch below the crown`)
        if (column === 32) assert.ok(back >= lastBack - 1e-6, `${style}/${pack}: no inward rear pinch below the crown`)
        lastWidth = width; lastBack = back
      }
    }
  }
})
