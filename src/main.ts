import './style.css'
import './anime-studio.css'
import './play-lobby.css'
import './play-responsive.css'
import './variety.css'
import './world-map.css'
import './hub.css'
import './game-icons.css'
import './profile-rank.css'
import './casual-ui.css'
import './lobby-scene.css'
import './profile-page.css'
import { installGameIcons } from './ui/game-icons.ts'
installGameIcons()
import { player, type Settlement } from './player/ledger.ts'
import { Hub } from './ui/hub.ts'
import { growthCopy } from './ui/growth-copy.ts'
import { COSMETICS, levelFor } from './player/model.ts'
import { WorldMap } from './ui/world-map.ts'
import { worldCopy, missionCaption } from './ui/world-copy.ts'
import { CampaignProgress, unlocked } from './campaign-progress.ts'
import { WORLD_MISSIONS, type Mission } from './game/campaign.ts'
import { attachPlayLayout } from './ui/play-layout.ts'
import { Lobby } from './ui/lobby.ts'
import { Splash } from './ui/splash.ts'
import { RulesHelp } from './ui/rules-help.ts'
import { experienceCopy } from './ui/experience-copy.ts'
import { BoardViewport } from './ui/board-viewport.ts'
import { playCopy } from './ui/play-copy.ts'
import { Sfx } from './audio.ts'
import { Haptics } from './haptics.ts'
import { Game, movesForLevel } from './game/game.ts'
import type { GameHooks } from './game/game.ts'
import { randomSeed } from './game/rng.ts'
import { hasRunActions, recordOf, settledRecordOf, restoreRun, missionOf } from './game/replay.ts'
import { bonusForLevel, stageGoal } from './game/variety.ts'
import type { Upgrade } from './game/variety.ts'
import { varietyCopy } from './ui/variety-copy.ts'
import { ALL_ITEMS, itemForLevel } from './game/items.ts'
import { NEW_CAMPAIGN_RULES, NEW_FREE_RULES } from './game/rules.ts'
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
  grantStoredStarterKit,
  hasUsedItem,
  markItemUsed,
  payoutFor,
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

function totalHeld(inventory: import('./game/items.ts').Inventory): number {
  return ALL_ITEMS.reduce((sum, item) => sum + (inventory[item] ?? 0), 0)
}

/** What the next level wants, in one sentence for the level-complete card. */
function nextLevelAsk(level: number): string {
  const goal = stageGoal(level, BOARD.kinds, game.rules)
  const bonus = bonusForLevel(level, game.rules)
  const moves = movesForLevel(level) + (bonus ? 5 : 0)
  const note = bonus ? `${varietyCopy().bonus[bonus]}. ${varietyCopy().bonusPreview}. ${varietyCopy().bonusDetail[bonus]} ` : ''
  if (goal.kind === 'score') {
    return note + t('askScore', { level, need: n(goal.need), moves })
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
  bomb: () => t('itemBomb'), bow: () => t('itemBow'), shuffle: () => t('itemShuffle'),
}

const BEST_KEY = 'chroma-match:best'
const LEVEL_KEY = 'chroma-match:best-level'
const NAME_KEY = 'chroma-match:name'

// Before anything is measured or drawn: the skin carries the corner radius and
// the panel treatment, so applying it after layout would cost a reflow and a
// visible flash of the default one.
initSkin()
attachPlayLayout()
await player.open()

const canvasNode = document.getElementById('board')
if (!(canvasNode instanceof HTMLCanvasElement)) throw new Error('Missing #board canvas')
const canvas: HTMLCanvasElement = canvasNode

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
// A quit may arrive during an already accepted action. Finish that action
// before banking its score, or the recorded move and payout cannot replay.
let endingRun = false
let manualEnd = false
let attemptId = ''
let startingRun = false
let lastSettlement: Settlement | null = null
let lastSettlementCursor = ''
let settlementTask: Promise<Settlement> | null = null
const screens = new Screens()
const splash = new Splash(() => welcomeHome())
const lobby = new Lobby({
  onProgress: (pct) => splash.setProgress(pct),
  onBootSettled: (ok) => {
    void splash.finish(ok).then(() => welcomeHome())
  },
})
const packs = new PackShelf()
const today = new TodayPanel()
const friends = new FriendsPanel()
const ranksSheet = new Sheet('sheet-ranks')
document.getElementById('ranks-close')!.addEventListener('click',()=>ranksSheet.hide())
const creator = new Creator(() => screens.show('home'))
const profile = new ProfileCard(
  () => readStored(NAME_KEY),
  (name) => writeStored(NAME_KEY, name),
  () => {
    creator.open()
    screens.show('creator')
  },
  screens,
)
let campaignStorage: Storage | null = null
try { campaignStorage = localStorage } catch { /* unavailable storage remains a playable session */ }
const campaign = new CampaignProgress(campaignStorage)
const world = new WorldMap(campaign, mission => requestNewRun(mission),
  () => readStored(NAME_KEY) || account()?.name || '')
campaign.state = player.state.campaign
campaign.persistent = player.persistent
const hub = new Hub(screens, world, profile, shop)
player.onChange(() => {
  campaign.state = player.state.campaign; campaign.persistent = player.persistent
  shop.refresh(); world.refresh(); profile.refresh(); hub.refresh()
})
world.refresh()
let returnDestination: 'map' | 'home' = screens.active === 'home' ? 'home' : 'map'
let shopDestination: 'map' | 'home' = returnDestination
let shopTrigger = 'map-shop'

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
  world.refresh()
  if (screens.active === 'home') void home.refresh()
})

