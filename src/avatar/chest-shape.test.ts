import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bustField, sculptChest } from './body-shape.ts'
import { refineChestSurface } from './chest-surface.ts'

const displaced = (x: number, y: number, z: number, amount = .064) => {
  const move = [0, 0, 0]
  bustField(amount, x, y, z, move)
  return [x + move[0]!, y + move[1]!, z + move[2]!]
}

test('chest cap has a gentle upper approach, firm rounded lower pole and bounded sizes', () => {
  const at = (x: number, y: number, amount = .064) => { const v = [0, 0, 0]; bustField(amount, x, y, .08, v); return v }
  const peak = at(.062, 1.155)[2]!
  assert.ok(peak > .063 && peak <= .064)
  const lower = at(.062, 1.095)[2]!, upper = at(.062, 1.215)[2]!
  assert.ok(lower / peak > .43 && lower / peak < .47, 'lower pole is too long or sharply pinched')
  assert.ok(upper > lower * 1.25, 'upper approach is not gentler than the lower return')
  assert.ok(Math.abs(at(.062, 1.095)[1]!) < .006, 'lower rows sag instead of rounding')
  for (const amount of [.022, .043, .064]) for (const x of [0, .025, .062, .10, .17]) for (const y of [.98, 1.01, 1.05, 1.10, 1.155, 1.21, 1.26, 1.30]) {
    const move = at(x, y, amount), mirror = at(-x, y, amount)
    assert.ok(Math.hypot(...move) <= amount + 1e-10)
    assert.ok(Math.abs(move[0]! + mirror[0]!) < 1e-10)
    assert.equal(move[1], mirror[1]); assert.equal(move[2], mirror[2])
    if (y <= 1.05 || y >= 1.28 || x >= .17) assert.deepEqual(move, [0, 0, 0])
  }
  const edge = 1.155 - .105
  assert.ok(at(.062, edge + .00001)[2]! < 1e-8, 'visible step at lower boundary')
  const upperEdge = 1.155 + .105 / .85
  assert.ok(at(.062, 1.26)[2]! > .004, 'gentle upper approach is prematurely cut off')
  assert.ok(at(.062, upperEdge - .00001)[2]! < 1e-8, 'visible step at upper boundary')
  assert.deepEqual(at(.062, upperEdge), [0, 0, 0])
  assert.equal(at(0, 1.10)[0], 0, 'centre seam pulled sideways')
  assert.ok(Math.abs(at(.000001, 1.10)[0]! - at(-.000001, 1.10)[0]!) < 1e-10, 'centre displacement is discontinuous')
  for (const z of [-.08, 0]) { const move = [1, 1, 1]; assert.equal(bustField(.064, .062, 1.1, z, move), 0); assert.deepEqual(move, [0, 0, 0]) }
})

test('chest normals follow actual deformed tangents above, below and across the cap', () => {
  const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!]
  for (const x of [.03, .062, .10]) for (const y of [1.015, 1.06, 1.10, 1.155, 1.20, 1.25, 1.265, 1.275]) {
    const z = .08, epsilon = .0001
    let normal = [0, 0, 1]
    const rest = { position: new Float32Array([x, y, z]), normal: new Float32Array(normal) }
    sculptChest(.064, false, rest, { setPosition: () => {}, setNormal: (_i, ...v) => { normal = v } })
    const tangent = (axis: number) => {
      // Measure at the same float32 point the sculpt consumes, especially
      // near the tighter lower boundary where gradients change fastest.
      const a = Array.from(rest.position), b = Array.from(rest.position); a[axis]! -= epsilon; b[axis]! += epsilon
      const p = displaced(a[0]!, a[1]!, a[2]!), q = displaced(b[0]!, b[1]!, b[2]!)
      return q.map((v, i) => (v - p[i]!) / (2 * epsilon))
    }
    for (const t of [tangent(0), tangent(1)]) assert.ok(Math.abs(t.reduce((sum, v, i) => sum + v * normal[i]!, 0)) < 2e-6, `normal not perpendicular at ${x}/${y}`)
    assert.ok(Math.abs(Math.hypot(...normal) - 1) < 1e-10)
    assert.ok(cross(tangent(0), tangent(1))[2]! > .75, 'surface folds inside out')
    if (x === .062 && y === 1.10) assert.ok(normal[1]! < -.35, 'underside still shaded like a flat front')
  }
})

test('chest edits never accumulate and male restores the immutable source including signed zero', () => {
  const rest = { position: new Float32Array([.062, 1.10, .08, -0, .83, -.075, .2, 1.1, .08]), normal: new Float32Array([0, 0, 1, -0, 0, -1, 1, 0, 0]) }
  const before = structuredClone(rest), position = rest.position.slice(), normal = rest.normal.slice()
  const into = { setPosition: (i: number, ...v: number[]) => position.set(v, i * 3), setNormal: (i: number, ...v: number[]) => normal.set(v, i * 3) }
  sculptChest(.064, false, rest, into); const once = position.slice()
  sculptChest(.022, false, rest, into); sculptChest(.064, false, rest, into)
  assert.deepEqual(position, once); assert.deepEqual(rest, before)
  sculptChest(0, false, rest, into)
  assert.deepEqual(position, rest.position); assert.deepEqual(normal, rest.normal)
})

