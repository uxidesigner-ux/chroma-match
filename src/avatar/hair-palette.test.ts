import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bleachHairPixels, HAIR_WHITE_FLOOR } from './hair-palette.ts'

test('bleaching removes the source hue and reaches white without flattening strand detail', () => {
  const rgba = Uint8ClampedArray.from([0, 0, 0, 255, 9, 87, 21, 255, 22, 174, 44, 255])
  bleachHairPixels(rgba)
  assert.deepEqual(Array.from(rgba), [232, 232, 232, 255, 244, 244, 244, 255, 255, 255, 255, 255])
  assert.equal(HAIR_WHITE_FLOOR, 232)
})

test('invisible source pixels do not darken the white point; alpha stays untouched', () => {
  const rgba = Uint8ClampedArray.from([255, 0, 99, 0, 12, 80, 14, 255, 12, 40, 14, 57])
  bleachHairPixels(rgba)
  assert.deepEqual(Array.from(rgba), [255, 255, 255, 0, 255, 255, 255, 255, 244, 244, 244, 57])
})

test('black, white and empty source textures remain bounded and deterministic', () => {
  for (const source of [[], [0, 0, 0, 255], [255, 255, 255, 255], [0, 0, 0, 0]]) {
    const first = Uint8ClampedArray.from(source), second = Uint8ClampedArray.from(source)
    bleachHairPixels(first); bleachHairPixels(second)
    assert.deepEqual(first, second)
    for (let i = 0; i < first.length; i += 4) {
      assert.ok(first[i]! >= 232 && first[i]! <= 255)
      assert.equal(first[i], first[i + 1]); assert.equal(first[i], first[i + 2])
      assert.equal(first[i + 3], source[i + 3])
    }
  }
  assert.throws(() => bleachHairPixels(new Uint8ClampedArray(3)), RangeError)
})
