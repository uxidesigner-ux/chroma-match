import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ANIME_LOOKS, encodeAnime } from './anime-spec.ts'
import { DEFAULT_SPEC, SPEC_MAX, decodeSpec, encodeSpec, isKnownSpec } from './spec.ts'

test('only model appearance is written, round-trips and fits deployed profile rules', () => {
  for (const look of ANIME_LOOKS) {
    const code = encodeSpec(look)
    assert.equal(code.length, 29)
    assert.ok(code.length <= SPEC_MAX)
    assert.match(code, /^4S[BT][NHR][NG][0-9A-F]{24}$/)
    assert.deepEqual(decodeSpec(code), look)
    assert.equal(isKnownSpec(code), true)
  }
})

test('an existing v3 anime profile retains every appearance choice when rewritten', () => {
  const saved = '32basbhaiavbtanaoaebxa32343C33456B5C7A5EF3F0EASTNNED9560B897ED9A8BCD352C43'
  assert.deepEqual(decodeSpec(saved), ANIME_LOOKS[1])
  assert.equal(encodeSpec(decodeSpec(saved)), '4' + saved.slice(46))
  for (const look of ANIME_LOOKS) {
    assert.deepEqual(decodeSpec('32' + '0'.repeat(44) + encodeAnime(look)), look)
  }
})

test('removed formats, damaged envelopes and unknown models resolve to the starter', () => {
  for (const raw of ['', 'sage-umber-curls-cocoa-hoodie-butter-square',
    '2basbhaiavbtanaoaebxa32343C33456B5C7A5EF3F0EA', 'nonsense', '4',
    '4https://example.com/asset.vrm', '4' + encodeAnime(DEFAULT_SPEC) + 'trailing',
    '32' + '0'.repeat(44), '32' + '0'.repeat(44) + 'Z'.repeat(28), 'x'.repeat(500)]) {
    assert.deepEqual(decodeSpec(raw), DEFAULT_SPEC)
    assert.equal(isKnownSpec(raw), false)
  }
})

test('fallback objects are independent and cannot mutate the shared starter', () => {
  const first = decodeSpec('')
  first.hairColour = '000000'
  assert.notEqual(decodeSpec('').hairColour, first.hairColour)
})
