import { test } from 'node:test'
import assert from 'node:assert/strict'
import { playLayout, playRegion } from './play-layout.ts'

test('phone, unfolded, tablet and desktop layouts depend on usable space', () => {
  for (const [w, h, expected] of [[320, 568, 'stack'], [390, 844, 'stack'],
    [720, 720, 'wide'], [900, 720, 'wide'], [844, 390, 'wide'],
    [1280, 800, 'wide'], [480, 800, 'stack']] as const) {
    assert.equal(playLayout(playRegion(w, h)), expected)
  }
})

test('continuous fold uses full surface; physical hinge never intersects chosen pane', () => {
  assert.deepEqual(playRegion(800, 720, [
    { left: 0, top: 0, width: 400, height: 720 },
    { left: 400, top: 0, width: 400, height: 720 },
  ]), { left: 0, top: 0, width: 800, height: 720 })
  assert.deepEqual(playRegion(840, 720, [
    { left: 0, top: 0, width: 400, height: 720 },
    { left: 440, top: 0, width: 400, height: 720 },
  ]), { left: 0, top: 0, width: 400, height: 720 })
  assert.deepEqual(playRegion(720, 900, [
    { left: 0, top: 0, width: 720, height: 400 },
    { left: 0, top: 440, width: 720, height: 460 },
  ]), { left: 0, top: 440, width: 720, height: 460 })
})

test('invalid/stale segment bounds fall back safely after window changes', () => {
  assert.deepEqual(playRegion(390, 844, [
    { left: 0, top: 0, width: 400, height: 720 },
    { left: 440, top: 0, width: NaN, height: 720 },
  ]), { left: 0, top: 0, width: 390, height: 844 })
})
