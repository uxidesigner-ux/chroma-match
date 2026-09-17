import { account, onAccount, signInWithGoogle, signOutToAnonymous } from '../leaderboard/session.ts'
import type { Account } from '../leaderboard/session.ts'
import { cleanName } from '../leaderboard/types.ts'
import { codeFor } from '../social/code.ts'
import { publishProfile } from '../social/players.ts'
import { avatarCanvas, myAvatar, paintAvatar, setMyAvatar } from '../avatar/store.ts'
import { catalogueFor } from '../avatar/spec.ts'
import type { AvatarSpec, Slot } from '../avatar/spec.ts'
import type { ColourPart, Part } from '../avatar/parts.ts'
import { Sheet } from './sheet.ts'
import { onLanguageChange, t } from '../i18n/index.ts'
import { partName } from '../i18n/parts.ts'
import type { StringKey } from '../i18n/index.ts'

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}

/** What each slot is called on the tab, and whether it is picked by colour. */
const TABS: ReadonlyArray<{ slot: Slot; label: StringKey; colour: boolean }> = [
  { slot: 'hair', label: 'tabHair', colour: false },
  { slot: 'hairColour', label: 'tabHairColour', colour: true },
  { slot: 'skin', label: 'tabSkin', colour: true },
  { slot: 'outfit', label: 'tabOutfit', colour: false },
  { slot: 'outfitColour', label: 'tabOutfitColour', colour: true },
  { slot: 'accessory', label: 'tabAccessory', colour: false },
  { slot: 'backdrop', label: 'tabBackdrop', colour: true },
]

const CARD_SIZE = 124
const PREVIEW_SIZE = 116
const SWATCH_SIZE = 44

/**
 * The player, on the launch screen and behind it.
 *
 * The card is the one thing on the home screen that is about *them* rather than
 * about the game: a face, a name, and the three numbers worth carrying between
 * sessions. Everything it cannot fit — the whole customiser, the name field,
 * and signing in — is behind it in a sheet, because a launch screen that opens
 * on an identity form is a launch screen nobody plays from.
 *
 * The avatar is drawn, not uploaded. That is what makes it free to put a face
 * on every row of a friends board, and what will make a locked hairstyle a
 * one-word change in the catalogue rather than an asset pipeline.
 */
export class ProfileCard {
  private face = el<HTMLButtonElement>('profile-face')
  private canvas = el<HTMLCanvasElement>('profile-avatar')
  private cardName = el('profile-name')

  private sheet = new Sheet('sheet-profile')
  private preview = el<HTMLCanvasElement>('profile-preview')
  private tabStrip = el('profile-tabs')
  private options = el('profile-options')
  private nameInput = el<HTMLInputElement>('profile-name-input')
  private codeLine = el('profile-code')
  private sub = el('account-sub')
  private action = el<HTMLButtonElement>('account-action')

  private draft: AvatarSpec = myAvatar()
  private slot: Slot = 'hair'
  private listeners: Array<() => void> = []
  private busy = false

  constructor(
    private storedName: () => string,
    private saveName: (name: string) => void,
  ) {
    this.face.addEventListener('click', () => this.open())
    this.action.addEventListener('click', () => void this.toggleAccount())

    this.nameInput.addEventListener('input', () => {
      const clean = cleanName(this.nameInput.value)
      this.saveName(clean)
      this.paintCard()
      // Pushed to the profile document as it is typed rather than on some
      // Save button: there is no Save button, and a name that only reaches
      // friends after the next posted run is a name that looks broken.
      if (account()?.kind === 'google') {
        void publishProfile(clean, account()?.photo ?? '').catch(() => {})
      }
    })

    for (const tab of TABS) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'profile-tab'
      button.dataset.slot = tab.slot
      button.dataset.i18n = tab.label
      button.addEventListener('click', () => this.show(tab.slot))
      this.tabStrip.append(button)
    }

