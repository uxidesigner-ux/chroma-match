import assert from 'node:assert/strict'
import test from 'node:test'
import { createHapticOutput, RoyalFeedback, vibrationPattern, type FeedbackCue, type FeedbackRuntime } from './feedback.ts'
import type { EffectEvent } from './model.ts'

function rig(withHaptics = true) {
  let now = 0, visible = true, unlocks = 0, stops = 0, cancels = 0, destroyed = 0
  const sounds: FeedbackCue[] = [], taps: FeedbackCue[] = []
  const tapTimes: { kind: FeedbackCue['kind']; at: number }[] = []
  const runtime: FeedbackRuntime = {
    now: () => now, visible: () => visible,
    audio: { unlock: () => { unlocks++ }, play: cue => sounds.push({ ...cue }), stop: () => { stops++ }, destroy: () => { destroyed++ } },
    ...(withHaptics ? { haptic: { mode: 'vibration' as const, play: (cue: FeedbackCue) => { taps.push({ ...cue }); tapTimes.push({ kind: cue.kind, at: now }); return true }, cancel: () => { cancels++ } } } : {}),
  }
  const feedback = new RoyalFeedback(runtime)
  return { feedback, sounds, taps, tapTimes, advance: (ms: number) => { now += ms }, visible: (value: boolean) => { visible = value },
    get unlocks() { return unlocks }, get stops() { return stops }, get cancels() { return cancels }, get destroyed() { return destroyed } }
}
const event = (kind: EffectEvent['kind'], at: number, extra: Partial<EffectEvent> = {}): EffectEvent => ({ kind, at, cells: [3], ...extra })

test('feedback is silent until activation and respects independent sound and haptics settings', () => {
  const r = rig()
  r.feedback.update([event('tnt', 0, { stage: 'impact' })], 0)
  assert.equal(r.sounds.length, 0); assert.equal(r.taps.length, 0)
  r.feedback.configure({ sound: false, haptics: true }); r.feedback.button()
  assert.equal(r.unlocks, 0, 'muted button must not create an audio context')
  assert.equal(r.sounds.length, 0); assert.equal(r.taps[0]?.kind, 'button')
  r.feedback.configure({ sound: true, haptics: false }); r.advance(100); r.feedback.button()
  assert.equal(r.unlocks, 1); assert.equal(r.cancels, 1)
  assert.equal(r.taps.length, 1); assert.equal(r.sounds[0]?.kind, 'button')
  r.feedback.configure({ sound: false, haptics: false }); r.advance(100); r.feedback.button()
  assert.equal(r.stops, 2); assert.equal(r.sounds.length, 1); assert.equal(r.taps.length, 1)
})

test('a large attack coalesces cleared blocks and damage into one strongest impact', () => {
  const r = rig(); r.feedback.unlock()
  const events = [event('clear', .1, { cells: [1, 2, 3, 4, 5] }), event('damage', .1), event('propeller', .1, { stage: 'impact' }), event('tnt', .1, { stage: 'impact' })]
  r.feedback.update(events, .1)
  assert.deepEqual(r.sounds.map(cue => cue.kind), ['tnt'])
  assert.deepEqual(r.taps.map(cue => cue.kind), ['tnt'])
  r.advance(100); r.feedback.update(structuredClone(events), .2)
  assert.equal(r.sounds.length, 1, 'duplicate event delivery must not repeat sounds or pulses')
  assert.equal(r.taps.length, 1)
})

test('landing taps wait for actual duration and creation chimes wait for convergence', () => {
  const r = rig(); r.feedback.unlock()
  r.feedback.update([event('fall', .2, { duration: .3, fromRow: -2, to: 3 }), event('power', .2, { createdPiece: { id: 7, colour: 0, power: 'tnt' } })], .2)
  assert.equal(r.sounds.length, 0)
  r.advance(100); r.feedback.update([], .349)
  assert.equal(r.sounds.length, 0)
  r.feedback.update([], .35)
  assert.equal(r.sounds[0]?.kind, 'create')
  r.advance(100); r.feedback.update([], .499)
  assert.equal(r.sounds.length, 1)
  r.feedback.update([], .5)
  assert.equal(r.sounds[1]?.kind, 'land')
  assert.equal(r.taps[1]?.kind, 'land')
})

test('simulation speed changes do not move a landing cue to an earlier real-time timer', () => {
  const r = rig(); r.feedback.unlock()
  r.feedback.update([event('fall', 1, { duration: .4 })], 1)
  r.advance(2000)
  r.feedback.update([], 1.1)
  assert.equal(r.sounds.length, 0, 'wall time alone cannot trigger a game cue')
  r.feedback.update([], 1.4)
  assert.equal(r.sounds[0]?.kind, 'land')
})

