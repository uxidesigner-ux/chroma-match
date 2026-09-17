import { account, onAccount, signInWithGoogle, signOutToAnonymous } from '../leaderboard/session.ts'
import type { Account } from '../leaderboard/session.ts'
import { codeFor } from '../social/code.ts'
import { publishProfile } from '../social/players.ts'
import { cleanName } from '../leaderboard/types.ts'

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}

/**
 * The row that says who is playing.
 *
 * A guest is a complete player: they can post a score, earn coins, keep a
 * streak and finish every mission without this row ever doing anything. So it
 * is written as an offer rather than a gate — what signing in buys is a name on
 * the board that is yours on every device, and friends, and nothing else is
 * withheld to make the offer look better.
 */
export class AccountBar {
  private face = el('account-face')
  private name = el('account-name')
  private sub = el('account-sub')
  private action = el<HTMLButtonElement>('account-action')
  private listeners: Array<(account: Account | null) => void> = []
  private busy = false

  constructor(private storedName: () => string) {
    this.action.addEventListener('click', () => void this.toggle())
    onAccount((current) => {
      this.paint(current)
      for (const listener of this.listeners) listener(current)
    })
  }

  onChange(listener: (account: Account | null) => void): void {
    this.listeners.push(listener)
    listener(account())
  }

  private async toggle(): Promise<void> {
    if (this.busy) return
    this.busy = true
    const current = account()
    this.action.disabled = true
    this.action.textContent = current?.kind === 'google' ? 'Signing out…' : 'Signing in…'

    try {
      if (current?.kind === 'google') {
        await signOutToAnonymous()
      } else {
        const result = await signInWithGoogle()
        if (result.ok) {
          // The profile is written straight away, because a friend code that
          // nobody can look up is not a friend code. The name is whatever the
          // player has been posting under, falling back to Google's.
          const signed = account()
          await publishProfile(
            cleanName(this.storedName()) || cleanName(signed?.name ?? '') || 'Anonymous',
            signed?.photo ?? '',
          )
          if (result.switched) {
            this.sub.textContent = 'Signed in. This device’s guest runs stayed with the guest.'
          }
        } else if (result.reason) {
          this.sub.textContent = result.reason
        }
      }
    } catch {
      this.sub.textContent = 'That did not go through. Try again in a moment.'
    } finally {
      this.busy = false
      this.action.disabled = false
      this.paint(account(), { keepSub: true })
    }
  }

  /** Repaints from the account, optionally leaving a message already in place. */
  paint(current: Account | null, options: { keepSub?: boolean } = {}): void {
    const signedIn = current?.kind === 'google'
    this.action.textContent = signedIn ? 'Sign out' : 'Sign in'
    this.face.textContent = signedIn ? (current.name.trim()[0] ?? '·').toUpperCase() : '·'
    this.face.classList.toggle('is-on', signedIn)

    if (signedIn) {
      this.name.textContent = cleanName(this.storedName()) || cleanName(current.name) || 'Signed in'
      if (!options.keepSub) this.sub.textContent = `Friend code ${codeFor(current.uid)}`
      return
    }
    this.name.textContent = 'Playing as a guest'
    if (!options.keepSub) {
      this.sub.textContent = current
        ? 'Sign in to keep your runs and add friends'
        : 'Offline — scores are staying on this device'
    }
  }
}
