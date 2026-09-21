/**
 * Adapted from M3-org/CharacterStudio src/library/blinkManager.js,
 * commit 293182b (MIT, Copyright 2022 Atlas Foundation).
 * Replaces its unowned setInterval with an explicit tick and deterministic
 * screenshot/reduced-motion state. See public/licenses/character-studio.txt.
 */
import type { VRM } from '@pixiv/three-vrm'

export class BlinkManager {
  private mode: 'ready' | 'closing' | 'opening' = 'ready'
  private eyeOpen = 1
  private elapsed = 0
  private next = 3

  update(vrm: VRM, delta: number, enabled: boolean): void {
    if (!enabled) {
      this.eyeOpen = 1
      this.mode = 'ready'
      this.elapsed = 0
    } else if (this.mode === 'ready') {
      this.elapsed += delta
      if (this.elapsed >= this.next) {
        this.elapsed = 0
        this.next = 2 + Math.random() * 4
        this.mode = 'closing'
      }
    } else if (this.mode === 'closing') {
      this.eyeOpen = Math.max(0, this.eyeOpen - delta / 0.12)
      if (this.eyeOpen === 0) this.mode = 'opening'
    } else {
      this.eyeOpen = Math.min(1, this.eyeOpen + delta / 0.16)
      if (this.eyeOpen === 1) this.mode = 'ready'
    }
    vrm.expressionManager?.setValue('blink', 1 - this.eyeOpen)
  }
}
