import { account, onAccount, signInWithGoogle, signOutToAnonymous } from '../leaderboard/session.ts'
import type { Account } from '../leaderboard/session.ts'
import { cleanName } from '../leaderboard/types.ts'
import { codeFor } from '../social/code.ts'
import { publishProfile } from '../social/players.ts'
import { myAvatar, paintAvatar } from '../avatar/store.ts'
import { Sheet } from './sheet.ts'
import { onLanguageChange, t } from '../i18n/index.ts'

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}

const CARD_SIZE = 124
const PREVIEW_SIZE = 116

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
  private nameInput = el<HTMLInputElement>('profile-name-input')
  private codeLine = el('profile-code')
  private sub = el('account-sub')
  private action = el<HTMLButtonElement>('account-action')

  private listeners: Array<() => void> = []
  private busy = false

  constructor(
    private storedName: () => string,
    private saveName: (name: string) => void,
    private openCreator: () => void,
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

    // Character editing has its own screen; this sheet keeps the things
    // that are about the account rather than about the character.
    el('profile-edit').addEventListener('click', () => {
      this.sheet.hide()
      this.openCreator()
    })

    onAccount((current) => this.paintAccount(current))
    // The tab labels are filled by the static pass, but everything else here
    // is painted from script: the account sentence, the name fallback, and the
    // part names under the swatches.
    onLanguageChange(() => this.paintAccount(account()))
    this.paintCard()
  }

  /** Fires after the avatar or the name changed, so other rows can repaint. */
  onChange(listener: () => void): void {
    this.listeners.push(listener)
  }

  open(): void {
    this.nameInput.value = this.storedName()
    this.refresh()
    this.sheet.show()
  }

  /** Repaints the face this sheet shows, after the creator changed it. */
  refresh(): void {
    paintAvatar(this.preview, myAvatar(), PREVIEW_SIZE, { round: true })
    this.paintCard()
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

}
