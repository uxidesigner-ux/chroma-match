import assert from 'node:assert/strict'
import { test } from 'node:test'
import { portraitFrame } from './portrait-frame.ts'

test('profile crop magnifies faces 1.65x with headroom, inside the cached image', () => {
  for (const edge of [32, 124, 256, 512]) {
    const { x, y, size } = portraitFrame(edge)
    assert.equal(edge / size, 1.65)
    assert.equal(x + size / 2, edge / 2)
    assert.equal(y + size / 2, edge * 0.43)
    assert.ok(x >= 0 && y >= 0 && x + size <= edge && y + size <= edge)
  }
})
