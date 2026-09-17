import './style.css'
import { Sfx } from './audio.ts'
import { Haptics } from './haptics.ts'
import { Game, movesForLevel } from './game/game.ts'
import type { GameHooks } from './game/game.ts'
import { randomSeed } from './game/rng.ts'
import { recordOf, restoreRun } from './game/replay.ts'
import { goalForLevel } from './game/goals.ts'
import { itemForLevel } from './game/items.ts'
import type { Item } from './game/items.ts'
import { BOARD } from './game/types.ts'
import { findMoves } from './game/board.ts'
import { bestMove } from './game/autoplay.ts'
import { attachInput } from './input.ts'
import { openLeaderboard } from './leaderboard/index.ts'
import { LocalLeaderboard } from './leaderboard/local.ts'
import { cleanName } from './leaderboard/types.ts'
import type { Leaderboard } from './leaderboard/types.ts'
import { Effects } from './render/particles.ts'
import { Renderer } from './render/renderer.ts'
import { activeSkin, initSkin, nextSkin, onSkinChange, setSkin } from './render/skins/index.ts'
import { contrastingShade, styleFor } from './render/theme.ts'
import {
  BOOSTER_LIMIT,
  coins,
  grantStarterKit,
  hasUsedItem,
  markItemUsed,
  payoutFor,
  setCoins,
  spendBoosters,
} from './meta.ts'
import { clearSuspended, suspendRun, suspendedRun } from './suspend.ts'
import { ComboMeter } from './ui/combo.ts'
import { Loadout } from './ui/loadout.ts'
import { PauseSheet } from './ui/pause.ts'
import { Shop } from './ui/shop.ts'
import { ItemTray } from './ui/items.ts'
import { AccountBar } from './ui/account.ts'
import { FriendsPanel } from './ui/friends.ts'
import { PackShelf } from './ui/packs.ts'
import { TodayPanel } from './ui/today.ts'
import { report as reportMission } from './missions.ts'
import { DAILY_REWARDS } from './daily.ts'
import { publishBest, publishProfile } from './social/players.ts'
import { account } from './leaderboard/session.ts'
import { HomeScreen } from './ui/home.ts'
import { Hud } from './ui/hud.ts'
import { Overlay } from './ui/overlay.ts'
import type { OverlayContent } from './ui/overlay.ts'
import { Screens } from './ui/screens.ts'

function totalHeld(inventory: { hammer: number; rocket: number; bomb: number }): number {
  return inventory.hammer + inventory.rocket + inventory.bomb
}

/** What the next level wants, in one sentence for the level-complete card. */
function nextLevelAsk(level: number): string {
  const goal = goalForLevel(level, BOARD.kinds)
  const moves = movesForLevel(level)
  if (goal.kind === 'score') {
    return `Level ${level} asks for ${goal.need.toLocaleString()} points in ${moves} moves.`
  }
  if (goal.kind === 'power') {
    return `Level ${level} asks for ${goal.need} power gems in ${moves} moves.`
  }
  return `Level ${level} asks for ${goal.need} ${styleFor(goal.colour).name} gems in ${moves} moves.`
}

/** Only for the card that announces a payout; the tray labels itself. */
const ITEM_LABELS: Record<Item, string> = { hammer: 'Hammer', rocket: 'Rocket', bomb: 'Bomb' }

const BEST_KEY = 'chroma-match:best'
const NAME_KEY = 'chroma-match:name'

// Before anything is measured or drawn: the skin carries the corner radius and
// the panel treatment, so applying it after layout would cost a reflow and a
// visible flash of the default one.
initSkin()

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
const combo = new ComboMeter()
const tray = new ItemTray()
/** Read once: the nudge is a first-run affordance, not a per-frame question. */
let itemUsed = hasUsedItem()
const shop = new Shop()
const loadout = new Loadout()
const pause = new PauseSheet()
const screens = new Screens()
const packs = new PackShelf()
const today = new TodayPanel()
const friends = new FriendsPanel()
const accountBar = new AccountBar(() => readStored(NAME_KEY))

