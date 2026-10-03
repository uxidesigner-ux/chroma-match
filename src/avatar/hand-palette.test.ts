import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanHandPixels } from './hand-palette.ts'

test('only cyan finger pixels in the known atlas island change; skin, glove, face and alpha remain', () => {
  const width = 100, height = 100, pixels = new Uint8ClampedArray(width * height * 4)
  const put = (x: number, y: number, value: number[]) => pixels.set(value, (y * width + x) * 4)
  put(85, 5, [50, 160, 200, 255]); put(90, 5, [40, 130, 150, 128])
  put(85, 10, [255, 238, 211, 255]); put(90, 10, [15, 14, 20, 255])
  put(50, 5, [50, 160, 200, 255]); put(85, 40, [50, 160, 200, 255])
  const before = pixels.slice(); cleanHandPixels(pixels, width, height)
  for (let at = 0; at < pixels.length; at += 4) {
    if ([585, 590].includes(at / 4)) {
      assert.ok(pixels[at]! > pixels[at + 1]! && pixels[at + 1]! > pixels[at + 2]!)
      assert.equal(pixels[at + 3], before[at + 3])
    } else assert.deepEqual(pixels.slice(at, at + 4), before.slice(at, at + 4))
  }
  const clean = pixels.slice(); cleanHandPixels(pixels, width, height); assert.deepEqual(pixels, clean)
  assert.throws(() => cleanHandPixels(pixels, width + 1, height))
})