/**
 * What the character editor changed has to reach everywhere the face is.
 *
 * The card behind it, the sheet it was opened from, the boards that draw a row
 * per player — and the profile document, so a friend sees the new outfit
 * without either of you posting a score. That last one is the whole reason
 * publishProfile reads the avatar itself rather than taking it as an argument.
 */
creator.onChange(async () => {
  world.refresh()
  profile.refresh()
  hud.refreshAvatar()
  void home.refresh()
  if (account()?.kind === 'google') {
    const publish = publishProfile(readStored(NAME_KEY) || t('anonymous'), account()?.photo ?? '')
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([publish, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Profile sync timeout')), 10000)
      })])
    } finally { clearTimeout(timer) }
  }
})

today.onChange(() => { shop.refresh(); world.refresh() })
packs.onBuy(() => { shop.refresh(); world.refresh() })
document.getElementById('profile-name-input')!.addEventListener('input', () => world.refresh())

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
  if (game.mission) return false // Authored missions are not comparable to endless rankings.
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
  onCascadeCapped() {
    combo.reportEvent(varietyCopy().chainFinish)
    sfx.shuffle()
  },
  onFever() {
    hud.react('fusion')
    combo.reportEvent(varietyCopy().started)
    sfx.power(); haptics.power(); renderer.hit(.8)
  },
  onFusion(fusion) {
    hud.react('fusion')
    combo.reportFusion(fusion.kind)
    sfx.power()
    haptics.power()
  },
  onClear(cells, kind, chain, points) {
    hud.react(chain > 1 ? 'chain' : 'pop', chain)
    sfx.clear(chain)
    haptics.clear(chain)
    combo.report(chain)
    // Reported by kind rather than by mission: the board has no idea which
    // three missions are running today, and should not have to.
    reportMission('gems', cells.filter(cell=>(game.grid[cell]?.kind??-1)>=0).length)
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
      if (chain >= 3) effects.impact(x, y, styleFor(gem?.kind ?? kind).base, renderer.cellSize * 0.48)
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
    hud.react('power')
    reportMission('item', 1)
    if (item === 'bow' || item === 'shuffle') combo.reportEvent(t(item === 'bow' ? 'itemBow' : 'itemShuffle'))
    if (item !== 'shuffle') sfx.power()
    haptics.power()
    // The nudge has served its purpose the moment an item is spent.
    if (!itemUsed) {
      itemUsed = true
      markItemUsed()
      tray.nudge(false)
    }
    // A bomb is felt harder than a hammer, because it does more.
    renderer.hit(item === 'bomb' ? 0.85 : (item === 'rocket' || item === 'bow') ? 0.7 : 0.4)
    const { x, y } = renderer.centreOf(cell)
    effects.burst(x, y, '#FFFFFF', 14)
  },
  /**
   * Something fired. The board is untouched for the length of the strike, so
   * everything here is the wind-up: the sound, the hit, and sparks thrown
   * along the path the beam is about to take.
   */
  onStrike(blasts) {
    hud.react('power')
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
      effects.impact(x, y, colour, renderer.cellSize * 0.52)
    }
  },
  onPowerCreated(cell) {
    reportMission('power', 1)
    sfx.power()
    haptics.power()
    renderer.hit(0.5)
    const { x, y } = renderer.centreOf(cell)
    const colour = styleFor(game.grid[cell]?.kind ?? 0).base
    effects.impact(x, y, colour, renderer.cellSize * 0.6)
    effects.burst(x, y, colour, 16)
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
    hud.react('clear')
    // Reaching level N+1 is what finishing level N means; a mission that asks
    // for level 6 should tick on the card that hands out level 6.
    if (!game.mission) reportMission('level', level + 1)
    sfx.levelUp()
    haptics.levelUp()
    tray.arm(null)
    if (game.mission) { endingRun = false; showLevelComplete(level); return }
    if (endingRun) return
    showLevelComplete(level)
  },
  onGameOver(score) {
    void finishRun(score)
  },
}

