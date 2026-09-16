import type { Leaderboard, LeaderboardEntry } from '../leaderboard/types.ts'

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

  constructor(private board: Leaderboard) {
    this.note.textContent = board.label
  }

  async refresh(): Promise<void> {
    this.note.textContent = this.board.label
    try {
      const [entries, mine] = await Promise.all([this.board.top(SHOWN), this.board.best()])
      this.renderList(entries)
      this.best.textContent = mine ? mine.score.toLocaleString() : '0'
      const position = mine ? entries.findIndex((e) => e.id === mine.id) + 1 : 0
      this.rank.textContent = position > 0 ? `#${position}` : '—'
    } catch {
      // A leaderboard that will not load must not block the Play button.
      this.note.textContent = 'Leaderboard unavailable'
      this.renderList([])
    }
  }

  private renderList(entries: LeaderboardEntry[]): void {
    this.list.replaceChildren()
    if (entries.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'ranks-empty'
      empty.textContent = 'No runs yet. Play one and it lands here.'
      this.list.append(empty)
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

      const score = document.createElement('span')
      score.className = 'rank-score'
      score.textContent = entry.score.toLocaleString()
      const level = document.createElement('span')
      level.className = 'rank-level'
      level.textContent = `L${entry.level}`
      score.append(level)

      row.append(pos, name, score)
      this.list.append(row)
    })
  }
}
