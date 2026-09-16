import './style.css'
import { Sfx } from './audio.ts'
import { Game, MOVES_PER_LEVEL, targetForLevel } from './game/game.ts'
import type { GameHooks } from './game/game.ts'
import { randomSeed } from './game/rng.ts'
import { Effects } from './render/particles.ts'
import { Renderer } from './render/renderer.ts'
import { styleFor } from './render/theme.ts'
import { attachInput } from './input.ts'
import { Hud } from './ui/hud.ts'

const BEST_KEY = 'chroma-match:best'

const canvas = document.getElementById('board')
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #board canvas')

const renderer = new Renderer(canvas)
const effects = new Effects()
const sfx = new Sfx()
const hud = new Hud()

/** The best score of any *finished* run, persisted between visits. */
let record = readBest()

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    return 0 // private browsing, or storage disabled — the game still plays fine
  }
}

function saveBest(value: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(value))
  } catch {
    /* nothing to do; the score simply won't persist */
  }
}

/** A `?seed=` in the URL replays an exact board, which makes bugs reproducible. */
function seedFromUrl(): number | null {
  const raw = new URLSearchParams(location.search).get('seed')
  if (!raw) return null
  const parsed = Number.parseInt(raw, 36)
  return Number.isFinite(parsed) ? parsed >>> 0 : null
}

const hooks: Partial<GameHooks> = {
  onClear(cells, kind, combo, points) {
    sfx.clear(combo)
    let sx = 0
    let sy = 0
    const perGem = cells.length > 14 ? 5 : 9
    for (const cell of cells) {
      const { x, y } = renderer.centreOf(cell)
      const gem = game.grid[cell]
      effects.burst(x, y, styleFor(gem?.kind ?? kind).base, perGem)
      sx += x
      sy += y
    }
    const cx = sx / cells.length
    const cy = sy / cells.length
    effects.float(cx, cy, `+${points}`, combo > 1 ? '#FFD782' : '#FFFFFF', 1 + Math.min(combo, 5) * 0.07)
    if (combo > 1) {
      effects.float(cx, cy - renderer.cellSize * 0.6, `${combo}× chain`, styleFor(kind).light, 0.78)
    }
  },
  onPowerCreated() {
    sfx.power()
  },
  onSwapAccepted() {
    sfx.swap()
  },
  onInvalidSwap() {
    sfx.reject()
  },
  onShuffle() {
    sfx.shuffle()
  },
  onLevelComplete(level) {
    sfx.levelUp()
    hud.showOverlay({
      kicker: 'Cleared',
      title: `Level ${level} complete`,
      body: `${game.score.toLocaleString()} points banked. Level ${level + 1} asks for ${targetForLevel(
        level + 1,
      ).toLocaleString()} more in ${MOVES_PER_LEVEL} moves.`,
      action: 'Next level',
      onAction: () => game.nextLevel(),
    })
  },
  onGameOver(score) {
    sfx.gameOver()
    const previous = record
    const isRecord = commitRecord()
    hud.showOverlay({
      kicker: 'Out of moves',
      title: 'Run over',
      body: isRecord
        ? `${score.toLocaleString()} points, level ${game.level} — a new personal best.`
        : `${score.toLocaleString()} points, level ${game.level}. Your best is still ${previous.toLocaleString()}.`,
      action: 'Play again',
      onAction: () => {
        effects.clear()
        game.restart(randomSeed())
      },
    })
  },
}

const game = new Game(hooks, seedFromUrl() ?? randomSeed())

/** Banks the current run if it beat the stored record. */
function commitRecord(): boolean {
  if (game.score <= record) return false
  record = game.score
  saveBest(record)
  return true
}

/**
 * What the HUD shows: a run that is already ahead of the record displays its own
 * score, so the number never looks stale mid-run.
 */
function displayBest(): number {
  return Math.max(record, game.score)
}

attachInput(canvas, game, renderer, () => sfx.unlock())

document.getElementById('new-game')?.addEventListener('click', () => {
  sfx.unlock()
  commitRecord()
  effects.clear()
  hud.hideOverlay()
  game.restart(randomSeed())
})

const soundToggle = document.getElementById('sound-toggle')
soundToggle?.addEventListener('click', () => {
  sfx.unlock()
  sfx.enabled = !sfx.enabled
  soundToggle.setAttribute('aria-pressed', String(sfx.enabled))
  const label = document.getElementById('sound-label')
  if (label) label.textContent = sfx.enabled ? 'Sound on' : 'Sound off'
})

const howTo = document.getElementById('how-to')
const help = document.getElementById('help')
howTo?.addEventListener('click', () => {
  if (!help) return
  const open = help.hidden
  help.hidden = !open
  howTo.setAttribute('aria-expanded', String(open))
})

const observer = new ResizeObserver(() => renderer.resize())
observer.observe(canvas)
window.addEventListener('orientationchange', () => renderer.resize())
window.addEventListener('pagehide', () => commitRecord())

if (import.meta.env.DEV) {
  // Handy from the console while tuning: `chroma.game.grid`, `chroma.game.hint`.
  Object.assign(window, { chroma: { game, renderer, effects, sfx } })
}

let previous = performance.now()
let time = 0

function frame(now: number): void {
  // Clamped so a backgrounded tab does not resolve the whole board on return.
  const dt = Math.min(0.05, (now - previous) / 1000)
  previous = now
  time += dt

  game.update(dt)
  effects.update(dt)
  renderer.draw(game, effects, time)
  hud.update(game, displayBest())

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