test('the centre join has continuous depth slopes and normals, without offset-clothing splits', () => {
  const epsilon = 1e-6
  for (const y of [1.10, 1.155, 1.20]) {
    const centre = displaced(0, y, .08), left = displaced(-epsilon, y, .08), right = displaced(epsilon, y, .08)
    assert.ok(Math.abs((right[2]! - centre[2]!) / epsilon) < .001, 'right depth slope jumps at centre')
    assert.ok(Math.abs((centre[2]! - left[2]!) / epsilon) < .001, 'left depth slope jumps at centre')
    const normals = [-epsilon, 0, epsilon].map(x => {
      let result = [0, 0, 1]
      sculptChest(.064, false, { position: new Float32Array([x, y, .08]), normal: new Float32Array(result) }, { setPosition: () => {}, setNormal: (_i, ...v) => { result = v } })
      return result
    })
    assert.ok(Math.abs(normals[1]![0]!) < 1e-8, 'centred normal leans to one lobe')
    assert.ok(Math.hypot(...normals[0]!.map((v, i) => v - normals[2]![i]!)) < .001, 'centre normals pull offset clothing apart')
  }
})

test('local chest tessellation keeps rest planes, winding, shared edges, UVs and normalized bone weights', () => {
  const source = { positions: new Float32Array([.02, 1.04, .08, .10, 1.04, .08, .10, 1.20, .08, .02, 1.20, .08]), normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), uv: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), joints: new Uint16Array([1, 2, 0, 0, 1, 2, 0, 0, 1, 2, 0, 0, 1, 2, 0, 0]), weights: new Float32Array([.7, .3, 0, 0, .7, .3, 0, 0, .7, .3, 0, 0, .7, .3, 0, 0]), index: new Uint32Array([0, 1, 2, 0, 2, 3]) }
  const before = structuredClone(source), shape = refineChestSurface(source), edges = new Map<string, number>()
  assert.deepEqual(source, before); assert.deepEqual(shape.positions.slice(0, 12), source.positions)
  assert.ok(shape.positions.length > 1500 && shape.positions.length < 20000)
  let area = 0
  for (let i = 0; i < shape.index.length; i += 3) {
    const at = Array.from(shape.index.slice(i, i + 3)), [a, b, c] = at.map(v => Array.from(shape.positions.slice(v * 3, v * 3 + 3))) as [number[], number[], number[]]
    const twice = (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!)
    assert.ok(twice > 0); area += twice / 2
    at.forEach((a, j) => { const b = at[(j + 1) % 3]!, key = a < b ? `${a}/${b}` : `${b}/${a}`; edges.set(key, (edges.get(key) ?? 0) + 1) })
    for (let j = 0; j < 3; j++) {
      const a = at[j]!, b = at[(j + 1) % 3]!
      assert.ok(Math.hypot(...[0, 1, 2].map(k => shape.positions[a * 3 + k]! - shape.positions[b * 3 + k]!)) < .006, 'visible straight segment remains too long')
    }
  }
  assert.ok(Math.abs(area - .08 * .16) < 1e-8)
  for (const [edge, count] of edges) {
    assert.ok(count <= 2, 'non-manifold interior edge')
    if (count !== 1) continue
    const [a, b] = edge.split('/').map(Number)
    const onEdge = (axis: number, v: number) => Math.abs(shape.positions[a! * 3 + axis]! - v) < 1e-6 && Math.abs(shape.positions[b! * 3 + axis]! - v) < 1e-6
    assert.ok(onEdge(0, .02) || onEdge(0, .10) || onEdge(1, 1.04) || onEdge(1, 1.20), 'T-junction in interior')
  }
  for (let i = 0; i < shape.positions.length / 3; i++) {
    assert.equal(shape.positions[i * 3 + 2], source.positions[2])
    // Seven midpoint passes round metre-space positions and unit UVs
    // independently to float32; permit two millionths of a texture coordinate.
    assert.ok(Math.abs(shape.uv[i * 2]! - (shape.positions[i * 3]! - .02) / .08) < 2e-6)
    assert.ok(Math.abs(shape.uv[i * 2 + 1]! - (shape.positions[i * 3 + 1]! - 1.04) / .16) < 2e-6)
    assert.ok(Math.abs(shape.weights.slice(i * 4, i * 4 + 4).reduce((a, b) => a + b) - 1) < 1e-6)
  }
  assert.deepEqual(refineChestSurface(source), shape, 'three consumers must get identical attributes')
  const far = { ...source, positions: source.positions.map((v, i) => i % 3 === 1 ? v - .4 : v) }
  assert.deepEqual(refineChestSurface(far), far, 'unrelated geometry tessellated')
  const blended = { ...source, joints: new Uint16Array([28, 30, 0, 0, 28, 30, 0, 0, 28, 30, 0, 0, 28, 30, 0, 0]), weights: new Float32Array([.89, .11, 0, 0, .89, .11, 0, 0, .89, .11, 0, 0, .89, .11, 0, 0]) }
  assert.deepEqual(refineChestSurface(blended).index, shape.index, 'small shoulder blends left the upper torso coarse')
  const arm = { ...blended, weights: new Float32Array([.2, .8, 0, 0, .2, .8, 0, 0, .2, .8, 0, 0, .2, .8, 0, 0]) }
  assert.deepEqual(refineChestSurface(arm), arm, 'true arm geometry was refined')
  const curved = { ...source, normals: new Float32Array([0, -.6, .8, 0, -.6, .8, 0, .6, .8, 0, .6, .8]) }
  const arc = refineChestSurface(curved)
  const rise = Math.max(...arc.positions.filter((_, i) => i % 3 === 2)) - source.positions[2]!
  assert.ok(rise > .005 && rise < .03, 'curved samples must rise without exceeding the thin-face guard')
  assert.deepEqual(arc.positions.slice(0, 12), source.positions, 'original anchors moved')
})
