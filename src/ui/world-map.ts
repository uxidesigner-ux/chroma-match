import { MISSIONS, REGIONS, missionFor, type Region, type Mission } from '../game/campaign.ts'
import { CampaignProgress, unlocked } from '../campaign-progress.ts'
import { myAvatar, paintAvatar } from '../avatar/store.ts'
import { coins } from '../meta.ts'
import { n, onLanguageChange, t } from '../i18n/index.ts'
import { gemName } from '../i18n/gems.ts'
import { missionOf } from '../game/replay.ts'
import { suspendedRun } from '../suspend.ts'
import { missionTitle, worldCopy, missionCaption } from './world-copy.ts'

const el = (id: string) => document.getElementById(id)!
const mark: Record<Region, string> = { forest: '◆', volcano: '✹', prism: '✦', relay: '⚙' }
const positions = [[10, 118 / 220 * 100], [29, 20], [50, 145 / 220 * 100], [71, 42 / 220 * 100], [90, 114 / 220 * 100]] as const

/** Presentation only: the authored v6 missions, stock, saves and claims do not change. */
export class WorldMap {
  private selected = 'forest-1'
  private pins = el('world-pins')
  private missionButtons = el('world-missions')
  private knownClears: Set<string>
  private displayedCoins = coins()
  private pendingCoins = 0
  private rewardSource: Mission | undefined
  private regionList = document.querySelector<HTMLDetailsElement>('.world-list')!

