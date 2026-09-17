import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  COLOUR_SLOTS,
  DEFAULT_SPEC,
  PART_SLOTS,
  SPEC_MAX,
  catalogueFor,
  decodeSpec,
  encodeSpec,
  isKnownSpec,
  randomSpec,
} from './spec.ts'
import {
  ACCESSORIES,
  BACKDROPS,
  BOTTOMS,
  BUILDS,
  HAIRS,
  HAIR_COLOURS,
  OUTERS,
  OUTFITS,
  SHOES,
  SKINS,
} from './parts.ts'

const EVERY_LIST = [
  ['backdrops', BACKDROPS],
  ['skins', SKINS],
  ['hairs', HAIRS],
  ['hair colours', HAIR_COLOURS],
  ['builds', BUILDS],
  ['tops', OUTFITS],
  ['bottoms', BOTTOMS],
  ['outerwear', OUTERS],
  ['shoes', SHOES],
  ['accessories', ACCESSORIES],
] as const

test('an avatar survives the round trip it is stored and shared as', () => {
  for (const spec of [DEFAULT_SPEC, randomSpec(), randomSpec(), randomSpec()]) {
    assert.deepEqual(decodeSpec(encodeSpec(spec)), spec)
  }
})

test('the encoded form fits the bound the security rules enforce', () => {
  // Fixed width, so every avatar is the same length — but the assertion stays,
  // because the bound is in a rules file that cannot currently be redeployed
  // and going over it rejects every profile write silently.
  const encoded = encodeSpec(randomSpec())
  assert.ok(encoded.length <= SPEC_MAX, `${encoded.length} > ${SPEC_MAX}`)
  assert.match(encoded, /^[a-zA-Z0-9-]+$/, 'the rules match this pattern exactly')
})

test('an avatar saved by the previous version still resolves', () => {
  // This is what is in every existing player's localStorage and in every
  // profile document written so far. It has to keep working, and it has to
  // keep meaning the same thing: the same face, not a face.
  const v1 = 'sage-umber-curls-cocoa-hoodie-butter-square'
  const spec = decodeSpec(v1)
  assert.equal(spec.backdrop, 'sage')
  assert.equal(spec.skin, 'umber')
  assert.equal(spec.hair, 'curls')
  assert.equal(spec.hairColour, 'cocoa')
  assert.equal(spec.outfit, 'hoodie')
  assert.equal(spec.accessory, 'square')
  // The clothing colour was an entry in a palette; it is now the hex that
  // entry was, so the shirt does not change colour under the player.
  assert.equal(spec.topColour, 'E4C06A', 'butter')
  // And the slots that did not exist take their defaults rather than nothing.
  assert.equal(spec.build, DEFAULT_SPEC.build)
  assert.equal(spec.bottom, DEFAULT_SPEC.bottom)
  assert.equal(spec.shoes, DEFAULT_SPEC.shoes)
})

test('anything unreadable still decodes to a drawable face', () => {
  // This is storage a player can edit and a field another account wrote, so
  // "throws" and "renders nothing" are both worse answers than "renders the
  // default". A face that is wrong is still a face; a blank square is a bug.
  for (const junk of ['', 'nonsense', '-', 'a-b-c', 'x'.repeat(200), 'slate-sand', '2', '2zzzz']) {
    const spec = decodeSpec(junk)
    for (const slot of PART_SLOTS) {
      assert.ok(
        catalogueFor(slot).some((part) => part.id === spec[slot]),
        `${junk} left ${slot} as ${spec[slot]}`,
      )
    }
    for (const slot of COLOUR_SLOTS) {
      assert.match(spec[slot], /^[0-9A-F]{6}$/, `${junk} left ${slot} as ${spec[slot]}`)
    }
  }
})

test('a spec is only "known" when it round-trips exactly', () => {
  assert.equal(isKnownSpec(encodeSpec(DEFAULT_SPEC)), true)
  assert.equal(isKnownSpec('slate-sand-crop-ink-crew-charcoal'), false, 'the old format')
  assert.equal(isKnownSpec('2zzzzzzzzzzzzzzzzzzz000000000000000000000000'), false, 'unknown codes')
})

test('a random avatar only ever wears what a player could have', () => {
  // The moment anything is locked, a starting avatar wearing it would be a
  // player given for free exactly what the shop is about to charge for.
  for (let i = 0; i < 300; i++) {
    const spec = randomSpec()
    for (const slot of PART_SLOTS) {
      const part = catalogueFor(slot).find((entry) => entry.id === spec[slot])
      assert.ok(part, `${slot} picked something that is not in the catalogue`)
      assert.equal(part.lock, 'free', `${slot} picked a ${part.lock} part`)
    }
  }
})

test('every part is uniquely named, coded and coloured where it should be', () => {
  const seen = new Map<string, string>()
  for (const [name, list] of EVERY_LIST) {
    const ids = list.map((part) => part.id)
    assert.equal(new Set(ids).size, ids.length, `${name} has a duplicate id`)
    for (const part of list) {
      assert.ok(part.name.length > 0, `${name} has an unnamed part`)
      assert.match(part.code, /^[a-zA-Z0-9]{2}$/, `${part.id} has a bad code`)
      // A code is the part's identity in every saved avatar there is. Two
      // parts sharing one means one of them silently becomes the other.
      const clash = seen.get(part.code)
      assert.equal(clash, undefined, `${part.id} reuses the code of ${clash ?? ''}`)
      seen.set(part.code, `${name}:${part.id}`)
    }
  }
  for (const list of [BACKDROPS, SKINS, HAIR_COLOURS]) {
    for (const part of list) assert.match(part.colour, /^#[0-9A-Fa-f]{6}$/, `${part.id} colour`)
  }
})