/**
 * The local board is used immediately so the launch screen has something to
 * draw, then the shared one takes over if it connects. Nothing above the
 * interface changes either way, and a run is verified by replay in both.
 */
let leaderboard: Leaderboard = new LocalLeaderboard()
const home = new HomeScreen(leaderboard)

// The friends tab is a second source for the same list, not a second screen:
// one board, two questions about it.
home.setFriends(() => friends.board())
home.onModeChange((mode) => friends.setVisible(mode === 'friends'))
friends.onChange(() => void home.refresh())
// Signing in or out changes whose rows the friends tab is about, so the board
// is re-read rather than left showing the previous account's.
accountBar.onChange(() => {
  if (screens.active === 'home') void home.refresh()
})

today.onChange(() => shop.refresh())
packs.onBuy(() => shop.refresh())

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

/**
 * A `?seed=` in the URL replays an exact board, which makes bugs reproducible
 * and lets two people race the same deal.
 *
 * It pins every run in the tab, not just the first. It used to be read once at
 * startup and then thrown away by the first press of Play, which restarted on a
 * random seed — so the documented way to reproduce a board did not survive
 * reaching the board.
 */
function seedFromUrl(): number | null {
  const raw = new URLSearchParams(location.search).get('seed')
  if (!raw) return null
  const parsed = Number.parseInt(raw, 36)
  return Number.isFinite(parsed) ? parsed >>> 0 : null
}

// ---- game -----------------------------------------------------------------