async function settleCurrent(outcome: 'cleared' | 'failed' | 'quit', terminal: boolean, payout = 0): Promise<Settlement> {
  if (settlementTask) return settlementTask
  const record = recordOf(game), id = attemptId
  suspendRun(record, id, outcome === 'cleared' ? undefined : outcome)
  settlementTask = player.settle(id, record, outcome, terminal, payout)
  try {
    const result = await settlementTask
    if (!result.ok) throw new Error('unverified result')
    if (record.moves !== lastSettlementCursor || !lastSettlement) { lastSettlement = result; lastSettlementCursor = record.moves }
    if (terminal && result.persistent) clearSuspended()
    return lastSettlement ?? result
  } finally { settlementTask = null }
}
function growthResult(result: Settlement): string {
  if (!result.persistent) return growthCopy().saveError
  const rewards = COSMETICS.filter(c => c.level > result.before && c.level <= result.after).map(c => growthCopy().names[c.id])
  return rewards.length ? '✦ ' + rewards.join(' · ') : ''
}
function resultGrowth(result: Settlement): OverlayContent['growth'] {
  if (!result.persistent) return undefined
  return { ...levelFor(player.state.growth.totalXp), gained: result.xp, before: result.before }
}
function saveFailure(retry: () => void): void {
  const copy = growthCopy()
  overlay.show({ kicker: copy.saving, title: copy.saveError, body: '', action: copy.retry, onAction: retry,
    secondary: { label: t('backToHome'), onAction: goHome } })
}
async function finishRun(score: number): Promise<void> {
  const outcome = manualEnd ? 'quit' : 'failed'
  let settlement: Settlement
  try { settlement = await settleCurrent(outcome, true, game.mission ? 0 : payoutFor(score, game.level)) }
  catch { saveFailure(() => void finishRun(score)); return }
    endingRun = false
    reportMission('score', score)
    reportMission('level', game.level)
    sfx.gameOver()
    haptics.gameOver()
    tray.arm(null)
    // The run is over, so there is nothing left to come back to.
    if (game.mission) {
      const m = game.mission, copy = worldCopy()
      overlay.show({ kicker: missionCaption(m), title: copy.failed, body: growthResult(settlement),
        growth: resultGrowth(settlement),
        hero: { value: n(game.progress), caption: `${n(game.need)}` },
        action: copy.retry, onAction: () => startRun([], m),
        secondary: { label: copy.back, onAction: goHome },
      })
      return
    }
    const previous = record
    const isRecord = commitRecord()
    const run = recordOf(game)

    // Paid on the way out rather than as the run goes, so a player cannot bank
    // a level's coins and then abandon the run to keep them.
    const payout = payoutFor(score, game.level)
    shop.refresh()
    today.refresh()

    const content: OverlayContent = {
      growth: resultGrowth(settlement),
      kicker: t('outOfMoves'),
      ...(isRecord ? { celebration: 'record' as const } : {}),
      title: t('runOver'),
      hero: {
        value: n(score),
        caption: t('pointsAndLevel', { level: game.level }),
        ...(isRecord ? { flair: t('newPersonalBest') } : {}),
      },
      body: growthResult(settlement) + '\n' + (isRecord
        ? t('coinsGained', { coins: payout })
        : t('coinsGainedBest', { coins: payout, best: n(previous) })),
      action: t('playAgain'),
      onAction: () => startRun(),
      secondary: { label: t('backToHome'), onAction: () => goHome() },
    }

    // A run with no accepted swaps has nothing to verify, so nothing to post.
    if (hasRunActions(run)) {
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
}

const game = new Game(hooks, seedFromUrl() ?? randomSeed())

document.getElementById('board')!.addEventListener('keydown', e => { if (e.key === 'Escape') tray.arm(null) })
tray.onArm(item => {
  renderer.aimItem = item
  renderer.aimCell = null
  if (item === 'bow') { game.selected = null; game.cancelPress() }
  if (item === 'shuffle') {
    if (!game.useItem('shuffle', 0)) sfx.reject()
    tray.arm(null)
  }
})

const resetInput = attachInput(
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

function resetPlayView(): void {
  resetInput()
  document.querySelector<HTMLElement>('.game .stage')!.scrollTop = 0
  document.getElementById('screen-game')!.scrollTop = 0
}

function advanceStage(): void {
  if (!game.nextLevel()) return
  effects.clear()
  combo.hide()
  if (game.bonusRound) combo.reportEvent(varietyCopy().bonus[game.bonusRound])
}

async function showLevelComplete(level: number): Promise<void> {
  let earned: Settlement
  try { earned = await settleCurrent('cleared', Boolean(game.mission)) }
  catch { saveFailure(() => void showLevelComplete(level)); return }
  if (game.mission) {
    const m = game.mission, copy = worldCopy(), claim = earned
    const next = WORLD_MISSIONS.find(a => a.region === m.region && a.step === m.step + 1 && unlocked(campaign.state, a))
    overlay.show({
      kicker: missionCaption(m), title: copy.cleared, celebration: 'clear',
      growth: resultGrowth(earned),
      rewards: [
        {icon:'star',label:t('pointsBanked'),value:n(game.score)},
        {icon:'coin',label:t('starterCoins'),value:`+${claim.reward}`},
        {icon:'missions',label:'XP',value:`+${claim.xp}`},
        ...(claim.item?[{icon:claim.item,label:ITEM_LABELS[claim.item](),value:'+1'}]:[]),
      ],
      body: growthResult(earned),
      action: next && claim.ok ? copy.next : copy.back,
      onAction: next && claim.ok ? () => { world.select(next.id); startRun([], next) } : goHome,
      ...(next && claim.ok ? { secondary: { label: copy.back, onAction: goHome } } : {}),
    })
    return
  }
  const copy = varietyCopy()
  const choose = game.upgradeDue
  overlay.show({
    kicker: t('cleared'), celebration: 'clear', title: t('levelComplete', { level }),
    growth: resultGrowth(earned),
    hero: { value: n(game.score), caption: t('pointsBanked'), flair: t('itemEarned', { item: ITEM_LABELS[itemForLevel(level, game.rules)]() }) },
    body: growthResult(earned) + '\n' + nextLevelAsk(level + 1), action: choose ? copy.confirm : t('nextLevel'),
    onAction: advanceStage,
    ...(choose ? { choices: {
      legend: copy.choose,
      options: game.upgradeOptions.map(upgrade => ({ value: upgrade,
        label: `${copy.upgrade[upgrade]} · ${copy.tier(game.upgrades[upgrade] + 1)}`,
        detail: copy.detail(upgrade, game.upgrades[upgrade] + 1),
      })),
      onConfirm: (value: string) => { if (game.chooseUpgrade(value as Upgrade)) advanceStage() },
    } } : {}),
  })
}

document.getElementById('hud-character')!.addEventListener('click', () => {
  if (screens.active !== 'game' || pause.visible || document.hidden || endingRun) return
  sfx.unlock()
  if (game.activateFever()) { tray.arm(null); hud.update(game) }
})

async function startRun(boosters: readonly Item[] = [], mission: Mission | null = null): Promise<void> {
  if (startingRun) return
  startingRun = true
  const id = crypto.randomUUID()
  const seed = mission?.seed ?? seedFromUrl() ?? randomSeed()
  try {
    const kept = suspendedRun()
    if (kept?.attempt) await player.settle(kept.attempt, kept.record, kept.outcome ?? 'quit', true)
    await player.begin(id, true, 0, Date.now(), boosters, `${mission ? NEW_CAMPAIGN_RULES : NEW_FREE_RULES}:${seed >>> 0}:${mission?.id ?? ''}`)
  } catch {
    startingRun = false
    saveFailure(() => void startRun(boosters, mission))
    return
  }
  startingRun = false
  attemptId = id; manualEnd = false; lastSettlement = null; lastSettlementCursor = ''
  endingRun = false
  clearSuspended()
  effects.clear()
  combo.hide()
  combo.prepare()
  tray.arm(null)
  overlay.hide()
  if (screens.active === 'home' || screens.active === 'map') returnDestination = mission ? 'map' : screens.active
  if (mission) returnDestination = 'map'
  game.restart(seed, mission ? NEW_CAMPAIGN_RULES : NEW_FREE_RULES, mission?.id)
  resetPlayView()
  // Play again stays on the same screen, so its screen-change hook won't run.
  if (screens.active === 'game') hud.reset()

  // Applied before anything else touches the board, because the record only
  // accepts a booster at its head — and taken out of the stash here, so a run
  // that is abandoned still costs what it carried.
  const carried: Item[] = []
  for (const item of (player.persistent ? boosters : []).slice(0, BOOSTER_LIMIT)) {
    if (game.addBooster(item, BOOSTER_LIMIT)) carried.push(item)
  }
  shop.refresh()

  screens.show('game')
  if (game.bonusRound) combo.reportEvent(varietyCopy().bonus[game.bonusRound])
  hud.invalidate()
  renderer.resize()
  canvas.focus({ preventScroll: true })
}

function goHome(): void {
  endingRun = false
  commitRecord()
  shop.refresh()
  effects.clear()
  combo.hide()
  tray.arm(null)
  overlay.hide()
  pause.hide()
  screens.show(returnDestination)
  world.refresh()
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
  suspendRun(settledRecordOf(game), attemptId)
  goHome()
}

/**
 * Resumes a kept run by replaying it. Returns false when the save will not
 * replay — an older version of the rules, or an edited one — in which case the
 * player is told rather than dropped onto a board that is not theirs.
 */
async function continueRun(): Promise<boolean> {
  const kept = suspendedRun()
  if (!kept) return false

  effects.clear()
  combo.hide()
  combo.prepare()
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

  // Old saves have no UUID. A stable digest prevents reopening the same legacy result
  // from becoming a new rewarded attempt; genuinely new runs still get fresh UUIDs.
  const digest = kept.attempt ? '' : [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(kept.record))))].map(b => b.toString(16).padStart(2, '0')).join('')
  attemptId = kept.attempt ?? `legacy-${digest}`
  lastSettlement = null; manualEnd = kept.outcome === 'quit'
  // A completed legacy mission may already have received the one-time XP
  // migration. Reopening that cached result is not a genuine new replay.
  const legacyBaseline = game.mission
    ? Number(game.status === 'levelComplete' && player.state.campaign.completed[game.mission.id] !== undefined)
    : game.level - 1
  try { await player.begin(attemptId, Boolean(kept.attempt), kept.attempt ? 0 : legacyBaseline, Date.now(), [], `${game.rules}:${game.seed >>> 0}:${game.mission?.id ?? ''}`) }
  catch { saveFailure(() => void continueRun()); return false }
  if (game.mission) { returnDestination = 'map'; world.select(game.mission.id) }
  else returnDestination = screens.active === 'home' ? 'home' : 'map'
  resetPlayView()
  screens.show('game')
  renderer.resize()
  canvas.focus({ preventScroll: true })
  if (game.status === 'levelComplete') showLevelComplete(game.level)
  else if (kept.outcome === 'quit') game.endRun()
  else if (game.status === 'gameOver') void finishRun(game.score)
  return true
}

