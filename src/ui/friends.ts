import { account, onAccount } from '../leaderboard/session.ts'
import { codeFor } from '../social/code.ts'
import { addFriendByCode, boardFrom, friendUids, playersByUid } from '../social/players.ts'
import type { LeaderboardEntry } from '../leaderboard/types.ts'

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}

export interface FriendsBoard {
  entries: LeaderboardEntry[]
  label: string
}

/**
 * The friends tab: your code, a box to take one in, and the board behind it.
 *
 * The code is derived from the account rather than stored, so it appears the
 * instant somebody signs in — there is no window where the row is on screen
 * saying "—" while a write lands. A guest sees the tools disabled with the
 * reason on them, because a friend code for an anonymous account that will be
 * replaced on the next device is worse than no friend code.
 */
export class FriendsPanel {
  private tools = el('friends-tools')
  private chip = el<HTMLButtonElement>('my-code')
  private code = el('my-code-value')
  private form = el<HTMLFormElement>('friend-add')
  private input = el<HTMLInputElement>('friend-code')
  private submit = el<HTMLButtonElement>('friend-submit')
  private status = el('friend-status')
  private listeners: Array<() => void> = []

  constructor() {
    this.form.addEventListener('submit', (event) => {
      event.preventDefault()
      void this.add()
    })
    this.chip.addEventListener('click', () => void this.share())
    onAccount(() => this.paint())
  }

  /** Fires when the friends list changed, so the board can be re-read. */
  onChange(listener: () => void): void {
    this.listeners.push(listener)
  }

  setVisible(visible: boolean): void {
    this.tools.hidden = !visible
    if (visible) this.paint()
  }

  private paint(): void {
    const current = account()
    const signedIn = current?.kind === 'google'
    this.code.textContent = signedIn ? codeFor(current.uid) : '———'
    this.chip.disabled = !signedIn
    this.input.disabled = !signedIn
    this.submit.disabled = !signedIn
    if (!signedIn) this.setStatus('Sign in to get a code and add friends.', null)
  }

  private setStatus(text: string, tone: 'is-ok' | 'is-error' | null): void {
    this.status.textContent = text
    this.status.classList.remove('is-ok', 'is-error')
    if (tone) this.status.classList.add(tone)
  }

  /**
   * Hands the code over however the device can.
   *
   * The share sheet first, because on a phone the next step is almost always a
   * messaging app; the clipboard as the fallback, and the chip says which one
   * happened so a silent copy is not mistaken for a dead button.
   */
  private async share(): Promise<void> {
    const current = account()
    if (current?.kind !== 'google') return
    const code = codeFor(current.uid)
    const text = `Add me on Chroma Match — my friend code is ${code}`

    try {
      if (navigator.share) {
        await navigator.share({ text, url: location.href })
        return
      }
      await navigator.clipboard.writeText(code)
      this.setStatus(`${code} copied.`, 'is-ok')
    } catch {
      // A cancelled share sheet lands here too, which is why this says nothing
      // about failure — it just leaves the code on screen to be read off.
      this.setStatus(`Your code is ${code}.`, null)
    }
  }

  private async add(): Promise<void> {
    const typed = this.input.value
    if (!typed.trim()) return
    this.submit.disabled = true
    this.setStatus('Looking…', null)
    try {
      const result = await addFriendByCode(typed)
      if (!result.ok) {
        this.setStatus(result.reason ?? 'That did not work.', 'is-error')
        return
      }
      this.input.value = ''
      this.setStatus(`${result.player?.name ?? 'Added'} is on your board.`, 'is-ok')
      for (const listener of this.listeners) listener()
    } catch {
      this.setStatus('Could not reach the server.', 'is-error')
    } finally {
      this.submit.disabled = account()?.kind !== 'google'
    }
  }

  /**
   * The friends board: the player and everyone they follow, best run each.
   *
   * One read for the whole board. Rows arrive carrying their seed and move
   * list, and the caller replays them before believing them — a friend's number
   * gets checked the same way a stranger's does, which is the only reason it is
   * worth putting on a screen next to your own.
   */
  async board(): Promise<FriendsBoard> {
    const current = account()
    if (!current) return { entries: [], label: 'Offline' }
    if (current.kind !== 'google') {
      return { entries: [], label: 'Sign in to compare with friends' }
    }
    try {
      const friends = await friendUids()
      const players = await playersByUid([current.uid, ...friends])
      const count = friends.length
      return {
        entries: boardFrom(players, current.uid),
        label: count === 0 ? 'Just you so far' : `You and ${count} friend${count === 1 ? '' : 's'}`,
      }
    } catch {
      return { entries: [], label: 'Friends unavailable' }
    }
  }
}
