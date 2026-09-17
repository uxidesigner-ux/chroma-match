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
import { initSkin } from './render/skins/index.ts'
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
import { ProfileCard } from './ui/profile.ts'
import { Creator } from './ui/creator.ts'
import { Sheet } from './ui/sheet.ts'
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
import { applyLanguage, n, onLanguageChange, t } from './i18n/index.ts'
import { gemName } from './i18n/gems.ts'
import { SettingsSheet } from './ui/settings.ts'
import { hapticsOn, setHapticsOn, setSoundOn, soundOn } from './settings.ts'

function totalHeld(inventory: { hammer: number; rocket: number; bomb: number }): number {
  return inventory.hammer + inventory.rocket + inventory.bomb
}

/** What the next level wants, in one sentence for the level-complete card. */
function nextLevelAsk(level: number): string {
  const goal = goalForLevel(level, BOARD.kinds)
  const moves = movesForLevel(level)
  if (goal.kind === 'score') {
    return t('askScore', { level, need: n(goal.need), moves })
  }
  if (goal.kind === 'power') {
    return t('askPower', { level, need: goal.need, moves })
  }
  return t('askGems', { level, need: goal.need, moves, colour: gemName(goal.colour) })
}

/** Only for the card that announces a payout; the tray labels itself. */
const ITEM_LABELS: Record<Item, () => string> = {
  hammer: () => t('itemHammer'),
  rocket: () => t('itemRocket'),
  bomb: () => t('itemBomb'),
}

const BEST_KEY = 'chroma-match:best'
const LEVEL_KEY = 'chroma-match:best-level'
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
// Read back rather than assumed: both kits default to on, and a player who
// muted the game last time would otherwise get it back at full volume on
// every load — which is what happened before these were written down.
sfx.enabled = soundOn()
haptics.enabled = hapticsOn()
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
const ranksSheet = new Sheet('sheet-ranks')
const creator = new Creator(() => screens.show('home'))
const profile = new ProfileCard(
  () => readStored(NAME_KEY),
  (name) => writeStored(NAME_KEY, name),
  () => {
    creator.open()
    screens.show('creator')
  },
)

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
home.setPersonalBest(() => record)
home.onModeChange((mode) => friends.setVisible(mode === 'friends'))
friends.onChange(() => void home.refresh())
// Signing in or out changes whose rows the friends tab is about, and a new
// avatar changes what every row of it looks like, so the board is re-read
// rather than left showing the previous account's.
profile.onChange(() => {
  if (screens.active === 'home') void home.refresh()
})

/**
 * What the wardrobe changed has to reach everywhere the face is.
 *
 * The card behind it, the sheet it was opened from, the boards that draw a row
 * per player — and the profile document, so a friend sees the new outfit
 * without either of you posting a score. That last one is the whole reason
 * publishProfile reads the avatar itself rather than taking it as an argument.
 */
creator.onChange(() => {
  profile.refresh()
  void home.refresh()
  if (account()?.kind === 'google') {
    void publishProfile(readStored(NAME_KEY) || t('anonymous'), account()?.photo ?? '').catch(
      () => {},
    )
  }
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

/**
 * The furthest level any run has reached.
 *
 * A separate number from the best score rather than the level that scored it:
 * a run can die early on a lucky board or grind a long way on a poor one, and
 * "how far have I got" is the question the profile card is answering. It is
 * also the only stat on that card that is not about a single run.
 */
let furthest = Math.max(1, Number(readStored(LEVEL_KEY)) || 1)

function commitRecord(): boolean {
  if (game.level > furthest) {
    furthest = game.level
    writeStored(LEVEL_KEY, String(furthest))
    paintLevel()
  }
  if (game.score <= record) return false
  record = game.score
  writeStored(BEST_KEY, String(record))
  return true
}

/** The card's level reads the run in progress while there is one. */
function paintLevel(): void {
  const node = document.getElementById('home-level')
  if (!node) return
  const live = screens.active === 'game' && game.status !== 'gameOver' ? game.level : 0
  node.textContent = String(Math.max(furthest, live))
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
      kicker: t('cleared'),
      title: t('levelComplete', { level }),
      hero: {
        value: n(game.score),
        caption: t('pointsBanked'),
        flair: t('itemEarned', { item: ITEM_LABELS[earned]() }),
      },
      body: nextLevelAsk(level + 1),
      action: t('nextLevel'),
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
      kicker: t('outOfMoves'),
      title: t('runOver'),
      hero: {
        value: n(score),
        caption: t('pointsAndLevel', { level: game.level }),
        ...(isRecord ? { flair: t('newPersonalBest') } : {}),
      },
      body: isRecord
        ? t('coinsGained', { coins: payout })
        : t('coinsGainedBest', { coins: payout, best: n(previous) }),
      action: t('playAgain'),
      onAction: () => startRun(),
      secondary: { label: t('backToHome'), onAction: () => goHome() },
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
            return { ok: false, message: result.reason ?? t('postRejected') }
          }
          void home.refresh()
          return {
            ok: true,
            message: result.rank
              ? t('postedRank', { rank: result.rank, score: n(result.score) })
              : t('posted', { score: n(result.score) }),
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
  paintLevel()
  profile.paintCard()
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
      kicker: t('sorry'),
      title: t('cannotResume'),
      body: t('cannotResumeBody'),
      action: t('startANewOne'),
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
    sub.textContent = t('continueSub', { level: kept.level, score: n(kept.score) })
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
  button.textContent = t('restoring')
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
    kicker: t('runWaiting'),
    title: t('levelN', { level: kept.level }),
    body: t('runWaitingBody', { score: n(kept.score) }),
    action: t('startANewRun'),
    onAction: () => {
      clearSuspended()
      paintContinue()
      loadout.show((picked) => startRun(picked))
    },
    secondary: { label: t('continueThatOne'), onAction: () => continueRun() },
  })
})