test('queued fall and creation cues cannot leak into a restarted level', () => {
  const r = rig(); r.feedback.unlock()
  r.feedback.update([event('fall', 0, { duration: .3 }), event('power', .1)], .1)
  r.feedback.reset(); r.advance(500); r.feedback.update([], .5)
  assert.equal(r.sounds.length, 0); assert.equal(r.taps.length, 0)
  r.feedback.update([event('swap', 0)], 0)
  assert.equal(r.sounds[0]?.kind, 'swap', 'clock reset and repeated zero-time event work in a new game')
})

test('hiding or pausing stops the current sound and vibration without replaying stale cues', () => {
  const r = rig(); r.feedback.button()
  r.feedback.update([event('fall', 0, { duration: .3 })], 0)
  r.visible(false); r.feedback.update([], .1)
  assert.equal(r.cancels, 1); assert.equal(r.stops, 1)
  r.advance(100); r.feedback.button()
  assert.equal(r.sounds.length, 1); assert.equal(r.taps.length, 1)
  r.visible(true); r.feedback.update([], 10)
  assert.equal(r.sounds.length, 1, 'resume does not dump a long backlog of effects')
  r.feedback.destroy(); assert.equal(r.destroyed, 1)
})

test('game-time pause preserves a pending landing until the visible board resumes', () => {
  const r = rig(); r.feedback.unlock()
  r.feedback.update([event('fall', 0, { duration: .3 })], .1)
  r.feedback.pause(); r.advance(5000)
  r.feedback.update([], .2)
  assert.equal(r.sounds.length, 0)
  r.feedback.update([], .3)
  assert.equal(r.sounds[0]?.kind, 'land')
})

test('rapid cascades cannot replace every pulse while a stronger impact may take priority', () => {
  const r = rig(); r.feedback.unlock()
  for (let step = 0; step < 12; step++) {
    r.feedback.update([event('clear', step * .01, { cells: [step] })], step * .01)
    r.advance(10)
  }
  assert.equal(r.taps.length, 2)
  r.advance(30); r.feedback.update([event('tnt', .2, { stage: 'impact' })], .2)
  assert.equal(r.taps.at(-1)?.kind, 'tnt')
  assert.ok(r.sounds.length <= 4)
})

test('tool feedback overrides its clear event and shuffle is acknowledged once', () => {
  const r = rig(); r.feedback.unlock()
  r.feedback.update([event('tool', 0, { tool: 'hammer', stage: 'impact' }), event('clear', 0)], 0)
  assert.deepEqual(r.sounds.map(cue => cue.kind), ['hammer'])
  r.advance(150)
  r.feedback.update([event('tool', .15, { tool: 'shuffle', stage: 'impact' }), event('shuffle', .15)], .15)
  assert.deepEqual(r.sounds.map(cue => cue.kind), ['hammer', 'shuffle'])
})

test('flight sound is separate from the arrival tap, and power consumption alone is not a match', () => {
  const r = rig(); r.feedback.unlock()
  r.feedback.update([event('propeller', 0, { stage: 'launch', duration: .7 }), event('clear', 0, { pieces: [{ cell: 3, piece: { id: 4, colour: 0, power: 'propeller' } }] })], 0)
  assert.deepEqual(r.sounds.map(cue => cue.kind), ['propeller-launch']); assert.equal(r.taps.length, 0)
  r.advance(700); r.feedback.update([event('propeller', .7, { stage: 'impact' })], .7)
  assert.equal(r.taps[0]?.kind, 'propeller')
})

test('lightball starts one rising charge on activation and releases only when its rays launch', () => {
  const r = rig(); r.feedback.unlock()
  const activation = event('activate', 0, { cells: [3, 4], duration: .24, combo: 2,
    pieces: [{ cell: 3, piece: { id: 11, colour: 0, power: 'lightball' } }, { cell: 4, piece: { id: 12, colour: 0, power: 'propeller' } }] })
  r.feedback.update([activation], 0)
  assert.deepEqual(r.sounds.map(cue => cue.kind), ['lightball-charge'])
  assert.equal(r.sounds[0]?.duration, .24)
  assert.equal(r.taps.length, 0, 'charging never starts a continuous vibration')
  r.advance(120); r.feedback.update([structuredClone(activation)], .12)
  assert.equal(r.sounds.length, 1)
  r.advance(120); r.feedback.update([event('lightball', .24, { from: 3, cells: [5, 7, 9], stage: 'launch', duration: .78 })], .24)
  assert.deepEqual(r.sounds.map(cue => cue.kind), ['lightball-charge', 'lightball-release'])
  assert.deepEqual(r.taps.map(cue => cue.kind), ['lightball-release'])
  r.advance(200); r.feedback.update([event('lightball', .44, { from: 3, to: 5, cells: [5], stage: 'impact' })], .44)
  assert.equal(r.sounds.at(-1)?.kind, 'lightball')
  assert.equal(r.taps.at(-1)?.strength, 1)
})

