import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ANIME_LOOKS, DEFAULT_ANIME, decodeAnime, encodeAnime } from './anime-spec.ts'
import { DEFAULT_SPEC, SPEC_MAX, decodeSpec, encodeSpec, isKnownSpec } from './spec.ts'

test('anime appearance and the original wardrobe survive a profile round trip within live rules', () => {
  for (const look of ANIME_LOOKS) {
    const spec = { ...DEFAULT_SPEC, hair: 'long', anime: look }
    const code = encodeSpec(spec)
    assert.equal(code.length, 74)
    assert.ok(code.length <= SPEC_MAX)
    assert.match(code, /^[a-zA-Z0-9-]+$/)
    assert.deepEqual(decodeSpec(code), spec)
    assert.equal(isKnownSpec(code), true)
  }
})

test('unknown or truncated anime data keeps the old wardrobe, never an arbitrary model URL', () => {
  const base = '3' + encodeSpec(DEFAULT_SPEC)
  for (const data of [
    '',
    'https://example.com/asset.vrm',
    'ZTN' + 'F'.repeat(24),
    'STN000',
    'STN' + 'X'.repeat(24),
  ]) {
    assert.deepEqual(decodeSpec(base + data), DEFAULT_SPEC)
    assert.equal(decodeAnime(data), undefined)
  }
})

test('every offered hairstyle and expression has a stable code; colours normalize', () => {
  for (const hair of ['tails', 'bob'] as const)
    for (const expression of ['neutral', 'happy', 'relaxed'] as const)
      for (const equipment of ['none', 'gear'] as const) {
        const spec = { ...DEFAULT_ANIME, hair, expression, equipment, hairColour: 'abc123' }
        assert.deepEqual(decodeAnime(encodeAnime(spec)), { ...spec, hairColour: 'ABC123' })
      }
})
