import type { Game } from '../game/game.ts'

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}

export interface OverlayContent {
  kicker: string
  title: string
  body: string
  action: string
  onAction: () => void
}

/**
 * Owns every DOM node outside the canvas. Values are diffed before they are
 * written so the HUD does not touch the document on frames where nothing moved.
 */
export class Hud {
  private score = el('score')
  private moves = el('moves')
  private movesStat = el('moves').closest('.stat') as HTMLElement
  private best = el('best')
  private level = el('level')
  private progress = el('progress')
  private target = el('target')
  private bar = el('bar')
  private seed = el('seed')

  private overlay = el('overlay')
  private overlayKicker = el('overlay-kicker')
  private overlayTitle = el('overlay-title')
  private overlayBody = el('overlay-body')
  private overlayAction = el<HTMLButtonElement>('overlay-action')
  private pendingAction: (() => void) | null = null

  private last = { score: -1, moves: -1, best: -1, level: -1, progress: -1, target: -1, seed: '' }

  constructor() {
    this.overlayAction.addEventListener('click', () => {
      const run = this.pendingAction
      this.hideOverlay()
      run?.()
    })
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
    if (game.target !== l.target) {
      this.target.textContent = game.target.toLocaleString()
      l.target = game.target
    }
    const progress = Math.min(game.progress, game.target)
    if (progress !== l.progress) {
      this.progress.textContent = progress.toLocaleString()
      this.bar.style.width = `${Math.min(100, (progress / game.target) * 100)}%`
      l.progress = progress
    }
    const seed = game.seed.toString(36).toUpperCase()
    if (seed !== l.seed) {
      this.seed.textContent = `seed ${seed}`
      l.seed = seed
    }
  }

  showOverlay(content: OverlayContent): void {
    this.overlayKicker.textContent = content.kicker
    this.overlayTitle.textContent = content.title
    this.overlayBody.textContent = content.body
    this.overlayAction.textContent = content.action
    this.pendingAction = content.onAction
    this.overlay.hidden = false
    this.overlayAction.focus()
  }

  hideOverlay(): void {
    this.overlay.hidden = true
    this.pendingAction = null
  }
}
