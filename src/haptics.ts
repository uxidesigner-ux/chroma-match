/**
 * Short vibration patterns that back up the sound effects on a phone.
 *
 * iOS Safari does not implement `navigator.vibrate` at all, so this is inert
 * there rather than degraded — the sound kit carries the feedback instead. It
 * is also a no-op whenever the player has muted the game, since a buzz with no
 * sound reads as a malfunction rather than a reward.
 */
export class Haptics {
  enabled = true

  private buzz(pattern: number | number[]): void {
    if (!this.enabled) return
    try {
      navigator.vibrate?.(pattern)
    } catch {
      /* some platforms throw instead of returning false; nothing to recover */
    }
  }

  swap(): void {
    this.buzz(9)
  }

  reject(): void {
    this.buzz([12, 40, 12])
  }

  /** Grows with the cascade, so a long chain is felt as well as heard. */
  clear(combo: number): void {
    this.buzz(Math.min(12 + combo * 5, 45))
  }

  /**
   * A detonation, felt as it is fired rather than after it lands.
   *
   * Two short taps rather than one long buzz: a buzz reads as a notification,
   * and what this is describing is a hit.
   */
  strike(weight: number): void {
    const size = Math.min(1, Math.max(0, weight))
    this.buzz([8 + Math.round(size * 10), 24, 14 + Math.round(size * 22)])
  }

  power(): void {
    this.buzz([10, 30, 22])
  }

  levelUp(): void {
    this.buzz([18, 55, 18, 55, 45])
  }

  gameOver(): void {
    this.buzz([40, 70, 90])
  }
}