/** Shows or hides the launch screen's Continue button. */
function paintContinue(): void {
  world.refresh()
  const kept = suspendedRun()
  const button = document.getElementById('continue-run')
  const sub = document.getElementById('continue-sub')
  if (!button) return
  button.hidden = kept === null
  if (kept && sub) {
    const mission = missionOf(kept.record)
    sub.textContent = mission ? missionCaption(mission) : t('continueSub', { level: kept.level, score: n(kept.score) })
  }
}

screens.onChange((name) => {
  document.documentElement.classList.toggle('game-open', name === 'game')
  document.documentElement.classList.toggle('map-open', name === 'map')
  if (name === 'map') world.refresh()
  if (name === 'home') lobby.show()
  else lobby.hide()
  hud.reset()
  if (name !== 'creator') creator.close()
  // The canvas is zero-sized while the screen is hidden, so it has to be
  // re-measured on the way back in rather than waiting for a resize event.
  if (name === 'game') renderer.resize()
})

for (const id of ['continue-run', 'map-continue']) document.getElementById(id)?.addEventListener('click', (event) => {
  sfx.unlock()
  // Restoring is a replay, and a replay of a long run is not instant — roughly
  // six milliseconds an action, so a couple of hundred moves is over a second
  // of a synchronous loop. Say so and give the browser a frame to paint it,
  // because a button that does nothing for a second has been pressed twice.
  const button = event.currentTarget as HTMLButtonElement
  const label = button.querySelector<HTMLElement>('#map-continue-label, [data-i18n="continueRun"]')!
  const text = label.textContent
  button.disabled = true
  button.setAttribute('aria-busy', 'true')
  label.textContent = t('restoring')
  requestAnimationFrame(() => {
    requestAnimationFrame(async () => {
      try { await continueRun() }
      finally {
        // Refresh can update the saved mission while restoring. Keep these
        // labelled nodes mounted rather than replacing the button's subtree.
        button.disabled = false
        button.removeAttribute('aria-busy')
        label.textContent = text
        paintContinue()
      }
    })
  })
})

