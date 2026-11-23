import type { EffectEvent } from './model.ts'
import { MATCH_CONVERGE_DURATION } from './timing.ts'
import { RoyalSound } from './feedback-audio.ts'

export type FeedbackKind = 'button' | 'select' | 'swap' | 'reject' | 'match' | 'create' | 'rocket' | 'propeller' | 'tnt' | 'lightball' | 'land' | 'shuffle' | 'hammer' | 'arrow' | 'cannon' | 'win' | 'lose' | 'rocket-launch' | 'propeller-launch' | 'lightball-charge'
export interface FeedbackCue { kind: FeedbackKind; strength: number; combo: number }
export type HapticsMode = 'native' | 'vibration' | 'unavailable'
interface HapticOutput {
  mode: Exclude<HapticsMode, 'unavailable'>
  play(cue: FeedbackCue): boolean
  cancel(): void
}
interface AudioOutput { unlock(): void; play(cue: FeedbackCue): void; stop(): void; destroy(): void }
export interface FeedbackRuntime { now: () => number; visible: () => boolean; audio: AudioOutput; haptic?: HapticOutput }
interface NativeHost {
  chromaNativeCapabilities?: { haptics?: boolean }
  webkit?: { messageHandlers?: { chromaHaptics?: { postMessage(message: { kind: string; intensity: number }): void } } }
}
interface Pending { at: number; cue: FeedbackCue; priority: number; channel: 'impact' | 'motion' | 'result'; haptic: boolean }

/** Pulses are deliberately brief. A matching cascade must not become a continuous buzz. */
export function vibrationPattern(cue: FeedbackCue): number | number[] {
  switch (cue.kind) {
    case 'button': case 'select': return 7
    case 'swap': return 10
    case 'reject': return [8, 35, 8]
    case 'match': return Math.min(22, 9 + Math.max(0, cue.combo - 1) * 2)
    case 'create': return [9, 24, 16]
    case 'tnt': case 'cannon': return [22, 12, 34]
    case 'hammer': return 26
    case 'rocket': case 'arrow': return [12, 12, 15]
    case 'propeller': return 16
    case 'lightball': return [15, 15, 20]
    case 'land': return 6
    case 'shuffle': return [8, 25, 8]
    case 'win': return [14, 40, 18, 40, 30]
    case 'lose': return [16, 45, 18]
    default: return 0
  }
}

/** No UA guesses or hidden-switch tricks: a native host must opt in explicitly. */
export function createHapticOutput(host: NativeHost | undefined, device: { vibrate(pattern: number | number[]): boolean } | undefined): HapticOutput | undefined {
  const handler = host?.webkit?.messageHandlers?.chromaHaptics
  if (host?.chromaNativeCapabilities?.haptics === true && typeof handler?.postMessage === 'function') {
    return {
      mode: 'native',
      play: cue => {
        if (vibrationPattern(cue) === 0) return false
        try { handler.postMessage({ kind: cue.kind, intensity: Math.min(1, Math.max(0, cue.strength)) }); return true } catch { return false }
      },
      cancel: () => { try { handler.postMessage({ kind: 'cancel', intensity: 0 }) } catch { /* Host may be closing. */ } },
    }
  }
  if (typeof device?.vibrate !== 'function') return undefined
  return {
    mode: 'vibration',
    play: cue => { try { return device.vibrate(vibrationPattern(cue)) } catch { return false } },
    cancel: () => { try { device.vibrate(0) } catch { /* Permission/device can change. */ } },
  }
}

function browserRuntime(): FeedbackRuntime {
  const haptic = createHapticOutput(typeof window === 'undefined' ? undefined : window as NativeHost,
    typeof navigator === 'undefined' ? undefined : navigator)
  return {
    now: () => performance.now(), visible: () => typeof document === 'undefined' || !document.hidden,
    audio: new RoyalSound(), ...(haptic ? { haptic } : {}),
  }
}