const hooks: Partial<GameHooks> = {
  onClear(cells, kind, chain, points) {
    sfx.clear(chain)
    haptics.clear(chain)
    combo.report(chain)
    // Reported by kind rather than by mission: the board has no idea which
    // three missions are running today, and should not have to.
    reportMission('gems', cells.length)
    reportMission('chain', chain)
    // What the hit is worth: how much of the board went at once, and how deep
    // into a chain it landed. A three-gem match at the top of a chain is not an
    // event, and should not be felt as one.
    const bulk = Math.min(1, (cells.length - 3) / 7)
    const depth = Math.min(1, (chain - 1) / 4)
    const force = Math.max(bulk * 0.55, depth * 0.85)
    if (force > 0.12) renderer.hit(force)
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
    // The score takes the colour of the gems that earned it, always — the flat
    // white this used to fall back to for an unchained clear was invisible on
    // the Paper skin's cream board, where the halo behind it is cream too.
    // Depth is carried by the size and by the chain badge, not by a second
    // colour that only works on half the skins.
    effects.float(cx, cy, `+${points}`, contrastingShade(kind), 1 + Math.min(chain, 5) * 0.07)
  },
  onItemEarned(item) {
    sfx.power()
    haptics.power()
    tray.flash(item)
  },
  onItemUsed(item, cell) {
    reportMission('item', 1)
    sfx.power()
    haptics.power()
    // The nudge has served its purpose the moment an item is spent.
    if (!itemUsed) {
      itemUsed = true
      markItemUsed()
      tray.nudge(false)
    }
    // A bomb is felt harder than a hammer, because it does more.
    renderer.hit(item === 'bomb' ? 0.85 : item === 'rocket' ? 0.7 : 0.4)
    const { x, y } = renderer.centreOf(cell)
    effects.burst(x, y, '#FFFFFF', 14)
  },
  /**
   * Something fired. The board is untouched for the length of the strike, so
   * everything here is the wind-up: the sound, the hit, and sparks thrown
   * along the path the beam is about to take.
   */
  onStrike(blasts) {
    // Sized by what is going off, so a prism sweeping the board does not feel
    // the same as a hammer on one gem.
    const weight = blasts.reduce(
      (most, blast) =>
        Math.max(most, blast.kind === 'colour' ? 1 : blast.kind === 'square' ? 0.7 : blast.kind === 'point' ? 0.25 : 0.55),
      0,
    )
    sfx.strike(weight)
    haptics.strike(weight)
    renderer.hit(0.3 + weight * 0.5)

    for (const blast of blasts) {
      const { x, y } = renderer.centreOf(blast.cell)
      const colour = styleFor(game.grid[blast.cell]?.kind ?? 0).base
      // Thrown from the muzzle, not from where the gems will land: these are
      // the shot being fired, and the confetti from the pop follows it.
      effects.burst(x, y, colour, blast.kind === 'point' ? 5 : 9)
    }
  },
  onPowerCreated() {
    reportMission('power', 1)
    sfx.power()
    haptics.power()
    renderer.hit(0.5)
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
    // Reaching level N+1 is what finishing level N means; a mission that asks
    // for level 6 should tick on the card that hands out level 6.
    reportMission('level', level + 1)
    sfx.levelUp()
    haptics.levelUp()
    tray.arm(null)
    const earned = itemForLevel(level)
    overlay.show({
      kicker: 'Cleared',
      title: `Level ${level} complete`,
      hero: {
        value: game.score.toLocaleString(),
        caption: 'points banked',
        flair: `${ITEM_LABELS[earned]} earned`,
      },
      body: nextLevelAsk(level + 1),
      action: 'Next level',
      onAction: () => game.nextLevel(),
    })
  },
  onGameOver(score) {
    reportMission('score', score)
    reportMission('level', game.level)
    sfx.gameOver()
    haptics.gameOver()
    tray.arm(null)
    // The run is over, so there is nothing left to come back to.
    clearSuspended()
    const previous = record
    const isRecord = commitRecord()
    const run = recordOf(game)

    // Paid on the way out rather than as the run goes, so a player cannot bank
    // a level's coins and then abandon the run to keep them.
    const payout = payoutFor(score, game.level)
    setCoins(coins() + payout)
    shop.refresh()
    today.refresh()

    const content: OverlayContent = {
      kicker: 'Out of moves',
      title: 'Run over',
      hero: {
        value: score.toLocaleString(),
        caption: `points · level ${game.level}`,
        ...(isRecord ? { flair: 'New personal best' } : {}),
      },
      body: `+${payout} coins${isRecord ? '' : ` · your best is still ${previous.toLocaleString()}`}`,
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
          // A signed-in player's profile carries the name their friends see on
          // the friends board, and the run behind their number. Both follow a
          // posted run rather than any finished one: the friends board is the
          // same claim as the public board, so it is made in the same place.
          // Failures are swallowed — the run is already on the leaderboard, and
          // a friends row that is one run stale is not worth an error card.
          if (account()?.kind === 'google') {
            void publishProfile(clean, account()?.photo ?? '').catch(() => {})
            void publishBest(run).catch(() => {})
          }
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

attachInput(
  canvas,
  game,
  renderer,
  () => sfx.unlock(),
  (cell) => {
    const item = tray.armed
    if (!item) return false
    // A refused item still swallows the tap: the player aimed deliberately, and
    // silently turning that into a gem selection is not what they asked for.
    if (!game.useItem(item, cell)) {
      sfx.reject()
      return true
    }
    tray.arm(null)
    return true
  },
)

// ---- navigation -----------------------------------------------------------

function startRun(boosters: readonly Item[] = []): void {
  clearSuspended()
  effects.clear()
  combo.hide()
  tray.arm(null)
  overlay.hide()
  game.restart(seedFromUrl() ?? randomSeed())

  // Applied before anything else touches the board, because the record only
  // accepts a booster at its head — and taken out of the stash here, so a run
  // that is abandoned still costs what it carried.
  const carried: Item[] = []
  for (const item of boosters.slice(0, BOOSTER_LIMIT)) {
    if (game.addBooster(item, BOOSTER_LIMIT)) carried.push(item)
  }
  spendBoosters(carried)
  shop.refresh()

  screens.show('game')
  renderer.resize()
}

function goHome(): void {
  commitRecord()
  shop.refresh()
  effects.clear()
  combo.hide()
  tray.arm(null)
  overlay.hide()
  pause.hide()
  screens.show('home')
  paintContinue()
  today.refresh()
  void home.refresh()
}

/** True while there is a run on the board that has not finished. */
function runInProgress(): boolean {
  return screens.active === 'game' && game.status !== 'gameOver' && game.log.length > 0
}

/**
 * Puts the run down. The record is the save: replaying it rebuilds the board,
 * the score, the level, the moves left and the tray, all in step with each
 * other, which a snapshot of those fields would not stay for long.
 */
function keepRun(): void {
  suspendRun(recordOf(game))
  goHome()
}

/**
 * Resumes a kept run by replaying it. Returns false when the save will not
 * replay — an older version of the rules, or an edited one — in which case the
 * player is told rather than dropped onto a board that is not theirs.
 */
function continueRun(): boolean {
  const kept = suspendedRun()
  if (!kept) return false

  effects.clear()
  combo.hide()
  tray.arm(null)
  overlay.hide()
  if (!restoreRun(game, kept.record)) {
    clearSuspended()
    paintContinue()
    overlay.show({
      kicker: 'Sorry',
      title: 'That run could not be resumed',
      body: 'The saved run no longer replays on this version of the board, so it has been cleared.',
      action: 'Start a new one',
      onAction: () => loadout.show((picked) => startRun(picked)),
    })
    return false
  }

  clearSuspended()
  screens.show('game')
  renderer.resize()
  return true
}

/** Shows or hides the launch screen's Continue button. */
function paintContinue(): void {
  const kept = suspendedRun()
  const button = document.getElementById('continue-run')
  const sub = document.getElementById('continue-sub')
  if (!button) return
  button.hidden = kept === null
  if (kept && sub) {
    sub.textContent = `Level ${kept.level} · ${kept.score.toLocaleString()}`
  }
}

screens.onChange((name) => {
  // The canvas is zero-sized while the screen is hidden, so it has to be
  // re-measured on the way back in rather than waiting for a resize event.
  if (name === 'game') renderer.resize()
})

document.getElementById('continue-run')?.addEventListener('click', (event) => {
  sfx.unlock()
  // Restoring is a replay, and a replay of a long run is not instant — roughly
  // six milliseconds an action, so a couple of hundred moves is over a second
  // of a synchronous loop. Say so and give the browser a frame to paint it,
  // because a button that does nothing for a second has been pressed twice.
  const button = event.currentTarget as HTMLButtonElement
  const label = button.innerHTML
  button.disabled = true
  button.textContent = 'Restoring…'
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      continueRun()
      button.disabled = false
      button.innerHTML = label
    })
  })
})

