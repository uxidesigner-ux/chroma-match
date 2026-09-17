import { checkEntries } from '../leaderboard/verify.ts'
import type { EntryCheck, Leaderboard, LeaderboardEntry } from '../leaderboard/types.ts'

const SHOWN = 20

export type BoardMode = 'everyone' | 'friends'

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}

/** The launch screen: personal standing, and the board itself. */
export class HomeScreen {
  private best = el('home-best')
  private rank = el('home-rank')
  private note = el('ranks-note')
  private list = el<HTMLOListElement>('ranks-list')

  private rows = new Map<string, HTMLLIElement>()
  /** Bumped on every refresh so a slow verification pass can tell it is stale. */
  private generation = 0

  /** Which of the two boards is showing. */
  private mode: BoardMode = 'everyone'
  /** Supplies the friends board. Left null until the social panel is built. */
  private friends: (() => Promise<{ entries: LeaderboardEntry[]; label: string }>) | null = null
  private onMode: ((mode: BoardMode) => void) | null = null

  constructor(private board: Leaderboard) {
    for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-board]')) {
      tab.addEventListener('click', () => {
        const next = tab.dataset.board === 'friends' ? 'friends' : 'everyone'
        if (next === this.mode) return
        this.setMode(next)
        void this.refresh()
      })
    }
  }

  /** Where the friends tab gets its rows. */
  setFriends(source: () => Promise<{ entries: LeaderboardEntry[]; label: string }>): void {
    this.friends = source
  }

  /** Told on every tab change, so the friends tools can show and hide. */
  onModeChange(listener: (mode: BoardMode) => void): void {
    this.onMode = listener
    listener(this.mode)
  }

  setMode(mode: BoardMode): void {
    this.mode = mode
    for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-board]')) {
      const on = (tab.dataset.board ?? 'everyone') === mode
      tab.classList.toggle('is-on', on)
      tab.setAttribute('aria-selected', String(on))
    }
    this.onMode?.(mode)
  }

  /** Swaps in a different backend, e.g. once the shared board has connected. */
  setBoard(board: Leaderboard): void {
    this.board = board
  }

  async refresh(): Promise<void> {
    const generation = ++this.generation
    this.note.textContent = this.mode === 'friends' ? 'Loading…' : this.board.label

    let entries: LeaderboardEntry[]
    let mine: LeaderboardEntry | null
    try {
      if (this.mode === 'friends') {
        // The friends board is already the player's own rows plus their
        // friends', so "mine" comes out of it rather than from a second query.
        const friends = (await this.friends?.()) ?? { entries: [], label: 'Friends unavailable' }
        if (generation !== this.generation) return
        entries = friends.entries
        mine = entries.find((entry) => entry.mine) ?? null
        this.note.textContent = friends.label
      } else {
        ;[entries, mine] = await Promise.all([this.board.top(SHOWN), this.board.best()])
        this.note.textContent = this.board.label
      }
    } catch {
      // A board that will not load must not block the Play button.
      this.note.textContent = 'Leaderboard unavailable'
      this.renderList([])
      return
    }
    if (generation !== this.generation) return

    this.renderList(entries)
    this.best.textContent = mine ? mine.score.toLocaleString() : '0'
    const position = mine ? entries.findIndex((e) => e.id === mine.id) + 1 : 0
    this.rank.textContent = position > 0 ? `#${position}` : '—'

    // The rows are already on screen; the verdicts arrive behind them.
    void checkEntries(entries, (entry, check) => {
      if (generation === this.generation) this.applyCheck(entry, check)
    })
  }

  /**
   * A row that fails its replay is removed outright rather than marked.
   *
   * Nothing on the server can stop a fabricated score being written, so the
   * only place it can be caught is here — and a forged row left visible with a
   * warning badge still occupies the top of the board, which is the whole
   * prize. A row that simply has no run attached keeps its place unmarked;
   * that is missing data, not evidence.
   */
  private applyCheck(entry: LeaderboardEntry, check: EntryCheck): void {
    const row = this.rows.get(entry.id)
    if (!row) return

    if (check === 'failed') {
      row.remove()
      this.rows.delete(entry.id)
      this.renumber()
      return
    }
    if (check === 'ok') {
      const badge = row.querySelector('.rank-check')
      if (badge) {
        badge.textContent = '✓'
        badge.setAttribute('title', 'Your browser replayed this run and it checks out')
        badge.classList.add('is-ok')
      }
    }
  }

  private renumber(): void {
    let position = 1
    for (const row of this.list.querySelectorAll<HTMLLIElement>('.rank')) {
      const pos = row.querySelector('.rank-pos')
      if (pos) pos.textContent = String(position++)
    }
    if (this.rows.size === 0) this.renderEmpty()
  }

  private renderEmpty(): void {
    const empty = document.createElement('li')
    empty.className = 'ranks-empty'
    // The two tabs are empty for completely different reasons, and one piece of
    // copy for both would tell the player to do the wrong thing on one of them.
    empty.textContent =
      this.mode === 'friends'
        ? 'Nobody here yet. Share your code, or add a friend’s.'
        : 'No runs yet. Play one and it lands here.'
    this.list.replaceChildren(empty)
  }

  private renderList(entries: LeaderboardEntry[]): void {
    this.list.replaceChildren()
    this.rows.clear()
    if (entries.length === 0) {
      this.renderEmpty()
      return
    }

    entries.forEach((entry, index) => {
      const row = document.createElement('li')
      row.className = entry.mine ? 'rank rank-mine' : 'rank'

      const pos = document.createElement('span')
      pos.className = 'rank-pos'
      pos.textContent = String(index + 1)

      // textContent throughout: names come from other people.
      const name = document.createElement('span')
      name.className = 'rank-name'
      name.textContent = entry.name

      const check = document.createElement('span')
      check.className = 'rank-check'

      const score = document.createElement('span')
      score.className = 'rank-score'
      score.textContent = entry.score.toLocaleString()
      const level = document.createElement('span')
      level.className = 'rank-level'
      level.textContent = `L${entry.level}`
      score.append(level)

      row.append(pos, name, check, score)
      this.list.append(row)
      this.rows.set(entry.id, row)
    })
  }
}
