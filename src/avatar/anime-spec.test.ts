import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ANIME_LOOKS, DEFAULT_ANIME, FIGURE_PRESETS, HAIR_STYLES, decodeAnime, encodeAnime, gearFromBits } from './anime-spec.ts'
import { DEFAULT_SPEC, SPEC_MAX, decodeSpec, encodeSpec, isKnownSpec } from './spec.ts'

test('anime appearance survives a profile round trip within live rules', () => {
  for (const look of ANIME_LOOKS) {
    const spec = look
    const code = encodeSpec(spec)
    assert.equal(code.length, 41)
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
  assert.equal(code.length, 41)
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

test('every earlier code still reads, and comes back stating what it left out', () => {
  // Each stage of the code is a prefix of the next, so every appearance anyone
  // has saved is still valid. What it stops short of decodes to the model as it
  // ships — which is what it was drawing — and re-encodes saying so.
  const head = 'STNN67B7A3A899E891ADB8202C3D'
  assert.equal(head.length, 28)
  for (const [before, filled] of [
    [head, '33333FFFFFFM'],
    [head + '513', '33FFFFFFM'],
    [head + '51362', 'FFFFFFM'],
  ] as const) {
    const spec = decodeAnime(before)
    assert.ok(spec, `${before} should decode`)
    assert.equal(encodeAnime(spec), before + filled)
  }
  // The three axes a shorter code does carry are its own, not the default.
  assert.deepEqual(decodeAnime(head + '513'), {
    ...decodeAnime(head),
    bust: 5,
    waist: 1,
    hip: 3,
  })
  const plain = decodeAnime(head)
  assert.ok(plain)
  assert.deepEqual(
    { bust: plain.bust, waist: plain.waist, hip: plain.hip, shoulder: plain.shoulder, head: plain.head },
    FIGURE_PRESETS.even,
  )
  assert.equal(plain.skinColour, 'FFFFFF')
})

test('every figure and skin the studio can set survives a round trip and the profile rule', () => {
  for (const bust of [0, 3, 6] as const)
    for (const waist of [0, 3, 6] as const)
      for (const hip of [0, 3, 6] as const)
        for (const shoulder of [0, 6] as const)
          for (const head of [0, 6] as const)
            for (const skinColour of ['FFFFFF', '6F4530']) {
              const spec = { ...DEFAULT_ANIME, bust, waist, hip, shoulder, head, skinColour }
              const code = encodeSpec(spec)
              assert.ok(code.length <= SPEC_MAX, `${code} exceeds the profile rule`)
              assert.match(code, /^[a-zA-Z0-9-]+$/)
              assert.deepEqual(decodeSpec(code), spec)
            }
})

test('every build the studio offers is a distinct, legal figure', () => {
  const codes = new Set<string>()
  for (const build of Object.values(FIGURE_PRESETS)) {
    const spec = { ...DEFAULT_ANIME, ...build }
    assert.deepEqual(decodeAnime(encodeAnime(spec)), spec)
    codes.add(encodeAnime(spec))
  }
  assert.equal(codes.size, Object.keys(FIGURE_PRESETS).length)
})

test('a figure or skin outside the range is refused rather than stored', () => {
  const head = 'STNN67B7A3A899E891ADB8202C3D'
  for (const raw of [
    head + '733',
    head + '33',
    head + '3333',
    // Five axes are either followed by a full skin colour or by nothing, and
    // the skin by one letter naming the character or by nothing.
    head + '33333FFFFF',
    head + '33333FFFFFFFF',
    head + '33333FFFFFFX',
    head + '33333GGGGGG',
    head + '37333FFFFFF',
  ]) {
    assert.equal(decodeAnime(raw), undefined, `${raw} should not decode`)
  }
})

test('a skin colour ending in F is not mistaken for a female character', () => {
  // 'F' is a hex digit as well as the letter for one of the two characters, so
  // a code written before the character was a choice, whose skin happens to end
  // in F, has to come back exactly as it was drawn.
  const before = 'STNN67B7A3A899E891ADB8202C3D33333FFFFFF'
  assert.equal(before.length, 39)
  const spec = decodeAnime(before)
  assert.ok(spec)
  assert.equal(spec.sex, 'male')
  assert.equal(spec.skinColour, 'FFFFFF')
  assert.equal(encodeAnime(spec), before + 'M')
})

test('both characters and every hairstyle survive a round trip', () => {
  for (const sex of ['male', 'female'] as const)
    for (const hair of Object.keys(HAIR_STYLES) as (keyof typeof HAIR_STYLES)[]) {
      const spec = { ...DEFAULT_ANIME, sex, hair }
      const code = encodeSpec(spec)
      assert.ok(code.length <= SPEC_MAX, `${code} exceeds the profile rule`)
      assert.match(code, /^[a-zA-Z0-9-]+$/)
      assert.deepEqual(decodeSpec(code), spec)
    }
  // The two letters that existed before still name the styles they named.
  assert.equal(decodeAnime('SBNN67B7A3A899E891ADB8202C3D')?.hair, 'bob')
  assert.equal(decodeAnime('STNN67B7A3A899E891ADB8202C3D')?.hair, 'tails')
})