document.getElementById('open-ranks')?.addEventListener('click', () => {
  ranksSheet.show()
  // Refreshed on the way in rather than on a timer: the board is only worth a
  // network round trip at the moment somebody asks to look at it.
  void home.refresh()
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

/**
 * The quick mute that stays on the pause card.
 *
 * Sound is a setting and lives in Settings now, but it is also the one setting
 * somebody reaches for mid-run — in a waiting room, next to a sleeping child —
 * and making them leave the board to find it is the wrong trade. It writes to
 * the same stored preference, so the two never disagree.
 */
const soundButtons = document.querySelectorAll<HTMLButtonElement>('[data-action="sound"]')
function applySound(on: boolean): void {
  sfx.enabled = on
  // One control for both here: a buzz with no sound reads as a fault, not a
  // reward. The Settings sheet separates them, because there it can explain.
  haptics.enabled = on && hapticsOn()
  for (const other of soundButtons) {
    other.setAttribute('aria-pressed', String(on))
    const label = other.querySelector('.sound-label')
    if (label) label.textContent = on ? t('settingsSound') : t('settingsOff')
  }
}
for (const button of soundButtons) {
  button.addEventListener('click', () => {
    sfx.unlock()
    const next = !soundOn()
    setSoundOn(next)
    applySound(next)
    settings.paint()
  })
}

const settings = new SettingsSheet({
  applySound,
  applyHaptics(on) {
    setHapticsOn(on)
    haptics.enabled = on && soundOn()
  },
})

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

/**
 * Text, after everything that owns some has been built.
 *
 * The static pass fills anything carrying `data-i18n`, including the profile
 * tabs and the settings chips, which are created in their constructors — so it
 * runs here rather than at import time, when half of them would not exist yet.
 *
 * On a language change it runs again and every panel repaints its own dynamic
 * text. Nothing else is touched: no state is read, written or migrated, so a
 * run in progress keeps its board, its score and its move list across a switch.
 */
function repaintText(): void {
  applyLanguage()
  applySound(soundOn())
  settings.paint()
  hud.invalidate()
  if (screens.active === 'creator') creator.paint()
  paintContinue()
  profile.paintCard()

  today.refresh()
  shop.refresh()
  packs.refresh()
  void home.refresh()
}
applyLanguage()
onLanguageChange(repaintText)

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
  const item = state.reward.item ? ITEM_LABELS[state.reward.item]() : ''
  overlay.show({
    kicker: t('dayN', { day: state.day }),
    title: state.streak > 1 ? t('daysInARow', { streak: state.streak }) : t('dailyRewardTitle'),
    hero: {
      value: `+${state.reward.coins}`,
      caption: t('starterCoins'),
      ...(item ? { flair: t('itemToo', { item }) } : {}),
    },
    body:
      state.day === DAILY_REWARDS.length
        ? t('fullWeek')
        : t('comeBackTomorrow', { next: state.day + 1 }),
    action: t('nice'),
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
paintLevel()
void home.refresh()

if (granted) {
  // ITEM_LABELS holds getters, not strings — joining them printed the source
  // of the arrow functions into the dialog. And the list itself does not
  // translate by concatenation anyway: 'A hammer and a bomb' is one phrase in
  // every language, so it is one key.
  overlay.show({
    kicker: t('welcome'),
    title: t('starterKit'),
    hero: { value: String(granted.coins), caption: t('starterCoins'), flair: t('starterItems') },
    body: t('starterBody'),
    action: t('gotIt'),
    onAction: () => {},
  })
}
requestAnimationFrame(frame)
