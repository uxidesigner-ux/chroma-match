import { checkEntries } from '../leaderboard/verify.ts'
import type { EntryCheck, Leaderboard, LeaderboardEntry } from '../leaderboard/types.ts'

const SHOWN = 20

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

  constructor(private board: Leaderboard) {}

  /** Swaps in a different backend, e.g. once the shared board has connected. */
  setBoard(board: Leaderboard): void {
    this.board = board
  }

  async refresh(): Promise<void> {
    const generation = ++this.generation
    this.note.textContent = this.board.label

    let entries: LeaderboardEntry[]
    let mine: LeaderboardEntry | null
    try {
      ;[entries, mine] = await Promise.all([this.board.top(SHOWN), this.board.best()])
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
    empty.textContent = 'No runs yet. Play one and it lands here.'
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