document.getElementById('start-game')?.addEventListener('click', () => {
  requestNewRun()
})
function requestNewRun(mission: Mission | null = null): void {
  if (mission && !unlocked(campaign.state, mission)) return
  sfx.unlock()
  const kept = suspendedRun()
  if (!kept) {
    loadout.show((picked) => startRun(picked, mission))
    return
  }
  // A new run overwrites the kept one, so it is asked for rather than assumed.
  overlay.show({
    kicker: t('runWaiting'),
    title: missionOf(kept.record) ? missionCaption(missionOf(kept.record)!) : t('levelN', { level: kept.level }),
    body: t('runWaitingBody', { score: n(kept.score) }),
    action: t('startANewRun'),
    onAction: () => {
      // Confirmation permits replacing the old run, but cancellation of the
      // preparation dialog still keeps it. Only startRun clears the old save.
      loadout.show((picked) => startRun(picked, mission))
    },
    secondary: { label: t('continueThatOne'), onAction: () => continueRun() },
  })
}

document.getElementById('map-character')!.addEventListener('click', () => screens.show('home'))
document.getElementById('lobby-map')!.addEventListener('click', () => screens.show('map'))
document.getElementById('map-freeplay')!.addEventListener('click', () => requestNewRun())
document.getElementById('map-profile')!.addEventListener('click', () => profile.open())
document.getElementById('map-ranks')!.addEventListener('click', () => { ranksSheet.show(document.getElementById('ranks-title')!); void home.refresh() })
document.getElementById('map-today')!.addEventListener('click', () => today.open())
for (const id of ['map-shop', 'map-wallet']) document.getElementById(id)!.addEventListener('click', () => {
  if (screens.active === 'shop') return
  shopDestination = screens.active === 'home' ? 'home' : 'map'
  shopTrigger = id
  shop.reset(); screens.show('shop')
})

