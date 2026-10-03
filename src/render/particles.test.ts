import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Effects, EFFECT_LIMITS, fitFloatingText } from './particles.ts'

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

test('floating scores keep text and halo inside all four canvas edges, even after drift', () => {
  for (const scale of [1, 1.35, 3]) for (const [x, y] of [[-60, -40], [0, 0], [280, 420], [400, 600], [140, 210]]) {
    const placed = fitFloatingText(x!, y!, 180, 28, scale, { width: 280, height: 420 })
    assert.ok(placed.x - 90 * placed.scale >= 4)
    assert.ok(placed.x + 90 * placed.scale <= 276)
    assert.ok(placed.y - 14 * placed.scale >= 4)
    assert.ok(placed.y + 14 * placed.scale <= 416)
    assert.ok(placed.scale <= scale)
  }
})

test('an unusually wide score is fitted, rather than truncated or sent outside the canvas', () => {
  const placed = fitFloatingText(0, 0, 1000, 30, 1.35, { width: 280, height: 420 })
  assert.equal(placed.scale, .272)
  assert.equal(placed.x, 140)
  assert.ok(placed.y >= 4)
})

test('scores respect a scrolled visible slice, not the entire backing canvas', () => {
  for (const [x, y] of [[0, 0], [280, 420], [140, 85]]) {
    const placed = fitFloatingText(x!, y!, 180, 28, 1.35, { left: 10, top: 80, width: 260, height: 150 })
    assert.ok(placed.x - 90 * placed.scale >= 14 - 1e-9)
    assert.ok(placed.x + 90 * placed.scale <= 266 + 1e-9)
    assert.ok(placed.y - 14 * placed.scale >= 84 - 1e-9)
    assert.ok(placed.y + 14 * placed.scale <= 226 + 1e-9)
  }
  assert.equal(fitFloatingText(0, 0, 180, 28, 1, { width: 0, height: 0 }).scale, 0)
})
