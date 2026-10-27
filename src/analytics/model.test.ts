import {test} from 'node:test'
import assert from 'node:assert/strict'
import {consentOf, liveLocation, privateReferrer, safeEvent, type EventName} from './model.ts'
test('only an explicit known choice permits optional analytics', () => {
  for (const value of [null, '', 'true', true, 1, {}, 'unknown']) assert.equal(consentOf(value), null)
  assert.equal(consentOf('granted'), 'granted'); assert.equal(consentOf('denied'), 'denied')
})
test('production analytics never include another GitHub project or a local preview', () => {
  assert.equal(liveLocation('https://uxidesigner-ux.github.io/chroma-match/?friend=secret#look'), true)
  for (const url of ['http://127.0.0.1:5180/chroma-match/', 'https://uxi.house/', 'https://uxidesigner-ux.github.io/other/', 'https://uxidesigner-ux.github.io/chroma-match-fake/', 'https://attacker.test/chroma-match/', 'bad']) assert.equal(liveLocation(url), false)
})
test('referrers retain only an http origin, never paths, query parameters or fragments', () => {
  assert.equal(privateReferrer('https://example.com/account/private?email=secret#token'), 'https://example.com')
  for (const ref of ['', 'data:text/plain,private', 'file:///Users/user/private', 'javascript:alert(1)']) assert.equal(privateReferrer(ref), '')
})
test('every event rejects account identities, raw replay, input text and unknown properties', () => {
  const privateData = {name: 'private', email: 'private@example.com', user_id: 'secret', avatar: 'secret', seed: 123, replay: 'secret', page_location: 'https://private.test/', data: {secret: true}}
  for (const name of ['screen_view', 'game_start', 'game_resume', 'level_start', 'level_end', 'game_end', 'item_use', 'character_save', 'menu_open'] as EventName[]) assert.deepEqual(safeEvent(name, privateData), {})
})
test('only bounded actual game metrics and known enums reach the tracker', () => {
  assert.deepEqual(safeEvent('level_end', {mode: 'adventure', region: 'forest', stage: 3, level: 4.9, success: true, score: Infinity, moves_used: -2, items_used: 9000, outcome: 'cleared', rules_version: 10, email: 'private'}), {mode: 'adventure', region: 'forest', stage: 3, level: 4, rules_version: 10, outcome: 'cleared', success: true, moves_used: 0, items_used: 4000})
  assert.deepEqual(safeEvent('item_use', {item_id: 'bow', region: 'email@example.com'}), {item_id: 'bow'})
  assert.deepEqual(safeEvent('screen_view', {screen_name: 'profile', nickname: 'private'}), {screen_name: 'profile'})
})
