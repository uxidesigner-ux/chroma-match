import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hairStrands, mirror, normalsFor, straighten, strandRotation } from './hair-strands.ts'

/** Applies a quaternion to one point, the way a renderer or a reader would. */
function spin(q: readonly [number, number, number, number], p: readonly number[]): number[] {
  const [qx, qy, qz, qw] = q
  const [x, y, z] = p as [number, number, number]
  const ix = qw * x + qy * z - qz * y
  const iy = qw * y + qz * x - qx * z
  const iz = qw * z + qx * y - qy * x
  const iw = -qx * x - qy * y - qz * z
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ]
}

const near = (a: number, b: number, slack = 1e-6) => assert.ok(Math.abs(a - b) < slack, `${a} ≉ ${b}`)

/*
 * The whole point of straightening: the ponytail hangs down, back and to one
 * side at once, and copies of that diagonal stack into a scarf rather than a
 * curtain. Afterwards it has to hang along -Y and keep its own length.
 */
test('a strand is stood upright without being stretched', () => {
  // A strand hanging down, back and to the left, like the one on the model.
  const strand = new Float32Array([0, 0, 0, -0.06, -0.1, -0.09, -0.13, -0.2, -0.17, -0.195, -0.293, -0.262])
  const up = straighten(strand)
  const lengthOf = (a: Float32Array, i: number) => Math.hypot(a[i]!, a[i + 1]!, a[i + 2]!)
  for (let i = 0; i < strand.length; i += 3) near(lengthOf(up, i), lengthOf(strand, i), 1e-5)
  // The tip now hangs straight down: no sideways or fore-and-aft reach left.
  const tip = up.length - 3
  assert.ok(up[tip + 1]! < -0.3, 'and it hangs downward, not upward')
  near(up[tip]!, 0, 1e-6)
  near(up[tip + 2]!, 0, 1e-6)
})

test('a strand already upright is left exactly as it is', () => {
  const strand = new Float32Array([0, 0, 0, 0, -0.1, 0, 0, -0.2, 0])
  assert.deepEqual(Array.from(straighten(strand)), Array.from(strand))
})

/*
 * The mirror exists so a fan does not show its tapered edge down one side and
 * its smooth edge down the other. Doing it by geometry rather than a negative
 * scale means the triangles have to be rewound, or every mirrored strand faces
 * inward.
 */
test('mirroring flips across X and rewinds the triangles', () => {
  const positions = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9])
  const index = new Uint32Array([0, 1, 2])
  const flipped = mirror(positions, index)
  assert.deepEqual(Array.from(flipped.positions), [-1, 2, 3, -4, 5, 6, -7, 8, 9])
  assert.deepEqual(Array.from(flipped.index), [0, 2, 1])
  assert.deepEqual(Array.from(positions), [1, 2, 3, 4, 5, 6, 7, 8, 9], 'the source is untouched')

  // And the mirrored copy faces outward rather than into the head.
  const front = normalsFor(positions, index)
  const back = normalsFor(flipped.positions, flipped.index)
  near(front[0]!, -back[0]!, 1e-6)
  near(front[1]!, back[1]!, 1e-6)
  near(front[2]!, back[2]!, 1e-6)
})

test('normals come out as unit vectors', () => {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
  const normals = normalsFor(positions, new Uint32Array([0, 1, 2]))
  for (let i = 0; i < normals.length; i += 3)
    near(Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!), 1)
})

/*
 * The preview turns a strand with three.js and the exported file carries a
 * quaternion, so the two have to agree on what the angles mean or a character
 * opened elsewhere wears its hair somewhere else.
 */
test('the rotation turns, leans and rolls in that order', () => {
  // A quarter turn about the up axis takes what points back round to one side.
  near(spin(strandRotation({ turn: Math.PI / 2, lean: 0, roll: 0, at: [0, 0, 0], length: 1, flip: false }), [0, 0, -1])[0]!, -1)
  // A lean tips a hanging strand backward, not forward.
  const leaned = spin(strandRotation({ turn: 0, lean: 0.4, roll: 0, at: [0, 0, 0], length: 1, flip: false }), [0, -1, 0])
  assert.ok(leaned[2]! < -0.3, 'a lean sends the tip behind the head')
  // A roll swings it out to the side, and the sign says which side.
  const rolled = spin(strandRotation({ turn: 0, lean: 0, roll: 0.4, at: [0, 0, 0], length: 1, flip: false }), [0, -1, 0])
  assert.ok(rolled[0]! > 0.3, 'a positive roll swings the tip to +X')
  // No angles at all is no rotation.
  const still = strandRotation({ turn: 0, lean: 0, roll: 0, at: [0, 0, 0], length: 1, flip: false })
  assert.deepEqual(still.map((n) => Math.round(n)), [0, 0, 0, 1])
})

/*
 * What each style actually stands around the head. The ponytail style adds
 * nothing — it is the model as rigged, and a curtain would bury the one part
 * that swings — and every other style has to be symmetric, because a head of
 * hair that is heavier on one side reads as a mistake rather than a style.
 */
test('every style is symmetric, and only the long one has a curtain', () => {
  assert.deepEqual(hairStrands('tails'), [], 'the ponytail style is the model as it ships')

  for (const style of ['bob', 'long'] as const) {
    const strands = hairStrands(style)
    assert.ok(strands.length > 0, `${style} adds hair`)
    // Mirroring the set has to give the same set back.
    const key = (turn: number, at: readonly number[], length: number) =>
      `${turn.toFixed(4)}|${at.map((n) => n.toFixed(4))}|${length.toFixed(4)}`
    const left = strands.map((s) => key(s.turn, s.at, s.length)).sort()
    const right = strands.map((s) => key(-s.turn, [-s.at[0]!, s.at[1]!, s.at[2]!], s.length)).sort()
    assert.deepEqual(left, right, `${style} hangs the same on both sides`)
    /*
     * Mirrored evenly, so neither edge of the fan is the tapered one. Not
     * exactly half: a fan of an odd count has one strand on the centre line,
     * and that one is its own partner.
     */
    const flipped = strands.filter((s) => s.flip).length
    const centred = strands.filter((s) => s.turn === 0 && s.at[0] === 0).length
    assert.ok(centred <= 1, `${style} has at most one strand on the centre line`)
    assert.ok(
      Math.abs(strands.length - flipped * 2) <= centred,
      `${style} mirrors all but its centre strand (${flipped} of ${strands.length})`,
    )
    for (const strand of strands) assert.ok(strand.length > 0, 'no strand is inside out or empty')
  }

  // Only the long style hangs anything behind the head.
  assert.ok(hairStrands('long').some((s) => s.lean > 0), 'long has a curtain leaning back')
  assert.ok(!hairStrands('bob').some((s) => s.lean > 0), 'a bob is locks beside the face only')
  // And it is longer than the bob, or the two would be the same style twice.
  const longest = (style: 'bob' | 'long') => Math.max(...hairStrands(style).map((s) => s.length))
  assert.ok(longest('long') > longest('bob'), 'long hair is longer than a bob')
})
