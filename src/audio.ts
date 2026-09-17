/**
 * A four-oscillator sound kit, synthesised at runtime.
 *
 * Shipping no audio files keeps the build a single JS bundle and sidesteps
 * licensing entirely — the trade-off is that everything has to be expressible
 * as an envelope over a couple of oscillators.
 */
export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  enabled = true

  /** Browsers only allow audio to start inside a user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    this.ctx = new Ctor()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.22
    this.master.connect(this.ctx.destination)
  }

  private tone(
    freq: number,
    duration: number,
    opts: { type?: OscillatorType; gain?: number; to?: number; delay?: number } = {},
  ): void {
    const ctx = this.ctx
    const master = this.master
    if (!this.enabled || !ctx || !master) return
    const t0 = ctx.currentTime + (opts.delay ?? 0)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = opts.type ?? 'sine'
    osc.frequency.setValueAtTime(freq, t0)
    if (opts.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t0 + duration)
    const peak = opts.gain ?? 0.5
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
    osc.connect(gain).connect(master)
    osc.start(t0)
    osc.stop(t0 + duration + 0.02)
  }

  select(): void {
    this.tone(660, 0.06, { type: 'triangle', gain: 0.28 })
  }

  swap(): void {
    this.tone(420, 0.1, { type: 'triangle', gain: 0.3, to: 620 })
  }

  reject(): void {
    this.tone(150, 0.14, { type: 'sawtooth', gain: 0.2, to: 90 })
  }

  /** Rises with the cascade so a long chain sounds like one climbing phrase. */
  clear(combo: number): void {
    const step = Math.min(combo, 8) - 1
    const root = 440 * Math.pow(2, step / 12)
    this.tone(root, 0.16, { type: 'triangle', gain: 0.4, to: root * 1.5 })
    this.tone(root * 2, 0.12, { type: 'sine', gain: 0.18, delay: 0.02 })
  }

  /**
   * The charge and release of a detonation, played while the beam travels.
   *
   * A rising sweep under a short burst of noise: the sweep is the wind-up the
   * eye is already watching, and it lands where the gems go rather than after
   * them, so the two read as one event. A bigger blast gets a lower, longer
   * sweep — weight, not volume.
   */
  strike(weight: number): void {
    const size = Math.min(1, Math.max(0, weight))
    const from = 300 - size * 120
    this.tone(from, 0.15, { type: 'sawtooth', gain: 0.18 + size * 0.1, to: from * 4.5 })
    this.tone(from * 2.5, 0.12, { type: 'square', gain: 0.08, to: from * 6, delay: 0.03 })
  }

  power(): void {
    this.tone(880, 0.18, { type: 'square', gain: 0.16, to: 1760 })
    this.tone(1320, 0.14, { type: 'sine', gain: 0.14, delay: 0.05 })
  }

  shuffle(): void {
    this.tone(300, 0.3, { type: 'sine', gain: 0.22, to: 700 })
  }

  levelUp(): void {
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      this.tone(f, 0.26, { type: 'triangle', gain: 0.32, delay: i * 0.09 }),
    )
  }

  gameOver(): void {
    ;[440, 349.23, 261.63].forEach((f, i) =>
      this.tone(f, 0.4, { type: 'sine', gain: 0.3, delay: i * 0.16 }),
    )
  }
}