document.getElementById('start-game')?.addEventListener('click', () => {
  sfx.unlock()
  const kept = suspendedRun()
  if (!kept) {
    loadout.show((picked) => startRun(picked))
    return
  }
  // A new run overwrites the kept one, so it is asked for rather than assumed.
  overlay.show({
    kicker: 'You have a run waiting',
    title: `Level ${kept.level}`,
    body: `${kept.score.toLocaleString()} points. Starting a new run discards it.`,
    action: 'Start a new run',
    onAction: () => {
      clearSuspended()
      paintContinue()
      loadout.show((picked) => startRun(picked))
    },
    secondary: { label: 'Continue that one', onAction: () => continueRun() },
  })
})

document.getElementById('open-shop')?.addEventListener('click', () => {
  shop.reset()
  screens.show('shop')
})
document.getElementById('shop-back')?.addEventListener('click', () => {
  screens.show('home')
  shop.refresh()
  void home.refresh()
})
document.getElementById('pause')?.addEventListener('click', () => {
  // Deliberately not gated on the board being still. A pause that only opens
  // between cascades is a pause that refuses exactly when someone is trying to
  // put their phone down; the sheet is a modal over a board that keeps
  // settling behind it, and every action on it is safe mid-animation.
  pause.show(game.level, game.score, {
    resume: () => {},
    keep: () => keepRun(),
    // Ending banks the score and pays the run out, which is what leaving used
    // to skip: a level-24 run abandoned from the old footer earned nothing.
    end: () => game.endRun(),
  })
})

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

