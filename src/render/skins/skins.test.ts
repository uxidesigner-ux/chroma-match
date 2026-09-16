import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_KINDS } from '../../game/types.ts'
import { GLASS } from './glass.ts'
import { JEWEL } from './jewel.ts'
import { SKIN_VARS } from './types.ts'
import type { Skin } from './types.ts'

/*
 * A skin is the one part of the game anyone is invited to rewrite, which is
 * exactly why it is the part that needs its invariants written down. None of
 * these check that a skin looks good — they check that it is still playable.
 *
 * The registry is not imported here: src/render/skins/index.ts touches
 * `document` and `localStorage` at module scope, and these tests run in bare
 * Node. The skins themselves are pure data plus canvas calls, so they are
 * listed directly.
 */
const SKINS: readonly Skin[] = [JEWEL, GLASS]

for (const skin of SKINS) {
  test(`${skin.id}: carries a colour for every kind the board can deal`, () => {
    assert.ok(
      skin.palette.length >= MAX_KINDS,
      `${skin.id} has ${skin.palette.length} colours for up to ${MAX_KINDS} kinds`,
    )
  })

  test(`${skin.id}: every kind has its own silhouette`, () => {
    // The accessibility floor: roughly one player in twelve cannot separate red
    // from green at a glance, so shape carries the same information as colour.
    // Two kinds sharing a shape would be indistinguishable for them.
    const shapes = new Set(skin.palette.map((gem) => gem.shape))
    assert.equal(shapes.size, skin.palette.length)
  })

  test(`${skin.id}: colours are opaque hex`, () => {
    // Translucency is a property of how a skin paints, not of the palette. A
    // colour carrying its own alpha would multiply with the painting pass and
    // quietly fade a gem out of the board.
    for (const gem of skin.palette) {
      for (const [field, value] of Object.entries({
        base: gem.base,
        light: gem.light,
        dark: gem.dark,
      })) {
        assert.match(value, /^#[0-9A-Fa-f]{6}$/, `${skin.id}.${gem.name}.${field} = ${value}`)
      }
    }
  })

  test(`${skin.id}: sets every CSS property a skin owns`, () => {
    // A property left out would not fall back to a default — it would inherit
    // whatever the previous skin set, which only shows up after switching
    // twice and is invisible in a screenshot of either skin alone.
    for (const name of SKIN_VARS) {
      const value = skin.css[name]
      assert.ok(value && value.trim().length > 0, `${skin.id} is missing --${name}`)
    }
  })
}

test('skin ids are unique and URL-safe', () => {
  // The id is persisted and accepted from `?skin=`, so it has to survive a
  // round trip through a query string unchanged.
  const ids = SKINS.map((skin) => skin.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const id of ids) assert.match(id, /^[a-z0-9-]+$/)
})

test('skins are visually distinct from one another', () => {
  // Two skins that share a background are a reskin in name only. This is a
  // blunt check, but it catches a copied-and-barely-edited skin at review time.
  const backgrounds = SKINS.map((skin) => skin.css.bg)
  assert.equal(new Set(backgrounds).size, backgrounds.length)
  const firstColours = SKINS.map((skin) => skin.palette[0]?.base)
  assert.equal(new Set(firstColours).size, firstColours.length)
})
