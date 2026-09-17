import { LANGUAGES, language, setLanguage, t } from '../i18n/index.ts'
import type { LanguageId } from '../i18n/index.ts'
import { SKINS, activeSkin, onSkinChange, setSkin } from '../render/skins/index.ts'
import { hapticsOn, hapticsSupported, setHapticsOn, setSoundOn, soundOn } from '../settings.ts'
import { Sheet } from './sheet.ts'

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}

export interface SettingsWiring {
  /** Applies the sound preference to the kit, and unlocks it on the gesture. */
  applySound(on: boolean): void
  applyHaptics(on: boolean): void
}

/**
 * Language, board style, sound and vibration, in one place.
 *
 * These were three bare buttons in the launch screen's footer, two of which
 * cycled rather than chose — a player who wanted the Paper board had to tap
 * through Glass to reach it and could not see what the third option was. A
 * list you can see all of is not a nicety here; it is the difference between
 * choosing and guessing.
 *
 * Every language is written in its own script. Somebody who opened the app in
 * a language they cannot read is exactly the person who needs this list, and
 * "Korean" spelled in Japanese is no use to them.
 */
export class SettingsSheet {
  private sheet = new Sheet('sheet-settings')
  private langs = el('set-langs')
  private skins = el('set-skins')
  private sound = el<HTMLButtonElement>('set-sound')
  private haptics = el<HTMLButtonElement>('set-haptics')
  private hapticsSub = el('set-haptics-sub')

  constructor(private wiring: SettingsWiring) {
    for (const entry of LANGUAGES) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'set-chip'
      button.setAttribute('role', 'radio')
      button.dataset.lang = entry.id
      // Its own name in its own script, never translated.
      button.textContent = entry.label
      button.addEventListener('click', () => this.chooseLanguage(entry.id))
      this.langs.append(button)
    }

    for (const skin of SKINS) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'set-chip'
      button.setAttribute('role', 'radio')
      button.dataset.skinId = skin.id
      button.textContent = skin.name
      button.addEventListener('click', () => setSkin(skin))
      this.skins.append(button)
    }

    this.sound.addEventListener('click', () => {
      const next = !soundOn()
      setSoundOn(next)
      this.wiring.applySound(next)
      this.paint()
    })

    this.haptics.addEventListener('click', () => {
      if (!hapticsSupported()) return
      const next = !hapticsOn()
      setHapticsOn(next)
      this.wiring.applyHaptics(next)
      this.paint()
    })

    el('settings-done').addEventListener('click', () => this.sheet.hide())
    el('open-settings').addEventListener('click', () => this.show())

    // The style can also change from the URL, so the row is painted from the
    // active skin rather than from whichever chip was pressed.
    onSkinChange(() => this.paint())
    this.paint()
  }

  show(): void {
    this.paint()
    this.sheet.show()
  }

  private chooseLanguage(id: LanguageId): void {
    setLanguage(id)
    this.paint()
  }

  /** Repaints every row from the stored state, not from what was tapped. */
  paint(): void {
    const lang = language()
    for (const chip of this.langs.querySelectorAll<HTMLButtonElement>('[data-lang]')) {
      const on = chip.dataset.lang === lang
      chip.classList.toggle('is-on', on)
      chip.setAttribute('aria-checked', String(on))
    }

    const skin = activeSkin().id
    for (const chip of this.skins.querySelectorAll<HTMLButtonElement>('[data-skin-id]')) {
      const on = chip.dataset.skinId === skin
      chip.classList.toggle('is-on', on)
      chip.setAttribute('aria-checked', String(on))
    }

    const sound = soundOn()
    this.sound.classList.toggle('is-on', sound)
    this.sound.setAttribute('aria-checked', String(sound))

    const canBuzz = hapticsSupported()
    const buzz = canBuzz && hapticsOn()
    this.haptics.classList.toggle('is-on', buzz)
    this.haptics.disabled = !canBuzz
    this.haptics.setAttribute('aria-checked', String(buzz))
    // Empty rather than a reassurance when it does work: a row that explains
    // itself only when something is wrong is a row you can skip when it is not.
    this.hapticsSub.textContent = canBuzz ? '' : t('settingsHapticsSub')
  }
}
