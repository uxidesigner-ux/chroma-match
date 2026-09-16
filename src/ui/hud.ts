import type { Game } from '../game/game.ts'
import { goalLabel } from '../game/goals.ts'
import { styleFor } from '../render/theme.ts'

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}

/**
 * The readouts above the board. Values are diffed before they are written so
 * the HUD does not touch the document on frames where nothing moved. The
 * end-of-level dialog is a separate concern and lives in overlay.ts.
 */
export class Hud {
  private score = el('score')
  private moves = el('moves')
  private movesStat = el('moves').closest('.stat') as HTMLElement
  private best = el('best')
  private level = el('level')
  private what = el('goal-text')
  private gem = el('goal-gem')
  private progress = el('progress')
  private target = el('target')
  private bar = el('bar')
  private seed = el('seed')

  private last = {
    score: -1,
    moves: -1,
    best: -1,
    level: -1,
    progress: -1,
    target: -1,
    seed: '',
    what: '',
  }

  update(game: Game, best: number): void {
    const l = this.last
    if (game.score !== l.score) {
      this.score.textContent = game.score.toLocaleString()
      l.score = game.score
    }
    if (game.moves !== l.moves) {
      this.moves.textContent = String(game.moves)
      this.movesStat.classList.toggle('urgent', game.moves <= 5)
      l.moves = game.moves
    }
    if (best !== l.best) {
      this.best.textContent = best.toLocaleString()
      l.best = best
    }
    if (game.level !== l.level) {
      this.level.textContent = `Level ${game.level}`
      l.level = game.level
    }
    // Both read from the goal rather than from the score: a colour level is
    // measured in gems, and a bar that filled with points on one would be
    // reporting the wrong race.
    if (game.need !== l.target) {
      this.target.textContent = game.need.toLocaleString()
      l.target = game.need
    }
    // The colour's name comes from the skin, so it matches the gems on screen —
    // the same kind is "Mint" under Jewel and "Jade" under Glass.
    const what = goalLabel(game.goal, (colour) => styleFor(colour).name)
    if (what !== l.what) {
      this.what.textContent = what
      const colour = game.goal.kind === 'colour' ? styleFor(game.goal.colour).base : null
      this.gem.hidden = colour === null
      if (colour) this.gem.style.background = colour
      l.what = what
    }
    const progress = Math.min(game.progress, game.need)
    if (progress !== l.progress) {
      this.progress.textContent = progress.toLocaleString()
      this.bar.style.width = `${Math.min(100, (progress / game.need) * 100)}%`
      l.progress = progress
    }
    const seed = game.seed.toString(36).toUpperCase()
    if (seed !== l.seed) {
      this.seed.textContent = `seed ${seed}`
      l.seed = seed
    }
  }
}
