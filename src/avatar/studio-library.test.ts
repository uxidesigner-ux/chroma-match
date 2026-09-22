import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_ANIME, EXPRESSIONS } from './anime-spec.ts'
import { decodeSpec, encodeSpec, isKnownSpec } from './spec.ts'
import { LIBRARY_KEY, LookHistory, lookFile, parseLookFile, readLibrary, writeLibrary } from './studio-library.ts'

test('all six expressions round trip through profile and backup files', () => {
  for (const expression of EXPRESSIONS) {
    const spec = { ...DEFAULT_ANIME, expression }
    const code = encodeSpec(spec)
    assert.equal(code.length, 32)
    assert.equal(isKnownSpec(code), true)
    assert.deepEqual(decodeSpec(code), spec)
    assert.deepEqual(parseLookFile(lookFile(spec)), spec)
    assert.equal(code[0], ['neutral', 'happy', 'relaxed'].includes(expression) ? '4' : '5')
  }
})

test('independent explorer pieces use a v6 code and still round trip', () => {
  const spec = { ...DEFAULT_ANIME, pack: true, visor: true, expression: 'happy' as const }
  const code = encodeSpec(spec)
  assert.equal(code[0], '6')
  assert.equal(code.length, 32)
  assert.deepEqual(decodeSpec(code), spec)
  assert.equal(isKnownSpec(code), true)
})

test('backup parser rejects broken, oversized, arbitrary URL and future-format data', () => {
  for (const raw of ['null', '[]', '{}', '{', 'x'.repeat(16385),
    JSON.stringify({ format: 'chroma-character', version: 2, code: encodeSpec(DEFAULT_ANIME) }),
    JSON.stringify({ format: 'chroma-character', version: 1, code: 'https://bad/model.vrm' })]) {
    assert.throws(() => parseLookFile(raw))
  }
})

test('bounded history supports undo, redo and discards redo after a new edit', () => {
  const history = new LookHistory()
  const next = { ...DEFAULT_ANIME, hair: 'bob' as const }
  history.push(DEFAULT_ANIME, DEFAULT_ANIME)
  assert.equal(history.canUndo, false)
  history.push(DEFAULT_ANIME, next)
  assert.deepEqual(history.undo(next), DEFAULT_ANIME)
  assert.equal(history.canRedo, true)
  assert.deepEqual(history.redo(DEFAULT_ANIME), next)
  history.undo(next)
  history.push(DEFAULT_ANIME, { ...next, expression: 'sad' })
  assert.equal(history.canRedo, false)
  for (let i = 0; i < 100; i++) history.push(DEFAULT_ANIME, next)
  let count = 0
  while (history.canUndo) { history.undo(next); count++ }
  assert.equal(count, 64)
})

test('library filters corrupt entries and duplicates, and reports storage failures', () => {
  let stored = ''
  const storage = { getItem: () => stored, setItem: (key: string, value: string) => {
    assert.equal(key, LIBRARY_KEY); stored = value
  } }
  const look = { id: 'id-one', name: 'My look', code: encodeSpec(DEFAULT_ANIME) }
  assert.equal(writeLibrary(storage, [look]), true)
  assert.deepEqual(readLibrary(storage), [look])
  stored = JSON.stringify([look, look, { ...look, id: 'id-two', code: 'unknown' }, null])
  assert.deepEqual(readLibrary(storage), [look])
  stored = '{broken'
  assert.deepEqual(readLibrary(storage), [])
  assert.equal(writeLibrary(storage, Array.from({ length: 13 }, () => look)), false)
  assert.equal(writeLibrary({ setItem: () => { throw new Error('quota') } }, [look]), false)
})