document.getElementById('open-ranks')?.addEventListener('click', () => {
  ranksSheet.show(document.getElementById('ranks-title')!)
  // Refreshed on the way in rather than on a timer: the board is only worth a
  // network round trip at the moment somebody asks to look at it.
  void home.refresh()
})

document.getElementById('open-shop')?.addEventListener('click', () => {
  shopDestination = 'home'
  shopTrigger = 'map-shop'
  shop.reset()
  screens.show('shop')
})
document.getElementById('shop-back')?.addEventListener('click', () => {
  screens.show(shopDestination)
  document.getElementById(shopTrigger)?.focus({ preventScroll: true })
  shop.refresh()
  void home.refresh()
})
document.getElementById('pause')?.addEventListener('click', () => {
  const copy = varietyCopy(), held = Object.entries(game.upgrades).filter(([, tier]) => tier > 0)
  const upgrades = document.getElementById('run-upgrades')!
  upgrades.hidden = held.length === 0
  upgrades.textContent = held.map(([upgrade, tier]) => `${copy.upgrade[upgrade as Upgrade]} · ${copy.tier(tier)}`).join(' / ')
  // Deliberately not gated on the board being still. A pause that only opens
  // between cascades is a pause that refuses exactly when someone is trying to
  // put their phone down. Freeze the loop while its sheet (or nested help) is
  // open, so a level-result modal cannot replace a pause in the background.
  pause.show(game.level, game.score, {
    resume: () => {},
    keep: () => keepRun(),
    // Ending banks the score and pays the run out, which is what leaving used
    // to skip: a level-24 run abandoned from the old footer earned nothing.
    end: () => { manualEnd = true; endingRun = true },
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
applySound(soundOn())
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

const rulesHelp = new RulesHelp()
document.getElementById('map-settings')!.addEventListener('click', () => settings.show())
const boardViewport = new BoardViewport()

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
  paintContinue()
  profile.paintCard()
  paintPlayText()
  rulesHelp.paint()
  boardViewport.paint()
  if (screens.active === 'game' && game.status === 'levelComplete') showLevelComplete(game.level)

  today.refresh()
  shop.refresh()
  packs.refresh()
  void home.refresh()
  world.refresh()
}
applyLanguage()
function paintPlayText(): void {
  document.getElementById('help-variety')!.textContent = varietyCopy().help
  document.getElementById('board-scroll-hint')!.textContent = experienceCopy().scrollBoard
  document.querySelector('[data-i18n="helpLT"]')!.textContent = playCopy().square
  document.getElementById('pause')!.setAttribute('aria-label', playCopy().exit)
  document.getElementById('pause')!.title = playCopy().exit
}
paintPlayText()
document.getElementById('lobby-edit')!.addEventListener('click', () => {
  creator.open()
  screens.show('creator')
})
onLanguageChange(repaintText)

const resizeBoard = () => {
  if (renderer.resize()) effects.clear()
}
const observer = new ResizeObserver(resizeBoard)
observer.observe(canvas)
// Native media queries change before the frame-coalesced shell variables.
// A phone and desktop may share the same final canvas size, so ResizeObserver
// will not repair a backing store measured during that intermediate layout.
// Measure after the shell frame, independent of resize/orientation event order.
let boardResizePending = false
const scheduleBoardResize = () => {
  if (boardResizePending) return
  boardResizePending = true
  requestAnimationFrame(() => requestAnimationFrame(() => {
    boardResizePending = false
    resizeBoard()
  }))
}
window.addEventListener('resize', scheduleBoardResize)
window.addEventListener('orientationchange', scheduleBoardResize)
window.addEventListener('pagehide', () => {
  commitRecord()
  // Phones evict backgrounded tabs without warning, and a run is the one thing
  // here that cannot be rebuilt from anything else. Keeping it costs a string.
  if (runInProgress()) suspendRun(settledRecordOf(game), attemptId)
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
      moves: () => findMoves(game.geom, game.grid, game.rules),
      best: () => bestMove(game),
      renderer,
      effects,
      combo,
      overlay,
      sfx,
      screens,
      player,
      world,
      hub,
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
  const registerOffline = () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  }
  // Player storage opens asynchronously; load may already have fired.
  if (document.readyState === 'complete') registerOffline()
  else window.addEventListener('load', registerOffline, { once: true })
}

let previous = performance.now()
let time = 0
let feverReadyNotified = false

function frame(now: number): void {
  // Clamped so a backgrounded tab does not resolve the whole board on return.
  const dt = Math.min(0.05, (now - previous) / 1000)
  previous = now

  if (screens.active === 'game' && !pause.visible && !document.hidden) {
    time += dt
    game.update(dt)
    const boardBusy = String(game.phaseKind !== 'idle')
    if (canvas.getAttribute('aria-busy') !== boardBusy) canvas.setAttribute('aria-busy', boardBusy)
    if (endingRun && game.phaseKind === 'idle') {
      endingRun = false
      game.endRun()
    }
    effects.update(dt)
    combo.update(dt)
    renderer.settle(dt)
    renderer.draw(game, effects, time)
    hud.update(game, displayBest())
    const feverReady = game.rules >= 4 && game.feverCharge >= 100 && !game.busy
    if (game.feverCharge < 100 || game.rules < 4) feverReadyNotified = false
    if (feverReady && !feverReadyNotified) { combo.reportEvent(varietyCopy().charged); feverReadyNotified = true }
    tray.update(game.items, game.busy || game.status !== 'playing')
    const fusionAvailable = game.fusionPartners.length > 0
    combo.fusionHint(!tray.armed && !game.busy && (fusionAvailable || !!game.bonusRound),
      fusionAvailable ? t('fusionHint') : game.bonusRound ? varietyCopy().bonusCue[game.bonusRound] : t('fusionHint'))
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
const granted = await grantStoredStarterKit().catch(() => null)
shop.refresh()
today.refresh()
paintContinue()
paintLevel()
void home.refresh()

let welcomePending = granted !== null

/**
 * The starter-kit card used to appear while the splash still covered the
 * lobby, which meant the first thing a new player dismissed was a gift they
 * could not see landing. It waits until the 3D character is actually on stage.
 */
function welcomeHome(): void {
  if (!welcomePending || !granted) return
  welcomePending = false
  overlay.show({
    kicker: t('welcome'),
    title: t('starterKit'),
    hero: { value: String(granted.coins), caption: t('starterCoins'), flair: t('starterItems') },
    body: t('starterBody'),
    action: t('gotIt'),
    onAction: () => {},
  })
}
document.documentElement.classList.toggle('map-open', screens.active === 'map')
hub.refresh()
if (screens.active === 'home') lobby.show()
else { splash.setProgress(100); void splash.finish(true) }
requestAnimationFrame(frame)
