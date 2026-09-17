import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CODE_LENGTH, codeFor, normaliseCode } from './code.ts'

test('a code is the same every time, and different per account', () => {
  // This is the whole reason the code is derived rather than stored: it has to
  // survive a player signing in on a second device with nothing carried over.
  assert.equal(codeFor('abc123'), codeFor('abc123'))
  assert.equal(codeFor('abc123').length, CODE_LENGTH)
  assert.notEqual(codeFor('abc123'), codeFor('abc124'))
})

test('a code only uses characters that survive being read aloud', () => {
  const banned = /[OIL01AEU]/
  for (let i = 0; i < 400; i++) {
    const code = codeFor(`uid-${i}`)
    assert.equal(code.length, CODE_LENGTH)
    assert.ok(!banned.test(code), `${code} contains a lookalike`)
  }
})

test('codes do not collide across a plausible number of players', () => {
  // Not a proof, but it is the bound that matters: the friend lookup treats a
  // duplicate as "no such code", so a collision here is a player who cannot be
  // added at all rather than a wrong one being added.
  const seen = new Set<string>()
  for (let i = 0; i < 20000; i++) seen.add(codeFor(`firebase-uid-${i}`))
  assert.equal(seen.size, 20000)
})

test('what a player types is tidied, and nonsense is refused', () => {
  const code = codeFor('somebody')
  assert.equal(normaliseCode(code.toLowerCase()), code)
  assert.equal(normaliseCode(` ${code.slice(0, 3)}-${code.slice(3)} `), code)

  // Refused rather than guessed at. O is not in the alphabet; folding it onto
  // Q would silently look up a different real player, which is a worse answer
  // than "nobody is using that code".
  assert.equal(normaliseCode('OOOOOOO'), '')
  assert.equal(normaliseCode(code.slice(0, 6)), '', 'too short')
  assert.equal(normaliseCode(`${code}X`), '', 'too long')
  assert.equal(normaliseCode(''), '')
})