/** Game events, audio and vibration share simulation time; pause/speed changes need no timers. */
export class RoyalFeedback {
  private readonly runtime: FeedbackRuntime
  private options = { sound: true, haptics: true }
  private activated = false
  private pending: Pending[] = []
  private seen = new Set<string>()
  private lastGameTime = 0
  private lastHaptic = -Infinity
  private lastHapticPriority = 0
  private hasHaptic = false
  private audioTimes = new Map<string, { at: number; priority: number }>()

  constructor(runtime: FeedbackRuntime = browserRuntime()) { this.runtime = runtime }
  /** API/host availability, not proof that a physical motor moved. */
  get hapticsMode(): HapticsMode { return this.runtime.haptic?.mode ?? 'unavailable' }
  get hapticsAvailable(): boolean { return this.hapticsMode !== 'unavailable' }

  configure(options: { sound: boolean; haptics: boolean }): void {
    if (this.options.sound && !options.sound) this.runtime.audio.stop()
    if (this.options.haptics && !options.haptics) this.cancelHaptic()
    this.options = { ...options }
  }
  /** Call within pointer/key activation. Muting sound does not mute the separate vibration setting. */
  unlock(): void {
    this.activated = true
    if (this.options.sound && this.runtime.visible()) this.runtime.audio.unlock()
  }
  button(): void { this.unlock(); this.emit({ kind: 'button', strength: .32, combo: 1 }, 10, 'ui', true) }
  select(): void { this.unlock(); this.emit({ kind: 'select', strength: .25, combo: 1 }, 8, 'ui', true) }
  reward(): void { this.emit({ kind: 'win', strength: .8, combo: 1 }, 100, 'result', true) }

  private cancelHaptic(): void {
    if (!this.hasHaptic) return
    this.runtime.haptic?.cancel(); this.hasHaptic = false
  }
  /** Preserve game-time cues while the board is paused; never let a waveform keep playing behind a dialog. */
  pause(): void { this.runtime.audio.stop(); this.cancelHaptic() }
  reset(): void {
    this.pause(); this.pending = []; this.seen.clear(); this.audioTimes.clear()
    this.lastGameTime = 0; this.lastHaptic = -Infinity; this.lastHapticPriority = 0
  }
  destroy(): void { this.reset(); this.runtime.audio.destroy() }

  private emit(cue: FeedbackCue, priority: number, channel: string, haptic: boolean): void {
    if (!this.activated || !this.runtime.visible()) return
    const now = this.runtime.now(), previousAudio = this.audioTimes.get(channel)
    const audioGap = channel === 'result' ? 200 : channel === 'motion' ? 65 : channel === 'impact' ? 45 : 30
    if (this.options.sound && (!previousAudio || now - previousAudio.at >= audioGap || priority > previousAudio.priority + 15)) {
      this.runtime.audio.play(cue); this.audioTimes.set(channel, { at: now, priority })
    }
    if (!haptic || !this.options.haptics || !this.runtime.haptic) return
    const gap = now - this.lastHaptic
    if (gap < 75 && !(gap >= 28 && priority > this.lastHapticPriority)) return
    if (this.runtime.haptic.play(cue)) {
      this.lastHaptic = now; this.lastHapticPriority = priority; this.hasHaptic = true
    }
  }

