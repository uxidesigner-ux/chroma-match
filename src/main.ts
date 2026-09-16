import './style.css'
import { Sfx } from './audio.ts'
import { Haptics } from './haptics.ts'
import { Game, movesForLevel, targetForLevel } from './game/game.ts'
import type { GameHooks } from './game/game.ts'
import { randomSeed } from './game/rng.ts'
import { recordOf } from './game/replay.ts'
import { BOARD } from './game/types.ts'
import { attachInput } from './input.ts'
import { openLeaderboard } from './leaderboard/index.ts'
import { LocalLeaderboard } from './leaderboard/local.ts'
import { cleanName } from './leaderboard/types.ts'
import type { Leaderboard } from './leaderboard/types.ts'
import { Effects } from './render/particles.ts'
import { Renderer } from './render/renderer.ts'
import { styleFor } from './render/theme.ts'
import { HomeScreen } from './ui/home.ts'
import { Hud } from './ui/hud.ts'
import { Overlay } from './ui/overlay.ts'
import type { OverlayContent } from './ui/overlay.ts'
import { Screens } from './ui/screens.ts'

const BEST_KEY = 'chroma-match:best'
const NAME_KEY = 'chroma-match:name'

const canvas = document.getElementById('board')
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #board canvas')

// The board's proportions live in one place. CSS sizes the box the canvas
// fills, so it is told the ratio rather than having it duplicated.
const root = document.documentElement
root.style.setProperty('--board-aspect', `${BOARD.cols} / ${BOARD.rows}`)
root.style.setProperty('--board-ratio', String(BOARD.cols / BOARD.rows))

const renderer = new Renderer(canvas, BOARD)
const effects = new Effects()
const sfx = new Sfx()
const haptics = new Haptics()
const hud = new Hud()
const overlay = new Overlay()
const screens = new Screens()

/**
 * The local board is used immediately so the launch screen has something to
 * draw, then the shared one takes over if it connects. Nothing above the
 * interface changes either way, and a run is verified by replay in both.
 */
let leaderboard: Leaderboard = new LocalLeaderboard()
const home = new HomeScreen(leaderboard)

void openLeaderboard().then((board) => {
  if (board === leaderboard) return
  leaderboard = board
  home.setBoard(board)
  void home.refresh()
})

// ---- persistence ----------------------------------------------------------

function readStored(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return '' // private browsing, or storage disabled — the game still plays
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* nothing to do; it simply won't persist */
  }
}

/** The best score of any *finished* run, kept between visits. */
let record = Number(readStored(BEST_KEY)) || 0

function commitRecord(): boolean {
  if (game.score <= record) return false
  record = game.score
  writeStored(BEST_KEY, String(record))
  return true
}

/** A run already ahead of the record shows its own score, never a stale one. */
function displayBest(): number {
  return Math.max(record, game.score)
}

/** A `?seed=` in the URL replays an exact board, which makes bugs reproducible. */
function seedFromUrl(): number | null {
  const raw = new URLSearchParams(location.search).get('seed')
  if (!raw) return null
  const parsed = Number.parseInt(raw, 36)
  return Number.isFinite(parsed) ? parsed >>> 0 : null
}

// ---- game -----------------------------------------------------------------

