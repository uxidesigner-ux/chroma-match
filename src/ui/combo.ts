import { myAvatar, myAvatarCode, paintAvatar } from '../avatar/store.ts'
import { t } from '../i18n/index.ts'

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}

/** Below this a chain is not worth announcing; two is the first real one. */
const FLOOR = 2
/** How long the badge stays up after the last clear in a chain, in seconds. */
const LINGER = 0.9

/**
 * The chain multiplier, over the board.
 *
 * A cascade was previously reported only by a number floating off the match and
 * fading in under a second — by the time the player looked, the chain that
 * earned it was over. A score chaser has to be able to see the multiplier climb
 * while it is climbing, because that is the thing being chased.
 *
 * It is deliberately not in the readouts at the top: a chain happens on the
 * board, and the player's eyes are already there.
 */
export class ComboMeter {
  private root = el('combo')
  private value = el('combo-x')
  private word = el('combo-word')
  private avatar = el<HTMLCanvasElement>('combo-avatar')
  private portraitCode = ''
  private remaining = 0
  private shown = 0

  /** Paint once when entering a run, never render a 3D scene per cascade. */
  prepare(): void {
    const code = myAvatarCode()
    if (code === this.portraitCode && this.avatar.dataset.avatarState !== 'error') return
    this.portraitCode = code
    paintAvatar(this.avatar, myAvatar(), 30, { round: true })
  }

  /** Called for every clear; anything under the floor ends the chain instead. */
  report(combo: number): void {
    if (combo < FLOOR) return
    this.remaining = LINGER
    if (combo === this.shown) {
      // Same rung, new clear: retrigger the pop so the badge answers the hit.
      this.root.classList.remove('is-bump')
      void this.root.offsetWidth
      this.root.classList.add('is-bump')
      return
    }

    this.shown = combo
    this.value.textContent = `×${combo}`
    // Four rungs of heat rather than a continuous ramp: a colour that shifts a
    // little on every step reads as noise, one that changes at thresholds reads
    // as progress.
    const heat = combo >= 6 ? 3 : combo >= 4 ? 2 : combo >= 3 ? 1 : 0
    this.root.dataset.heat = String(heat)
    this.avatar.hidden = heat === 0
    const message = heat === 3 ? 'comboLegendary'
      : heat === 2 ? 'comboAmazing'
      : heat === 1 ? 'comboNice' : 'chain'
    this.word.textContent = t(message)
    this.root.hidden = false
    this.root.classList.remove('is-bump')
    void this.root.offsetWidth
    this.root.classList.add('is-bump')
  }

  update(dt: number): void {
    if (this.remaining <= 0) return
    this.remaining -= dt
    if (this.remaining > 0) return
    this.hide()
  }

  /** Used when a run ends or the board is left, so it cannot outlive its run. */
  hide(): void {
    this.remaining = 0
    this.shown = 0
    this.root.hidden = true
    this.avatar.hidden = true
    this.root.classList.remove('is-bump')
  }
}
