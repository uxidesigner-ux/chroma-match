import assert from 'node:assert/strict'
import { test } from 'node:test'
import { portraitFrame } from './portrait-frame.ts'

test('profile crop magnifies faces 1.85x with headroom, inside the cached image', () => {
  for (const edge of [32, 124, 256, 512]) {
    const { x, y, size } = portraitFrame(edge)
    assert.ok(Math.abs(edge / size - 1.85) < 1e-9)
    assert.equal(x + size / 2, edge / 2)
    assert.ok(Math.abs(y + size / 2 - edge * 0.365) < 1e-9)
    assert.ok(x >= 0 && y >= 0 && x + size <= edge && y + size <= edge)
  }
})

/*
 * The head, measured on the 256px capture the crop is applied to: the hair
 * reaches y=16 on the tallest build there is (a max-size head under long hair)
 * and y=53 on the shortest, and the chin sits at y≈151 on every one of them.
 * The crop has to hold the face and leave the collar out, and it has to do it
 * without being retuned every time the figure gains an axis.
 */
test('the crop holds the face and stops at the neck, on every build', () => {
  const { y, size } = portraitFrame(256)
  const chin = 151
  assert.ok(y + size > chin, 'the chin is inside it')
  assert.ok(y + size < chin + 20, 'and the collar under it is not')
  assert.ok(y < 53, 'the shortest head keeps its headroom')
  // The bust framing this replaced started at 32.5, so the tallest hair keeps
  // more of its crown than it used to rather than less.
  assert.ok(y < 32.5, 'and the tallest keeps more of its crown than before')
})
