import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_SPEC,
  SLOTS,
  catalogueFor,
  decodeSpec,
  encodeSpec,
  isKnownSpec,
  randomSpec,
  SPEC_MAX,
} from './spec.ts'
import {
  ACCESSORIES,
  BACKDROPS,
  HAIRS,
  HAIR_COLOURS,
  OUTFITS,
  OUTFIT_COLOURS,
  SKINS,
} from './parts.ts'

test('an avatar survives the round trip it is stored and shared as', () => {
  for (const spec of [DEFAULT_SPEC, randomSpec(), randomSpec()]) {
    assert.deepEqual(decodeSpec(encodeSpec(spec)), spec)
  }
})

test('the encoded form fits the bound the security rules enforce', () => {
  // Every slot at its longest id, which is the worst case a client can produce.
  const longest = {} as Record<string, string>
  for (const slot of SLOTS) {
    longest[slot] = catalogueFor(slot)
      .map((part) => part.id)
      .reduce((a, b) => (b.length > a.length ? b : a))
  }
  const encoded = encodeSpec(longest as never)
  assert.ok(encoded.length <= SPEC_MAX, `${encoded.length} > ${SPEC_MAX}`)
  assert.match(encoded, /^[a-zA-Z0-9-]+$/, 'the rules match this pattern exactly')
})

test('anything unreadable still decodes to a drawable face', () => {
  // This is storage a player can edit and a field another account wrote, so
  // "throws" and "renders nothing" are both worse answers than "renders the
  // default". A face that is wrong is still a face; a blank square is a bug.
  for (const junk of ['', 'nonsense', '-', 'a-b-c', 'x'.repeat(200), 'slate-sand']) {
    const spec = decodeSpec(junk)
    for (const slot of SLOTS) {
      assert.ok(
        catalogueFor(slot).some((part) => part.id === spec[slot]),
        `${junk} left ${slot} as ${spec[slot]}`,
      )
    }
  }
})

test('a spec is only "known" when every slot is', () => {
  assert.equal(isKnownSpec(encodeSpec(DEFAULT_SPEC)), true)
  assert.equal(isKnownSpec('slate-sand-crop-ink-crew-charcoal'), false, 'too few slots')
  assert.equal(isKnownSpec('slate-sand-crop-ink-crew-charcoal-nope'), false, 'unknown part')
})

test('a random avatar only ever wears what a player could have', () => {
  // The moment anything is locked, a starting avatar wearing it would be a
  // player given for free exactly what the shop is about to charge for.
  for (let i = 0; i < 300; i++) {
    const spec = randomSpec()
    for (const slot of SLOTS) {
      const part = catalogueFor(slot).find((entry) => entry.id === spec[slot])
      assert.ok(part, `${slot} picked something that is not in the catalogue`)
      assert.equal(part.lock, 'free', `${slot} picked a ${part.lock} part`)
    }
  }
})

test('every part is uniquely named and coloured where it should be', () => {
  for (const [name, list] of [
    ['backdrops', BACKDROPS],
    ['skins', SKINS],
    ['hairs', HAIRS],
    ['hair colours', HAIR_COLOURS],
    ['outfits', OUTFITS],
    ['outfit colours', OUTFIT_COLOURS],
    ['accessories', ACCESSORIES],
  ] as const) {
    const ids = list.map((part) => part.id)
    assert.equal(new Set(ids).size, ids.length, `${name} has a duplicate id`)
    for (const part of list) {
      assert.ok(part.name.length > 0, `${name} has an unnamed part`)
      // Ids travel inside the encoded string, which the rules pattern-match.
      assert.match(part.id, /^[a-zA-Z0-9]+$/, `${part.id} would break the encoding`)
    }
  }
  for (const list of [BACKDROPS, SKINS, HAIR_COLOURS, OUTFIT_COLOURS]) {
    for (const part of list) assert.match(part.colour, /^#[0-9A-Fa-f]{6}$/, `${part.id} colour`)
  }
})