const hooks: Partial<GameHooks> = {
  onClear(cells, kind, combo, points) {
    sfx.clear(combo)
    haptics.clear(combo)
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
    effects.float(
      cx,
      cy,
      `+${points}`,
      combo > 1 ? '#FFD782' : '#FFFFFF',
      1 + Math.min(combo, 5) * 0.07,
    )
    if (combo > 1) {
      effects.float(cx, cy - renderer.cellSize * 0.6, `${combo}× chain`, styleFor(kind).light, 0.78)
    }
  },
  onPowerCreated() {
    sfx.power()
    haptics.power()
  },
  onSwapAccepted() {
    sfx.swap()
    haptics.swap()
  },
  onInvalidSwap() {
    sfx.reject()
    haptics.reject()
  },
  onShuffle() {
    sfx.shuffle()
  },
  onLevelComplete(level) {
    sfx.levelUp()
    haptics.levelUp()
    overlay.show({
      kicker: 'Cleared',
      title: `Level ${level} complete`,
      body: `${game.score.toLocaleString()} points banked. Level ${level + 1} asks for ${targetForLevel(
        level + 1,
      ).toLocaleString()} more in ${movesForLevel(level + 1)} moves.`,
      action: 'Next level',
      onAction: () => game.nextLevel(),
    })
  },
  onGameOver(score) {
    sfx.gameOver()
    haptics.gameOver()
    const previous = record
    const isRecord = commitRecord()
    const run = recordOf(game)

    const content: OverlayContent = {
      kicker: 'Out of moves',
      title: 'Run over',
      body: isRecord
        ? `${score.toLocaleString()} points, level ${game.level} — a new personal best.`
        : `${score.toLocaleString()} points, level ${game.level}. Your best is still ${previous.toLocaleString()}.`,
      action: 'Play again',
      onAction: () => startRun(),
      secondary: { label: 'Back to home', onAction: () => goHome() },
    }

    // A run with no accepted swaps has nothing to verify, so nothing to post.
    if (run.moves.length > 0) {
      content.post = {
        initialName: readStored(NAME_KEY),
        onSubmit: async (name) => {
          const clean = cleanName(name)
          writeStored(NAME_KEY, clean)
          const result = await leaderboard.submit(run, clean)
          if (!result.accepted) {
            return { ok: false, message: result.reason ?? 'That run was not accepted.' }
          }
          void home.refresh()
          return {
            ok: true,
            message: result.rank
              ? `Posted — #${result.rank} with ${result.score.toLocaleString()}.`
              : `Posted ${result.score.toLocaleString()}.`,
          }
        },
      }
    }

    overlay.show(content)
  },
}

const game = new Game(hooks, seedFromUrl() ?? randomSeed())

attachInput(canvas, game, renderer, () => sfx.unlock())

// ---- navigation -----------------------------------------------------------

function startRun(): void {
  effects.clear()
  overlay.hide()
  game.restart(randomSeed())
  screens.show('game')
  renderer.resize()
}

function goHome(): void {
  commitRecord()
  effects.clear()
  overlay.hide()
  screens.show('home')
  void home.refresh()
}

screens.onChange((name) => {
  // The canvas is zero-sized while the screen is hidden, so it has to be
  // re-measured on the way back in rather than waiting for a resize event.
  if (name === 'game') renderer.resize()
})

document.getElementById('start-game')?.addEventListener('click', () => {
  sfx.unlock()
  startRun()
})
document.getElementById('quit-game')?.addEventListener('click', () => goHome())

document.getElementById('rotate-dismiss')?.addEventListener('click', () => {
  document.querySelector('.app')?.classList.add('ignore-rotate')
  renderer.resize()
})

// ---- controls shared by both screens --------------------------------------

const soundButtons = document.querySelectorAll<HTMLButtonElement>('[data-action="sound"]')
for (const button of soundButtons) {
  button.addEventListener('click', () => {
    sfx.unlock()
    sfx.enabled = !sfx.enabled
    // One control for both: a buzz with no sound reads as a fault, not a reward.
    haptics.enabled = sfx.enabled
    for (const other of soundButtons) {
      other.setAttribute('aria-pressed', String(sfx.enabled))
      const label = other.querySelector('.sound-label')
      if (label) label.textContent = sfx.enabled ? 'Sound on' : 'Sound off'
    }
  })
}

const help = document.getElementById('help')
const helpButtons = document.querySelectorAll<HTMLButtonElement>('[data-action="how-to"]')
for (const button of helpButtons) {
  button.addEventListener('click', () => {
    if (!help) return
    const opening = help.hidden
    help.hidden = !opening
    for (const other of helpButtons) other.setAttribute('aria-expanded', String(opening))
    renderer.resize()
  })
}

// ---- loop -----------------------------------------------------------------

const observer = new ResizeObserver(() => renderer.resize())
observer.observe(canvas)
window.addEventListener('orientationchange', () => renderer.resize())
window.addEventListener('pagehide', () => commitRecord())

if (import.meta.env.DEV) {
  // Handy from the console while tuning: `chroma.game.grid`, `chroma.game.hint`.
  Object.assign(window, { chroma: { game, renderer, effects, sfx, screens, leaderboard } })
}

// Offline play is a bonus, so a registration that is refused (private mode,
// an insecure origin, a browser without service workers) must stay silent.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}

let previous = performance.now()
let time = 0

function frame(now: number): void {
  // Clamped so a backgrounded tab does not resolve the whole board on return.
  const dt = Math.min(0.05, (now - previous) / 1000)
  previous = now

  if (screens.active === 'game') {
    time += dt
    game.update(dt)
    effects.update(dt)
    renderer.draw(game, effects, time)
    hud.update(game, displayBest())
  }

  requestAnimationFrame(frame)
}

void home.refresh()
requestAnimationFrame(frame)