  private schedule(at: number, kind: FeedbackKind, priority: number, strength = .6, combo = 1, channel: Pending['channel'] = 'impact', haptic = true): void {
    if (!Number.isFinite(at)) return
    this.pending.push({ at, cue: { kind, strength, combo }, priority, channel, haptic })
  }
  private receive(event: EffectEvent): void {
    const stamp = `${event.kind}:${event.at}:${event.stage ?? ''}:${event.from ?? ''}:${event.to ?? ''}:${event.tool ?? ''}:${event.cells.join(',')}:${event.createdPiece?.id ?? ''}`
    if (this.seen.has(stamp)) return
    this.seen.add(stamp)
    if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!)
    const at = event.at + (event.delay ?? 0), count = event.cells.length
    switch (event.kind) {
      case 'swap': this.schedule(at, 'swap', 30, .4, 1, 'motion'); break
      case 'invalid': this.schedule(at, 'reject', 35, .35); break
      case 'activate':
        if (event.power === 'propeller' || event.pieces?.some(item => item.piece.power === 'propeller')) this.schedule(at, 'propeller-launch', 15, .35, 1, 'motion', false)
        break
      case 'clear':
        if (!event.pieces || event.pieces.some(item => !item.piece.power)) this.schedule(at, 'match', 40, Math.min(1, .5 + count * .025), event.combo ?? 1)
        break
      case 'damage': this.schedule(at, 'match', 42, .65, event.combo ?? 1); break
      case 'power': this.schedule(at + MATCH_CONVERGE_DURATION, 'create', 65, .7); break
      case 'fall': {
        const row = event.to === undefined ? 0 : event.fromRow ?? 0
        const strength = event.from !== undefined ? .45 : row < 0 ? .6 : .5
        this.schedule(at + (event.duration ?? 0), 'land', 12, strength)
        break
      }
      case 'rocket':
        this.schedule(at, event.stage === 'launch' ? 'rocket-launch' : 'rocket', event.stage === 'launch' ? 25 : 72, .7, 1, event.stage === 'launch' ? 'motion' : 'impact', event.stage !== 'launch')
        break
      case 'propeller':
        this.schedule(at, event.stage === 'launch' ? 'propeller-launch' : 'propeller', event.stage === 'launch' ? 16 : 68, .65, 1, event.stage === 'launch' ? 'motion' : 'impact', event.stage !== 'launch')
        break
      case 'tnt': if (event.stage !== 'launch') this.schedule(at, 'tnt', 90, event.combo ? 1 : .9); break
      case 'lightball':
        this.schedule(at, event.stage === 'launch' ? 'lightball-charge' : 'lightball', event.stage === 'launch' ? 20 : 80, .8, 1, event.stage === 'launch' ? 'motion' : 'impact', event.stage !== 'launch')
        break
      case 'tool': if (event.tool) this.schedule(at, event.tool, event.tool === 'cannon' ? 92 : event.tool === 'hammer' ? 88 : 76, .9); break
      case 'shuffle': this.schedule(at, 'shuffle', 55, .4); break
      case 'win': this.schedule(at, 'win', 110, 1, 1, 'result'); break
      case 'lose': this.schedule(at, 'lose', 100, .5, 1, 'result'); break
    }
    // At most a few boards' worth of deferred landings; old events cannot grow this unboundedly.
    if (this.pending.length > 384) this.pending.splice(0, this.pending.length - 384)
  }

  update(events: readonly EffectEvent[], simulationTime: number): void {
    if (!Number.isFinite(simulationTime)) return
    if (simulationTime < this.lastGameTime) this.reset()
    this.lastGameTime = simulationTime
    if (!this.runtime.visible()) { this.pause(); return }
    for (const event of events) this.receive(event)
    const due = this.pending.filter(item => item.at <= simulationTime + 1e-8 && simulationTime - item.at <= .14)
    this.pending = this.pending.filter(item => item.at > simulationTime + 1e-8)
    const strongest = (channel: Pending['channel']) => due.filter(item => item.channel === channel).sort((a, b) => b.priority - a.priority || b.cue.strength - a.cue.strength)[0]
    const result = strongest('result')
    if (result) { this.emit(result.cue, result.priority, result.channel, result.haptic); return }
    const impact = strongest('impact'), motion = strongest('motion')
    if (impact) this.emit(impact.cue, impact.priority, impact.channel, impact.haptic)
    // A major hit already has its own transient; don't bury it in simultaneous launches.
    if (motion && (!impact || impact.priority < 75)) this.emit(motion.cue, motion.priority, motion.channel, motion.haptic && !impact)
  }
}