    onAccount((current) => this.paintAccount(current))
    // The tab labels are filled by the static pass, but everything else here
    // is painted from script: the account sentence, the name fallback, and the
    // part names under the swatches.
    onLanguageChange(() => {
      this.paintAccount(account())
      if (!this.sheet.hidden) this.paintOptions()
    })
    this.paintCard()
  }

  /** Fires after the avatar or the name changed, so other rows can repaint. */
  onChange(listener: () => void): void {
    this.listeners.push(listener)
  }

  open(): void {
    this.draft = myAvatar()
    this.nameInput.value = this.storedName()
    this.show(this.slot)
    this.sheet.show()
  }

  /** Repaints the card's face, name and the three numbers' owner. */
  paintCard(): void {
    paintAvatar(this.canvas, myAvatar(), CARD_SIZE, { round: true })
    const signed = account()
    this.cardName.textContent =
      cleanName(this.storedName()) ||
      (signed?.kind === 'google' ? cleanName(signed.name) : '') ||
      t('defaultName')
  }

  private paintAccount(current: Account | null): void {
    const signedIn = current?.kind === 'google'
    this.action.textContent = signedIn ? t('accountSignOut') : t('accountSignIn')
    this.sub.textContent = signedIn
      ? t('accountOnline')
      : current
        ? t('accountOffline')
        : t('accountLocal')
    this.codeLine.textContent = signedIn ? t('friendCode', { code: codeFor(current.uid) }) : ''
    this.codeLine.hidden = !signedIn
    this.paintCard()
  }

  private async toggleAccount(): Promise<void> {
    if (this.busy) return
    this.busy = true
    const current = account()
    this.action.disabled = true
    this.action.textContent =
      current?.kind === 'google' ? t('accountSigningOut') : t('accountSigningIn')

    try {
      if (current?.kind === 'google') {
        await signOutToAnonymous()
      } else {
        const result = await signInWithGoogle()
        if (result.ok) {
          const signed = account()
          await publishProfile(
            cleanName(this.storedName()) || cleanName(signed?.name ?? '') || t('anonymous'),
            signed?.photo ?? '',
          )
          if (result.switched) {
            this.sub.textContent = t('accountSwitched')
            this.action.disabled = false
            this.busy = false
            for (const listener of this.listeners) listener()
            return
          }
        } else if (result.reason) {
          this.sub.textContent = result.reason
          this.action.disabled = false
          this.action.textContent = t('accountSignIn')
          this.busy = false
          return
        }
      }
    } catch {
      this.sub.textContent = t('accountFailed')
    }
    this.busy = false
    this.action.disabled = false
    this.paintAccount(account())
    for (const listener of this.listeners) listener()
  }

  /* ---- the customiser --------------------------------------------------- */

  private show(slot: Slot): void {
    this.slot = slot
    for (const tab of this.tabStrip.querySelectorAll<HTMLButtonElement>('.profile-tab')) {
      tab.classList.toggle('is-on', tab.dataset.slot === slot)
    }
    this.paintOptions()
    paintAvatar(this.preview, this.draft, PREVIEW_SIZE, { round: true })
  }

  private paintOptions(): void {
    const byColour = TABS.find((tab) => tab.slot === this.slot)?.colour ?? false
    this.options.replaceChildren()

    for (const part of catalogueFor(this.slot)) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'profile-option'
      const shown = partName(this.slot, part.id, part.name)
      button.title = shown
      if (this.draft[this.slot] === part.id) button.classList.add('is-on')

      if (byColour) {
        const chip = document.createElement('span')
        chip.className = 'option-chip'
        chip.style.background = (part as ColourPart).colour
        button.append(chip)
      } else {
        // A style is shown by wearing it. A list of words — "Bob", "Waves" —
        // makes the player try each one to find out what it is, which is the
        // customiser doing none of its job.
        button.append(avatarCanvas({ ...this.draft, [this.slot]: part.id }, SWATCH_SIZE, {
          round: true,
        }))
      }

      const label = document.createElement('span')
      label.className = 'option-name'
      label.textContent = shown
      button.append(label)

      // Nothing is locked yet, and the editor is already built to say so: a
      // part that is earned or bought arrives as a catalogue edit, not as new
      // code here.
      if (part.lock !== 'free') {
        button.classList.add('is-locked')
        button.disabled = true
        button.title = t('lockedSuffix', { name: shown, how: lockWord(part) })
      }

      button.addEventListener('click', () => this.choose(part))
      this.options.append(button)
    }
  }

  private choose(part: Part): void {
    if (part.lock !== 'free') return
    this.draft = { ...this.draft, [this.slot]: part.id }
    // Saved on the tap rather than behind a Save button. The preview is the
    // confirmation, and a customiser that can be left half-applied is one more
    // state to get wrong for no benefit.
    setMyAvatar(this.draft)
    this.paintOptions()
    paintAvatar(this.preview, this.draft, PREVIEW_SIZE, { round: true })
    this.paintCard()
    if (account()?.kind === 'google') {
      void publishProfile(
        cleanName(this.storedName()) || t('anonymous'),
        account()?.photo ?? '',
      ).catch(() => {})
    }
    for (const listener of this.listeners) listener()
  }
}

function lockWord(part: Part): string {
  if (part.lock === 'paid') return t('lockedShop')
  if (part.lock === 'quest') return t('lockedQuest')
  return t('lockedEvent')
}
