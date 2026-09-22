import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ANIME_LOOKS, encodeAnime } from './anime-spec.ts'
import { DEFAULT_SPEC, SPEC_MAX, decodeSpec, encodeSpec, isKnownSpec } from './spec.ts'

test('only model appearance is written, round-trips and fits deployed profile rules', () => {
  for (const look of ANIME_LOOKS) {
    const code = encodeSpec(look)
    assert.equal(code.length, 40)
    assert.ok(code.length <= SPEC_MAX)
    assert.match(code, /^[456]S[BT][NHRASU][NG1-6][0-9A-F]{24}[0-6]{5}[0-9A-F]{6}$/)
    assert.deepEqual(decodeSpec(code), look)
    assert.equal(isKnownSpec(code), true)
  }
})

test('an existing v3 anime profile retains every appearance choice when rewritten', () => {
  const saved = '32basbhaiavbtanaoaebxa32343C33456B5C7A5EF3F0EASTNNED9560B897ED9A8BCD352C43'
  assert.deepEqual(decodeSpec(saved), ANIME_LOOKS[1])
  // Rewriting an older profile keeps every choice it carried and states the
  // figure it always had, rather than leaving it to be inferred again.
  assert.equal(encodeSpec(decodeSpec(saved)), '4' + saved.slice(46) + '33333FFFFFF')
  // The old envelope is fixed width and only ever carried the 28 characters
  // that existed when it was written, so it is read with the figure the model
  // had then — which is the one these looks still use.
  for (const look of ANIME_LOOKS) {
    const legacy = encodeAnime(look).slice(0, 28)
    assert.equal(legacy.length, 28)
    assert.deepEqual(decodeSpec('32' + '0'.repeat(44) + legacy), look)
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