const skinButtons = document.querySelectorAll<HTMLButtonElement>('[data-action="skin"]')
function paintSkinButtons(): void {
  for (const button of skinButtons) {
    const label = button.querySelector('.skin-label')
    if (label) label.textContent = activeSkin().name
    button.title = `Switch to ${nextSkin().name}`
  }
}
for (const button of skinButtons) {
  button.addEventListener('click', () => setSkin(nextSkin()))
}
// Both footers carry the toggle, and the skin can also change from the URL, so
// the labels are painted from the skin rather than from whichever button was
// pressed.
onSkinChange(paintSkinButtons)
paintSkinButtons()

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
window.addEventListener('pagehide', () => {
  commitRecord()
  // Phones evict backgrounded tabs without warning, and a run is the one thing
  // here that cannot be rebuilt from anything else. Keeping it costs a string.
  if (runInProgress()) suspendRun(recordOf(game))
})

if (import.meta.env.DEV) {
  // Handy from the console while tuning: `chroma.game.grid`, `chroma.game.hint`.
  // `moves()` lists every legal swap on the board right now — the hint only
  // appears after the player has been idle a while, which makes it useless for
  // driving the game quickly. `best()` is the same simulated player the tuning
  // sweep measures with, so a board driven here behaves like the one the
  // numbers came from.
  // `leaderboard` is reassigned once the shared board connects, so it is
  // exposed through a getter — an object literal would freeze the local one.
  Object.assign(window, {
    chroma: {
      game,
      moves: () => findMoves(game.geom, game.grid),
      best: () => bestMove(game),
      renderer,
      effects,
      sfx,
      screens,
      home,
      get leaderboard() {
        return leaderboard
      },
    },
  })
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
    combo.update(dt)
    renderer.settle(dt)
    renderer.draw(game, effects, time)
    hud.update(game, displayBest())
    tray.update(game.items)
    if (!itemUsed) tray.nudge(!tray.armed && totalHeld(game.items) > 0)
  }

  requestAnimationFrame(frame)
}

/**
 * The card that announces a daily reward.
 *
 * The panel does the claiming; this only says what arrived. A reward that
 * changed a number on a button and nothing else is a reward the player has to
 * go looking for evidence of.
 */
today.onDailyClaimed((state) => {
  const item = state.reward.item ? ITEM_LABELS[state.reward.item] : ''
  overlay.show({
    kicker: `Day ${state.day}`,
    title: state.streak > 1 ? `${state.streak} days in a row` : 'Daily reward',
    hero: {
      value: `+${state.reward.coins}`,
      caption: 'coins',
      ...(item ? { flair: `${item} too` } : {}),
    },
    body:
      state.day === DAILY_REWARDS.length
        ? 'A full week. The streak starts again tomorrow at day one.'
        : `Come back tomorrow for day ${state.day + 1}.`,
    action: 'Nice',
    onAction: () => {},
  })
})

/**
 * A first-time player used to meet every part of the meta as an absence: three
 * greyed-out item buttons, a shop they cannot afford anything in, and a loadout
 * screen whose whole content was an apology. The kit turns all three on, and
 * the card says where it came from — an inventory that fills itself silently is
 * a bug as far as the player can tell.
 */
const granted = grantStarterKit()
shop.refresh()
today.refresh()
paintContinue()
void home.refresh()

if (granted) {
  const names = granted.items.map((item) => ITEM_LABELS[item]).join(' and a ')
  overlay.show({
    kicker: 'Welcome',
    title: 'Your starter kit',
    hero: { value: String(granted.coins), caption: 'coins', flair: `A ${names}` },
    body: 'Items are aimed at any gem and cost no move. Coins buy more in the shop.',
    action: 'Got it',
    onAction: () => {},
  })
}
requestAnimationFrame(frame)