test('many lightball ray arrivals use one major blast and bounded short impact cues', () => {
  const r = rig(); r.feedback.unlock()
  r.feedback.update([event('activate', 0, { power: 'lightball', duration: .24 })], 0)
  r.advance(240); r.feedback.update([event('lightball', .24, { from: 3, stage: 'launch' })], .24)
  r.advance(200)
  for (let i = 0; i < 36; i++) {
    const at = .44 + i * .02, cell = i + 5
    r.feedback.update([event('lightball', at, { from: 3, to: cell, cells: [cell], stage: 'impact' }), event('clear', at, { cells: [cell] }), event('damage', at, { cells: [cell] })], at)
    r.advance(20)
  }
  assert.equal(r.sounds.filter(cue => cue.kind === 'lightball').length, 1)
  assert.equal(r.sounds.filter(cue => cue.kind === 'match').length, 0, 'a ray impact replaces the same-frame generic clear pop')
  const ticks = r.sounds.filter(cue => cue.kind === 'lightball-hit')
  assert.ok(ticks.length >= 4 && ticks.length <= 10, `${ticks.length} short arrivals for 36 rays`)
  const pulses = r.tapTimes.filter(cue => cue.kind === 'lightball-hit')
  assert.ok(pulses.length >= 3 && pulses.length <= 6)
  assert.ok(pulses.slice(1).every((pulse, i) => pulse.at - pulses[i]!.at >= 110))
  assert.equal(r.taps.filter(cue => cue.kind === 'lightball').length, 1)
})

test('super lightball can release a second ray batch without restarting its charge or full blast', () => {
  const r = rig(); r.feedback.unlock()
  r.feedback.update([event('activate', 0, { power: 'lightball', duration: .24 })], 0)
  r.advance(240); r.feedback.update([event('lightball', .24, { from: 3, stage: 'launch' })], .24)
  r.advance(200); r.feedback.update([event('lightball', .44, { from: 3, to: 7, stage: 'impact' })], .44)
  r.advance(150); r.feedback.update([event('lightball', .59, { from: 3, stage: 'launch' })], .59)
  r.advance(200); r.feedback.update([event('lightball', .79, { from: 3, to: 7, stage: 'impact' })], .79)
  assert.equal(r.sounds.filter(cue => cue.kind === 'lightball-charge').length, 1)
  assert.equal(r.sounds.filter(cue => cue.kind === 'lightball-release').length, 2)
  assert.equal(r.sounds.filter(cue => cue.kind === 'lightball').length, 1)
  assert.equal(r.sounds.at(-1)?.kind, 'lightball-hit')
})

test('a falling tile cannot cut off the distinctive first lightball pulse', () => {
  const r = rig(); r.feedback.unlock()
  r.feedback.update([event('lightball', 0, { from: 3, to: 5, stage: 'impact' })], 0)
  r.advance(80); r.feedback.update([event('fall', .08, { to: 6, duration: 0 })], .08)
  assert.deepEqual(r.taps.map(cue => cue.kind), ['lightball'])
  r.advance(40); r.feedback.update([event('fall', .12, { to: 7, duration: 0 })], .12)
  assert.deepEqual(r.taps.map(cue => cue.kind), ['lightball', 'land'])
})

test('a chained lightball charge remains audible under an initiating explosion', () => {
  const r = rig(); r.feedback.unlock()
  r.feedback.update([event('tnt', 0, { stage: 'impact' }), event('activate', 0, { power: 'lightball', duration: .24 })], 0)
  assert.deepEqual(r.sounds.map(cue => cue.kind), ['lightball-charge', 'tnt'])
  assert.deepEqual(r.taps.map(cue => cue.kind), ['tnt'])
})

test('pausing or muting a lightball stops its swell without replaying it, and restart resets its wave', () => {
  const r = rig(); r.feedback.unlock()
  const activation = event('activate', 0, { power: 'lightball', duration: .24 })
  r.feedback.update([activation], 0)
  r.feedback.pause(); r.advance(1000); r.feedback.update([], .1)
  assert.equal(r.stops, 1); assert.equal(r.sounds.length, 1)
  r.feedback.configure({ sound: false, haptics: true })
  r.advance(140); r.feedback.update([event('lightball', .24, { from: 3, stage: 'launch' })], .24)
  assert.equal(r.stops, 2); assert.equal(r.sounds.length, 1)
  assert.equal(r.taps[0]?.kind, 'lightball-release')
  r.feedback.configure({ sound: true, haptics: false })
  r.advance(200); r.feedback.update([event('lightball', .44, { from: 3, to: 5, stage: 'impact' })], .44)
  assert.equal(r.sounds.at(-1)?.kind, 'lightball'); assert.equal(r.taps.length, 1)
  r.feedback.reset(); r.feedback.update([activation], 0)
  r.advance(440); r.feedback.update([event('lightball', .44, { from: 3, to: 5, stage: 'impact' })], .44)
  assert.equal(r.sounds.filter(cue => cue.kind === 'lightball').length, 2)
})

