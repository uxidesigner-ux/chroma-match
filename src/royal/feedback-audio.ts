import type { FeedbackCue } from './feedback.ts'

/** Short, layered game sounds; no downloads, infinite loops, or per-frame noise buffers. */
export class RoyalSound {
  private context: AudioContext | null = null
  private output: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private voices = new Map<AudioScheduledSourceNode, AudioNode[]>()
  private readonly maxVoices = 28

  unlock(): void {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {})
      return
    }
    if (typeof window === 'undefined') return
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Context) return
    try {
      const context = new Context()
      const output = context.createGain(), compressor = context.createDynamicsCompressor()
      output.gain.value = .32
      compressor.threshold.value = -15; compressor.knee.value = 15; compressor.ratio.value = 5
      compressor.attack.value = .003; compressor.release.value = .12
      output.connect(compressor).connect(context.destination)
      this.context = context; this.output = output
      if (context.state === 'suspended') void context.resume().catch(() => {})
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .5), context.sampleRate)
      const data = buffer.getChannelData(0)
      let seed = 0x25b8, smooth = 0
      for (let i = 0; i < data.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        const white = seed / 0x80000000 - 1
        smooth = (smooth + white * .12) / 1.12
        data[i] = white * .64 + smooth * 1.8
      }
      this.noiseBuffer = buffer
    } catch { /* Audio is enhancement; input and play remain available. */ }
  }

  private start(source: AudioScheduledSourceNode, nodes: AudioNode[], duration: number, delay: number): void {
    const context = this.context
    if (!context || this.voices.size >= this.maxVoices) { nodes.forEach(node => node.disconnect()); source.disconnect(); return }
    this.voices.set(source, nodes)
    source.onended = () => { source.disconnect(); nodes.forEach(node => node.disconnect()); this.voices.delete(source) }
    source.start(context.currentTime + delay)
    source.stop(context.currentTime + delay + duration + .015)
  }

  private tone(from: number, to: number, duration: number, volume: number, type: OscillatorType = 'sine', delay = 0): void {
    const context = this.context, output = this.output
    if (!context || !output || context.state === 'closed' || this.voices.size >= this.maxVoices) return
    const oscillator = context.createOscillator(), envelope = context.createGain(), at = context.currentTime + delay
    oscillator.type = type
    oscillator.frequency.setValueAtTime(from, at)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + duration)
    envelope.gain.setValueAtTime(.0001, at)
    envelope.gain.exponentialRampToValueAtTime(Math.max(.001, volume), at + .003)
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration)
    oscillator.connect(envelope).connect(output)
    this.start(oscillator, [envelope], duration, delay)
  }

  private noise(from: number, to: number, duration: number, volume: number, delay = 0): void {
    const context = this.context, output = this.output
    if (!context || !output || !this.noiseBuffer || context.state === 'closed' || this.voices.size >= this.maxVoices) return
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), envelope = context.createGain()
    source.buffer = this.noiseBuffer
    const at = context.currentTime + delay
    filter.type = 'lowpass'; filter.Q.value = .75
    filter.frequency.setValueAtTime(from, at); filter.frequency.exponentialRampToValueAtTime(to, at + duration)
    envelope.gain.setValueAtTime(.0001, at)
    envelope.gain.exponentialRampToValueAtTime(volume, at + .004)
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration)
    source.connect(filter).connect(envelope).connect(output)
    this.start(source, [filter, envelope], duration, delay)
  }

  play(cue: FeedbackCue): void {
    const strength = Math.min(1, Math.max(.1, cue.strength))
    switch (cue.kind) {
      case 'button': this.tone(480, 210, .037, .24); this.noise(2400, 800, .022, .10); break
      case 'select': this.tone(700, 560, .04, .12, 'triangle'); break
      case 'swap': this.noise(2800, 700, .065, .13); this.tone(260, 440, .055, .12); break
      case 'reject': this.tone(180, 105, .085, .18, 'triangle'); this.noise(900, 300, .035, .10); break
      case 'match': {
        const root = 560 * Math.pow(2, Math.min(7, cue.combo - 1) / 12)
        this.tone(205, 85, .055, .19 * strength)
        this.tone(root, root * 1.15, .095, .17, 'triangle')
        this.noise(2400, 900, .04, .12 * strength)
        break
      }
      case 'create': this.tone(740, 800, .14, .18, 'triangle'); this.tone(1110, 1180, .12, .10, 'sine', .025); this.tone(1480, 1560, .11, .07, 'sine', .045); break
      case 'tnt': case 'cannon':
        this.tone(125, 43, .19, .67 * strength); this.tone(235, 80, .10, .23 * strength)
        this.noise(3600, 220, .20, .56 * strength); this.noise(6000, 1800, .035, .19)
        break
      case 'hammer': this.tone(155, 58, .13, .46); this.noise(2900, 450, .085, .33); break
      case 'rocket-launch': case 'arrow': this.noise(5000, 1100, .15, .26); this.tone(190, 500, .09, .13, 'triangle'); break
      case 'rocket': this.noise(4400, 700, .075, .28); this.tone(175, 70, .09, .29); break
      case 'propeller-launch': this.tone(280, 390, .22, .11, 'triangle'); this.tone(318, 450, .20, .08, 'triangle'); this.noise(1600, 2800, .17, .12); break
      case 'propeller': this.tone(370, 120, .075, .32); this.noise(2300, 550, .06, .23); this.tone(830, 720, .06, .09); break
      case 'lightball-charge': this.tone(680, 1450, .20, .12); this.tone(1360, 2900, .15, .055, 'sine', .025); break
      case 'lightball': this.noise(6500, 1700, .12, .28); this.tone(195, 90, .10, .27); this.tone(1150, 760, .13, .13); break
      case 'land': this.tone(170, 88, .043, .10 * strength); this.noise(1300, 500, .025, .065 * strength); break
      case 'shuffle': this.noise(900, 3600, .19, .17); this.tone(430, 830, .16, .11, 'triangle'); break
      case 'win':
        for (const [index, frequency] of [523.25, 659.25, 783.99, 1046.5].entries()) this.tone(frequency, frequency * 1.01, .23, .19, 'triangle', index * .075)
        break
      case 'lose': this.tone(295, 220, .16, .15, 'triangle'); this.tone(220, 165, .19, .13, 'triangle', .12); break
    }
  }

  stop(): void {
    for (const [source, nodes] of this.voices) {
      try { source.stop() } catch { /* Already ended. */ }
      source.onended = null; source.disconnect(); nodes.forEach(node => node.disconnect())
    }
    this.voices.clear()
  }
  destroy(): void {
    this.stop()
    if (this.context) void this.context.close().catch(() => {})
    this.context = null; this.output = null; this.noiseBuffer = null
  }
}
