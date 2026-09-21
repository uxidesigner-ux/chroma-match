import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ANIME_LOOKS, DEFAULT_ANIME, decodeAnime, encodeAnime, gearFromBits } from './anime-spec.ts'
import { DEFAULT_SPEC, SPEC_MAX, decodeSpec, encodeSpec, isKnownSpec } from './spec.ts'

test('anime appearance survives a profile round trip within live rules', () => {
  for (const look of ANIME_LOOKS) {
    const spec = look
    const code = encodeSpec(spec)
    assert.equal(code.length, 29)
    assert.ok(code.length <= SPEC_MAX)
    assert.match(code, /^[a-zA-Z0-9-]+$/)
    assert.deepEqual(decodeSpec(code), spec)
    assert.equal(isKnownSpec(code), true)
  }
})

test('unknown or truncated anime data uses the starter, never an arbitrary model URL', () => {
  const base = '4'
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

test('mixed explorer pieces survive a profile round trip', () => {
  const spec = { ...DEFAULT_ANIME, pack: true, visor: true, hair: 'bob' as const }
  const code = encodeSpec(spec)
  assert.equal(code[0], '6')
  assert.equal(code.length, 29)
  assert.deepEqual(decodeSpec(code), spec)
})

test('classic kit encodings round trip hair, expression and equipment', () => {
  for (const hair of ['tails', 'bob'] as const)
    for (const expression of ['neutral', 'happy', 'relaxed'] as const)
      for (const kit of [0, 7] as const) {
        const spec = { ...DEFAULT_ANIME, hair, expression, ...gearFromBits(kit), hairColour: 'abc123' }
        assert.deepEqual(decodeAnime(encodeAnime(spec)), { ...spec, hairColour: 'ABC123' })
      }
})
