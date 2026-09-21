import type { Game } from '../game/game.ts'
import { goalLabel } from '../game/goals.ts'
import { n, t } from '../i18n/index.ts'
import { gemColour, gemName } from '../i18n/gems.ts'

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

  /**
   * Throws away the diff, so the next update rewrites every readout.
   *
   * The HUD deliberately writes nothing on a frame where no value moved, which
   * means a language change on a paused board would leave "Level 3" in English
   * until the level itself changed. Clearing the cache is the whole fix: the
   * next frame repaints because everything now differs from nothing.
   */
  invalidate(): void {
    this.last = { score: -1, moves: -1, best: -1, level: -1, progress: -1, target: -1, seed: '', what: '' }
  }

  update(game: Game, best: number): void {
    const l = this.last
    if (game.score !== l.score) {
      this.score.textContent = n(game.score)
      l.score = game.score
    }
    if (game.moves !== l.moves) {
      this.moves.textContent = String(game.moves)
      this.movesStat.classList.toggle('urgent', game.moves <= 5)
      l.moves = game.moves
    }
    if (best !== l.best) {
      this.best.textContent = n(best)
      l.best = best
    }
    if (game.level !== l.level) {
      this.level.textContent = t('levelN', { level: game.level })
      l.level = game.level
    }
    // Both read from the goal rather than from the score: a colour level is
    // measured in gems, and a bar that filled with points on one would be
    // reporting the wrong race.
    if (game.need !== l.target) {
      this.target.textContent = n(game.need)
      l.target = game.need
    }
    // The words come from the interface strings, the colour name from the
    // skin or its hue. The rules module supplies neither: what a level asks
    // for does not depend on what language it is being read in.
    const what = goalLabel(game.goal, gemName, {
      score: t('goalScore'),
      power: t('goalPower'),
      gems: (colour) => t('goalGems', { colour }),
    })
    if (what !== l.what) {
      this.what.textContent = what
      const colour = game.goal.kind === 'colour' ? gemColour(game.goal.colour) : null
      this.gem.hidden = colour === null
      if (colour) this.gem.style.background = colour
      l.what = what
    }
    const progress = Math.min(game.progress, game.need)
    if (progress !== l.progress) {
      this.progress.textContent = n(progress)
      this.bar.style.width = `${Math.min(100, (progress / game.need) * 100)}%`
      l.progress = progress
    }
    const seed = `${game.seed.toString(36).toUpperCase()} · ${t(game.rules === 1 ? 'legacyRules' : 'fusionRules')}`
    if (seed !== l.seed) {
      this.seed.textContent = `seed ${seed}`
      l.seed = seed
    }
  }
}