  constructor(readonly progress: CampaignProgress, private play: (m: Mission) => void,
    private playerName: () => string) {
    this.knownClears = new Set(Object.keys(progress.state.completed))
    const first = MISSIONS.find(m => unlocked(progress.state, m) && progress.state.completed[m.id] === undefined)
    if (first) this.selected = first.id
    for (const r of REGIONS) {
      const button = document.createElement('button')
      button.type = 'button'; button.className = `world-pin world-pin-${r}`; button.dataset.region = r
      button.addEventListener('click', () => this.selectRegion(r))
      this.pins.append(button)
      const row = document.createElement('button')
      row.type = 'button'; row.className = 'world-region-row'; row.dataset.listRegion = r
      row.addEventListener('click', () => {
        this.selectRegion(r); this.regionList.open = false; el('world-list-label').focus()
      })
      el('world-region-list').append(row)
    }
    for (let step = 1; step <= 5; step++) {
      const button = document.createElement('button')
      const [x, y] = positions[step - 1]!
      button.type = 'button'; button.className = 'world-mission'; button.dataset.missionStep = String(step)
      button.style.setProperty('--node-x', `${x}%`); button.style.setProperty('--node-y', `${y}%`)
      button.addEventListener('click', () => this.select(`${this.mission.region}-${step}`))
      this.missionButtons.append(button)
    }
    el('world-play').addEventListener('click', () => {
      if (unlocked(progress.state, this.mission)) this.play(this.mission)
    })
    const image = el('world-image') as HTMLImageElement
    const unavailable = () => el('world-art').classList.add('art-unavailable')
    image.addEventListener('error', unavailable)
    image.addEventListener('load', () => el('world-art').classList.remove('art-unavailable'))
    // A high-priority image can fail before this module has loaded.
    if (image.complete && image.naturalWidth === 0) unavailable()
    document.addEventListener('pointerdown', event => {
      if (!this.regionList.contains(event.target as Node)) this.regionList.open = false
    })
    this.regionList.addEventListener('focusout', () => queueMicrotask(() => {
      if (!this.regionList.contains(document.activeElement)) this.regionList.open = false
    }))
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.regionList.open && !document.querySelector<HTMLElement>('.app')!.inert) {
        event.preventDefault(); this.regionList.open = false; el('world-list-label').focus()
      }
    })
    onLanguageChange(() => this.refresh())
    window.addEventListener('storage', event => {
      if (event.key === 'chroma-match:campaign-v1') {
        const fresh = new CampaignProgress(this.safeStorage())
        progress.state = fresh.state; progress.persistent = fresh.persistent
        this.refresh()
      }
    })
    this.refresh()
  }
  private safeStorage(): Storage | null { try { return localStorage } catch { return null } }
  get mission(): Mission { return missionFor(this.selected)! }
  select(id: string): void {
    if (!missionFor(id)) return
    const changed = this.selected !== id
    this.selected = id
    this.refresh()
    if (changed && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.missionButtons.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.animate(
        [{ transform: 'translate(-50%, -50%) scale(.92)' }, { transform: 'translate(-50%, -50%) scale(1)' }],
        { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' },
      )
    }
  }
  private selectRegion(region: Region): void {
    const missions = MISSIONS.filter(m => m.region === region)
    this.select((missions.find(m => unlocked(this.progress.state, m) && this.progress.state.completed[m.id] === undefined) ?? missions[0]!).id)
  }

  refresh(): void {
    const copy = worldCopy(), state = this.progress.state, balance = coins()
    const newClears = Object.keys(state.completed).filter(id => !this.knownClears.has(id))
    // Only a newly earned clear advances selection. Explicitly selecting a
    // completed node for replay, refreshing copy, and reload never override it.
    if (newClears.includes(this.selected)) {
      const next = missionFor(`${this.mission.region}-${this.mission.step + 1}`)
      if (next && unlocked(state, next)) this.selected = next.id
    }
    this.knownClears = new Set(Object.keys(state.completed))
    if (newClears.length && balance > this.displayedCoins) {
      this.pendingCoins += balance - this.displayedCoins
      this.rewardSource = missionFor(newClears[0]!) ?? undefined
    }
    this.displayedCoins = balance
    const m = this.mission, count = Object.keys(state.completed).length
    el('screen-map').dataset.activeRegion = m.region
    el('world-heading').textContent = copy.world
    el('world-progress').textContent = `${count}/20`
    el('world-progress').setAttribute('aria-label', `${count}/20 ${copy.missions} ${copy.complete}`)
    el('map-coins').textContent = n(balance)
    el('map-name').textContent = this.playerName() || t('defaultName')
    paintAvatar(el('map-avatar') as HTMLCanvasElement, myAvatar(), 56, { round: true })
    el('map-profile').setAttribute('aria-label', t('profileAria'))
    el('map-wallet').setAttribute('aria-label', `${t('quickShop')}, ${n(balance)}`)
    el('map-settings').setAttribute('aria-label', t('settings')); el('map-settings').title = t('settings')
    this.pins.setAttribute('aria-label', copy.list)
    el('world-list-label').setAttribute('aria-label', `${copy.map}, ${copy.list}`)
    el('world-list-label').title = copy.list
    for (const r of REGIONS) {
      const regionMissions = MISSIONS.filter(a => a.region === r)
      const done = regionMissions.filter(a => state.completed[a.id] !== undefined).length
      const open = unlocked(state, regionMissions[0]!)
      const status = done === 5 ? copy.complete : open ? copy.available : copy.locked
      const button = this.pins.querySelector<HTMLButtonElement>(`[data-region="${r}"]`)!
      button.setAttribute('aria-pressed', String(r === m.region))
      button.dataset.state = open ? done === 5 ? 'complete' : 'available' : 'locked'
      const label = `${copy.regions[r]} · ${done}/5 · ${status}${open ? '' : `. ${copy.unlock}`}`
      button.setAttribute('aria-label', label); button.title = label
      const badge = document.createElement('span'); badge.className = 'world-pin-badge'
      badge.setAttribute('aria-hidden', 'true'); badge.textContent = mark[r]
      const seal = document.createElement('span'); seal.className = 'world-pin-seal'
      seal.textContent = open ? done === 5 ? '✓' : `${done}/5` : ''
      if (!open) seal.classList.add('world-lock')
      badge.append(seal)
      const title = document.createElement('strong'); title.textContent = copy.regions[r]
      button.replaceChildren(badge, title)
      const row = el('world-region-list').querySelector<HTMLButtonElement>(`[data-list-region="${r}"]`)!
      row.textContent = `${mark[r]} ${copy.regions[r]} · ${done}/5 · ${status}`
      row.setAttribute('aria-pressed', String(r === m.region))
    }
    el('world-region').textContent = copy.regions[m.region]
    el('world-region-mark').textContent = mark[m.region]
    el('world-stage-number').textContent = `${m.step}/5`
    this.missionButtons.setAttribute('aria-label', `${copy.regions[m.region]} ${copy.missions}`)
    let completed = 0
    for (const button of this.missionButtons.querySelectorAll<HTMLButtonElement>('button')) {
      const next = missionFor(`${m.region}-${button.dataset.missionStep}`)!
      const done = state.completed[next.id] !== undefined, ready = unlocked(state, next)
      if (done) completed++
      const status = done ? copy.complete : ready ? copy.available : copy.locked
      const number = document.createElement('span'); number.className = 'world-node-number'; number.textContent = String(next.step)
      const stateMark = document.createElement('span'); stateMark.className = 'world-node-state'
      stateMark.setAttribute('aria-hidden', 'true'); stateMark.textContent = done ? '✓' : ''
      if (!ready) stateMark.classList.add('world-lock')
      button.replaceChildren(number, stateMark)
      button.dataset.state = done ? 'complete' : ready ? 'available' : 'locked'
      button.setAttribute('aria-pressed', String(next.id === m.id))
      button.setAttribute('aria-label', `${next.step}. ${missionTitle(next)} · ${status}`)
    }
    // Reveal complete node-to-node segments; transformed SVG dash lengths can
    // extend past the next node, falsely implying progress on another mission.
    el('world-track-earned').querySelectorAll<SVGPathElement>('path').forEach((path, i) => {
      path.style.opacity = completed > i ? '1' : '0'
    })
    const goal = m.goal
    const caption = goal.kind === 'score' ? t('askScore', { level: m.step, need: n(goal.need), moves: m.moves })
      : goal.kind === 'power' ? t('askPower', { level: m.step, need: goal.need, moves: m.moves })
      : t('askGems', { level: m.step, need: goal.need, moves: m.moves, colour: gemName(goal.colour) })
    el('world-context').textContent = `${missionCaption(m)}. ${copy.rules[m.region]} ${caption} ${copy.supplies}`
    const ready = unlocked(state, m), done = state.completed[m.id] !== undefined
    el('world-reward').textContent = done ? '✓' : `+${n(m.reward)}`
    el('world-loot').setAttribute('aria-label', done ? copy.complete : `${copy.reward} ${n(m.reward)}`)
    el('world-loot').dataset.claimed = String(done)
    const play = el('world-play') as HTMLButtonElement
    play.disabled = !ready
    el('world-play-label').textContent = !ready ? copy.locked : done ? copy.replay : copy.play
    play.setAttribute('aria-label', `${!ready ? copy.locked : done ? copy.replay : copy.play}, ${copy.regions[m.region]} ${m.step}`)
    // No idle prose. Only a prerequisite or a real persistence error occupies
    // this lane, and the full explanation remains in the accessible context.
    const prerequisite = m.step === 1 ? `${copy.regions.forest} 1` : `${copy.missions} ${m.step - 1}`
    el('world-note').textContent = !this.progress.persistent ? copy.storage : !ready ? copy.required.replace('{mission}', prerequisite) : ''
    el('world-note').hidden = !el('world-note').textContent
    el('map-character').querySelector('span:last-child')!.textContent = copy.character
    el('map-nav-current').textContent = copy.map
    el('map-shop').querySelector('span:last-child')!.textContent = t('quickShop')
    for (const [id, label] of [['map-ranks', t('quickRanks')], ['map-today', t('quickToday')], ['map-freeplay', copy.free]]) {
      el(id!).querySelector('.sr-only')!.textContent = label!
      el(id!).title = label!
    }
    el('lobby-map').textContent = copy.map
    const kept = suspendedRun()
    el('map-continue').hidden = !kept
    el('map-continue-label').textContent = t('continueRun')
    el('map-continue-sub').textContent = kept ? missionOf(kept.record) ? missionCaption(missionOf(kept.record)!)
      : t('continueSub', { level: kept.level, score: n(kept.score) }) : ''
    if (!el('screen-map').hidden && !document.querySelector<HTMLElement>('.app')!.inert && this.pendingCoins > 0) {
      this.animateCoins(); this.pendingCoins = 0; this.rewardSource = undefined
    }
  }

  private animateCoins(): void {
    if (document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // Coins leave the cleared node, never the next mission's unearned reward.
    const source = this.rewardSource?.region === this.mission.region
      ? this.missionButtons.querySelector(`[data-mission-step="${this.rewardSource.step}"]`)
      : this.pins.querySelector(`[data-region="${this.rewardSource?.region}"]`)
    const root = el('screen-map'), origin = (source ?? el('map-wallet')).getBoundingClientRect()
    const destination = el('map-wallet').getBoundingClientRect(), bounds = root.getBoundingClientRect()
    for (let i = 0; i < 5; i++) {
      const coin = document.createElement('span'); coin.className = 'coin world-reward-particle'; coin.setAttribute('aria-hidden', 'true')
      coin.style.left = `${origin.x + origin.width / 2 - bounds.x}px`
      coin.style.top = `${origin.y + origin.height / 2 - bounds.y}px`
      root.append(coin)
      const dx = destination.x + destination.width / 2 - origin.x - origin.width / 2
      const dy = destination.y + destination.height / 2 - origin.y - origin.height / 2
      const flight = coin.animate([
        { transform: 'translate(-50%, -50%) scale(.65)', opacity: 0 },
        { transform: `translate(${(i - 2) * 16}px, -40px) scale(1)`, opacity: 1, offset: .2 },
        { transform: `translate(${dx}px, ${dy}px) scale(.7)`, opacity: 1 },
      ], { duration: 560, delay: i * 45, easing: 'cubic-bezier(.2,.7,.3,1)' })
      void flight.finished.then(() => coin.remove(), () => coin.remove())
    }
    el('map-wallet').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 220, delay: 480 })
  }
}
