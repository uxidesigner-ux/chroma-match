import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reducedMotion } from './motion.ts'

test('local calm setting takes effect immediately without a browser media query', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const dataset = { calm: 'false' }
  try {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: { dataset } } })
    assert.equal(reducedMotion(), false)
    dataset.calm = 'true'
    assert.equal(reducedMotion(), true)
    dataset.calm = 'false'
    assert.equal(reducedMotion(), false)
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})
