import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_SETTINGS, normalizeSettings } from './royal-settings.ts'

test('absent or corrupted preferences recover all defaults', () => {
  for (const value of [undefined, null, [], ['hard'], 'corrupt', 42, false]) {
    assert.deepEqual(normalizeSettings(value), DEFAULT_SETTINGS)
  }
  const normalized = normalizeSettings({})
  normalized.level = 9
  assert.equal(DEFAULT_SETTINGS.level, 1)
})

test('malformed fields and invalid enums recover independently', () => {
  const normalized = normalizeSettings({
    level: '12', moves: NaN, seed: Infinity, obstacleDensity: null,
    difficulty: 'expert', shape: 'circle', autoDensity: 'false',
    unlimitedMoves: 1, unlimitedTools: 'true', calm: null, sound: 0,
    unexpected: true,
  })
  assert.deepEqual(normalized, DEFAULT_SETTINGS)
  assert.equal(Object.hasOwn(normalized, 'unexpected'), false)
  assert.deepEqual(normalizeSettings(Object.create({ level: 50, sound: false })), DEFAULT_SETTINGS)
})

test('limits protect mission generation from oversized saved values', () => {
  const high = normalizeSettings({ level: 100000, moves: 500, seed: 1e20, obstacleDensity: 1 })
  assert.deepEqual([high.level, high.moves, high.seed, high.obstacleDensity], [999, 99, 2147483647, 0.4])
  const low = normalizeSettings({ level: -10, moves: -10, seed: -10, obstacleDensity: -1 })
  assert.deepEqual([low.level, low.moves, low.seed, low.obstacleDensity], [1, 0, 1, 0])
  assert.equal(normalizeSettings({ moves: 3 }).moves, 5)
  assert.equal(normalizeSettings({ moves: 0 }).moves, 0)
  assert.equal(normalizeSettings({ level: 12.8, seed: 2026.3 }).level, 13)
  assert.equal(normalizeSettings({ level: 12.8, seed: 2026.3 }).seed, 2026)
})

test('valid playground choices survive without mutation or loss of precision', () => {
  const input = {
    level: 77, difficulty: 'hard', shape: 'courtyard', obstacleDensity: 0.275,
    autoDensity: false, moves: 35, seed: 9128, unlimitedMoves: true,
    unlimitedTools: true, calm: true, sound: false,
  }
  assert.deepEqual(normalizeSettings(input), input)
  assert.notEqual(normalizeSettings(input), input)
  for (const difficulty of ['easy', 'normal', 'hard']) {
    for (const shape of ['auto', 'rectangle', 'courtyard', 'bridge']) {
      const result = normalizeSettings({ difficulty, shape })
      assert.equal(result.difficulty, difficulty)
      assert.equal(result.shape, shape)
    }
  }
})
