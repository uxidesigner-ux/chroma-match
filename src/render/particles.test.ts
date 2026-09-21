import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Effects, EFFECT_LIMITS } from './particles.ts'

test('effects have fixed upper bounds even during simultaneous blasts', () => {
  const effects = new Effects(() => false)
  for (let i = 0; i < 100; i++) {
    effects.burst(10, 20, '#fff', 40)
    effects.impact(10, 20, '#fff', 30)
    effects.float(10, 20, '+300', '#fff')
  }
  assert.deepEqual(effects.counts, EFFECT_LIMITS)
  effects.update(2)
  assert.deepEqual(effects.counts, { particles: 0, impacts: 0, texts: 0 })
})

test('clear releases every presentation effect on navigation', () => {
  const effects = new Effects(() => false)
  effects.burst(0, 0, '#fff')
  effects.impact(0, 0, '#fff', 20)
  effects.float(0, 0, '+40', '#fff')
  effects.clear()
  assert.deepEqual(effects.counts, { particles: 0, impacts: 0, texts: 0 })
})

test('reduced motion suppresses particles/rings but retains score feedback', () => {
  let calm = false
  const effects = new Effects(() => calm)
  effects.burst(0, 0, '#fff')
  effects.impact(0, 0, '#fff', 20)
  effects.float(0, 0, '+40', '#fff')
  calm = true
  effects.update(0.016)
  effects.burst(0, 0, '#fff')
  effects.impact(0, 0, '#fff', 20)
  assert.deepEqual(effects.counts, { particles: 0, impacts: 0, texts: 1 })
})

test('reduced motion draws score feedback at its original position and scale', () => {
  const effects = new Effects(() => true)
  const positions: number[][] = []
  const scales: number[][] = []
  const ctx = {
    save() {}, restore() {}, strokeText() {}, fillText() {},
    translate(x: number, y: number) { positions.push([x, y]) },
    scale(x: number, y: number) { scales.push([x, y]) },
  } as unknown as CanvasRenderingContext2D
  effects.float(20, 30, '+40', '#fff')
  effects.update(0.2)
  effects.draw(ctx)
  assert.deepEqual(positions, [[20, 30]])
  assert.deepEqual(scales, [[1, 1]])
})
