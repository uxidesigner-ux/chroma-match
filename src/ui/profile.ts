import { account, onAccount, signInWithGoogle, signOutToAnonymous } from '../leaderboard/session.ts'
import type { Account } from '../leaderboard/session.ts'
import { cleanName } from '../leaderboard/types.ts'
import { codeFor } from '../social/code.ts'
import { publishProfile } from '../social/players.ts'
import { myAvatar, paintAvatar } from '../avatar/store.ts'
import type { Screens, ScreenName } from './screens.ts'
import { onLanguageChange, t } from '../i18n/index.ts'
import { PlayerPanel } from './player-panel.ts'

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}

const CARD_SIZE = 124
const PREVIEW_SIZE = 116

/** Cached player identity and its full-page account/growth destination. */
export class ProfileCard {
  private face = el<HTMLButtonElement>('profile-face')
  private canvas = el<HTMLCanvasElement>('profile-avatar')
  private cardName = el('profile-name')

  private destination: ScreenName = 'map'
  private opener: HTMLElement | null = null
  private returning = false
  private preview = el<HTMLCanvasElement>('profile-preview')
  private nameInput = el<HTMLInputElement>('profile-name-input')
  private codeLine = el('profile-code')
  private sub = el('account-sub')
  private action = el<HTMLButtonElement>('account-action')

  private listeners: Array<() => void> = []
  private busy = false
  private growth = new PlayerPanel()

  constructor(
    private storedName: () => string,
    private saveName: (name: string) => void,
    private openCreator: () => void,
    private screens: Screens,
  ) {
    // A reload starts at the remembered hub, so an old profile history marker
    // must not make the next Back return to an already-open profile.
    if (history.state?.chromaProfile) history.replaceState({ ...history.state, chromaProfile: false }, '')
    this.face.addEventListener('click', () => this.open())
    el('profile-close').addEventListener('click', () => this.back())
    window.addEventListener('popstate', () => {
      this.returning = false
      if (history.state?.chromaProfile) this.open(false)
      else if (this.screens.active === 'profile') this.restore()
    })
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.screens.active === 'profile' && !document.querySelector('.app')!.hasAttribute('inert')) {
        event.preventDefault(); this.back()
      }
    })
    this.screens.onChange(name => {
      if (name !== 'profile' && history.state?.chromaProfile) history.replaceState({ ...history.state, chromaProfile: false }, '')
    })
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

    // Character editing has its own screen; this page keeps the things
    // that are about the account rather than about the character.
    el('profile-edit').addEventListener('click', () => {
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

  open(push = true): void {
    if (this.screens.active === 'profile') return
    this.destination = this.screens.active
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    this.returning = false
    this.nameInput.value = this.storedName()
    this.refresh()
    if (push) history.pushState({ ...history.state, chromaProfile: true }, '')
    this.screens.show('profile')
    el('sheet-profile').scrollTop = 0
    el('sheet-profile-title').focus({ preventScroll: true })
  }

  private back(): void {
    if (this.returning) return
    if (history.state?.chromaProfile) { this.returning = true; history.back() }
    else this.restore()
  }

  private restore(): void {
    this.screens.show(this.destination)
    if (this.opener?.getClientRects().length) this.opener.focus({ preventScroll: true })
  }

  /** Repaints the cached face after the creator changed it. */
  refresh(): void {
    this.growth.refresh()
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