test('new lightball release and arrival cues preserve the native semantic contract', () => {
  const messages: { kind: string; intensity: number }[] = []
  const output = createHapticOutput({ chromaNativeCapabilities: { haptics: true }, webkit: { messageHandlers: { chromaHaptics: { postMessage: message => messages.push(message) } } } }, undefined)!
  assert.equal(output.play({ kind: 'lightball-charge', strength: .9, combo: 1 }), false)
  output.play({ kind: 'lightball-release', strength: .72, combo: 1 })
  output.play({ kind: 'lightball-hit', strength: .42, combo: 1 })
  assert.deepEqual(messages, [{ kind: 'lightball', intensity: .72 }, { kind: 'match', intensity: .42 }])
  assert.equal(vibrationPattern({ kind: 'lightball-hit', strength: .42, combo: 1 }), 8)
})

test('unsupported browsers remain playable without claiming physical haptics', () => {
  const r = rig(false)
  assert.equal(r.feedback.hapticsAvailable, false); assert.equal(r.feedback.hapticsMode, 'unavailable')
  r.feedback.button()
  assert.equal(r.sounds[0]?.kind, 'button')
  assert.equal(createHapticOutput({}, undefined), undefined)
})

test('native haptics require both the explicit capability and handler and honor cancellation', () => {
  const messages: { kind: string; intensity: number }[] = []
  const handler = { postMessage: (message: { kind: string; intensity: number }) => messages.push(message) }
  const webkit = { messageHandlers: { chromaHaptics: handler } }
  assert.equal(createHapticOutput({ webkit }, undefined), undefined)
  assert.equal(createHapticOutput({ chromaNativeCapabilities: { haptics: true } }, undefined), undefined)
  const output = createHapticOutput({ webkit, chromaNativeCapabilities: { haptics: true } }, undefined)!
  assert.equal(output.mode, 'native')
  assert.equal(output.play({ kind: 'tnt', strength: 10, combo: 1 }), true)
  output.cancel()
  assert.deepEqual(messages, [{ kind: 'tnt', intensity: 1 }, { kind: 'cancel', intensity: 0 }])
  assert.equal(output.play({ kind: 'rocket-launch', strength: 1, combo: 1 }), false)
  assert.equal(messages.length, 2)
})

test('native preference disable cancels once and ignores subsequent impact events', () => {
  const messages: { kind: string; intensity: number }[] = []
  const output = createHapticOutput({ chromaNativeCapabilities: { haptics: true }, webkit: { messageHandlers: { chromaHaptics: { postMessage: message => messages.push(message) } } } }, undefined)!
  const feedback = new RoyalFeedback({ now: () => 100, visible: () => true, audio: { unlock() {}, play() {}, stop() {}, destroy() {} }, haptic: output })
  feedback.button(); feedback.configure({ sound: true, haptics: false }); feedback.update([event('tnt', 0, { stage: 'impact' })], 0)
  assert.equal(feedback.hapticsMode, 'native')
  assert.deepEqual(messages.map(message => message.kind), ['button', 'cancel'])
})

test('vibration API preserves device binding, cancels and handles denied/throwing devices', () => {
  const calls: (number | number[])[] = []
  const device = { vibrate(pattern: number | number[]) { assert.equal(this, device); calls.push(pattern); return true } }
  const output = createHapticOutput(undefined, device)!
  assert.equal(output.mode, 'vibration')
  output.play({ kind: 'tnt', strength: 1, combo: 1 }); output.cancel()
  assert.deepEqual(calls, [[22, 12, 34], 0])
  const denied = createHapticOutput(undefined, { vibrate: () => false })!
  assert.equal(denied.play({ kind: 'button', strength: .3, combo: 1 }), false)
  const throwing = createHapticOutput(undefined, { vibrate() { throw new Error('unsupported') } })!
  assert.equal(throwing.play({ kind: 'button', strength: .3, combo: 1 }), false)
  assert.doesNotThrow(() => throwing.cancel())
  assert.equal(vibrationPattern({ kind: 'match', strength: 1, combo: 100 }), 22)
})
