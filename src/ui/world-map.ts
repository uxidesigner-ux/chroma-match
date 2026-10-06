import { WORLD_MISSIONS, REGIONS, missionFor, missionMode, type Region, type Mission } from '../game/campaign.ts'
import { CampaignProgress, unlocked } from '../campaign-progress.ts'
import { myAvatar, paintAvatar } from '../avatar/store.ts'
import { coins } from '../meta.ts'
import { n, onLanguageChange, t } from '../i18n/index.ts'
import { gemName } from '../i18n/gems.ts'
import { missionOf } from '../game/replay.ts'
import { suspendedRun } from '../suspend.ts'
import { missionTitle, worldCopy, missionCaption } from './world-copy.ts'
import { MapCamera, type MapPoint } from './map-camera.ts'
import { varietyCopy } from './variety-copy.ts'
import { MapLife } from './map-life.ts'
import { icon, type GameIcon } from './game-icons.ts'
import { regionContour } from './region-art.ts'

const el = (id: string) => document.getElementById(id)!
const regionIcon: Record<Region,GameIcon> = {forest:'map',volcano:'bomb',prism:'star',relay:'gear'}
const forestPath: readonly (readonly [number,number])[] = [[.58,.82],[.56,.785],[.53,.752],[.49,.72],[.455,.686],
  [.442,.65],[.465,.62],[.51,.597],[.56,.58],[.61,.56],[.646,.53],[.65,.50],[.62,.469],[.567,.447],[.51,.430],
  [.455,.423],[.398,.415],[.353,.393],[.349,.365],[.377,.343],[.422,.326],[.478,.309],[.533,.293],[.562,.271],
  [.605,.252],[.654,.236],[.653,.211],[.616,.188],[.588,.166],[.589,.126]]
const landmark: Record<Region, MapPoint> = { forest: {x:.28,y:.24}, volcano: {x:.75,y:.25}, prism: {x:.24,y:.60}, relay: {x:.74,y:.60} }
export function pointFor(mission: Mission): MapPoint {
  if (mission.region === 'forest') { const [x,y] = forestPath[mission.step-1]!; return {x,y} }
  const origin = landmark[mission.region], row=Math.floor((mission.step-1)/5), column=(mission.step-1)%5
  return {x:origin.x+((row%2?4-column:column)-2)*.057,y:origin.y+.165-row*.061}
}

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
  private camera: MapCamera
  private glow=document.createElement('div')

  constructor(readonly progress: CampaignProgress, private play: (m: Mission) => void,
    private playerName: () => string) {
    this.knownClears = new Set(Object.keys(progress.state.completed))
    const first = WORLD_MISSIONS.find(m => unlocked(progress.state, m) && progress.state.completed[m.id] === undefined)
    if (first) this.selected = first.id
    try { const stored = localStorage.getItem('chroma-match:map-stage'); if (missionFor(stored)) this.selected = stored! } catch { /* session selection */ }
    for (const r of REGIONS) {
      const button = document.createElement('button')
      button.type = 'button'; button.className = `world-pin world-pin-${r}`; button.dataset.region = r
      button.style.left = `${landmark[r].x*100}%`; button.style.top = `${landmark[r].y*100}%`
      button.addEventListener('click', () => this.selectRegion(r))
      this.pins.append(button)
      const row = document.createElement('button')
      row.type = 'button'; row.className = 'world-region-row'; row.dataset.listRegion = r
      row.addEventListener('click', () => {
        this.selectRegion(r); this.regionList.open = false; el('world-list-label').focus()
      })
      el('world-region-list').append(row)
    }
    const art = el('world-art'), plane = document.createElement('div')
    art.removeAttribute('aria-hidden'); plane.className = 'world-plane'
    this.glow.className='region-glow'; this.glow.setAttribute('aria-hidden','true')
    plane.append(el('world-image'), this.glow, this.pins, document.querySelector('.world-journey')!)
    art.append(plane)
    this.camera = new MapCamera(art, plane, () => this.overview())
    art.addEventListener('mapfocus', () => { this.camera.focus(pointFor(this.mission), this.camera.mode === 'world'); this.refresh() })
    art.addEventListener('mapresize', () => this.refresh())
    el('world-play').addEventListener('click', () => {
      if (unlocked(progress.state, this.mission)) this.play(this.mission)
    })
    const image = el('world-image') as HTMLImageElement
    image.draggable = false
    new MapLife(image, plane, el('screen-map'))
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
    this.refresh()
  }
  get mission(): Mission { return missionFor(this.selected)! }
  overview(): void { this.camera.overview(); this.refresh() }
  select(id: string): void {
    if (!missionFor(id)) return
    const changed = this.selected !== id
    const regionChanged = this.mission.region !== missionFor(id)!.region
    this.selected = id
    try { localStorage.setItem('chroma-match:map-stage', id) } catch { /* session selection */ }
    this.camera.focus(pointFor(this.mission), regionChanged || this.camera.mode === 'world')
    this.refresh()
    if (changed && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.missionButtons.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.animate(
        [{ opacity: .7 }, { opacity: 1 }],
        { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' },
      )
    }
  }
  private selectRegion(region: Region): void {
    const missions = WORLD_MISSIONS.filter(m => m.region === region)
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
    const missions = WORLD_MISSIONS.filter(a => a.region === m.region)
    const image = el('world-image') as HTMLImageElement
    const src = `${import.meta.env.BASE_URL}${this.camera.mode === 'region' && m.region === 'forest' ? 'chroma-forest-v3.webp' : this.camera.mode === 'world' && this.camera.wide ? 'chroma-world-wide-v3.webp' : 'chroma-world-v3.webp'}`
    if (image.getAttribute('src') !== src) image.src = src
    this.glow.style.clipPath=regionContour(m.region,this.camera.wide&&this.camera.mode==='world')
    this.glow.style.backgroundImage=`url("${src}")`
    this.glow.dataset.selectionRegion=m.region
    const centre=landmark[m.region]
    this.glow.style.setProperty('--glow-x',`${centre.x*100}%`)
    this.glow.style.setProperty('--glow-y',`${(this.camera.wide?m.region==='forest'||m.region==='volcano'?.25:.70:centre.y)*100}%`)
    // Same-sized regions still have different node identities. Reusing a
    // focused forest node prevented a later regional focus event from firing.
    if (this.missionButtons.dataset.missionRegion !== m.region || this.missionButtons.childElementCount !== missions.length) {
      this.missionButtons.dataset.missionRegion=m.region
      this.missionButtons.replaceChildren()
      for (const mission of missions) {
        const button = document.createElement('button')
        button.type = 'button'; button.className = 'world-mission'; button.dataset.missionStep = String(mission.step)
        button.addEventListener('click', () => this.select(`${this.mission.region}-${button.dataset.missionStep}`))
        button.addEventListener('focus', () => {
          this.camera.reveal(pointFor(missionFor(`${this.mission.region}-${button.dataset.missionStep}`)!),button.matches(':focus-visible'))
        })
        this.missionButtons.append(button)
      }
    }
    const svg = document.querySelector<SVGSVGElement>('.world-track')!
    svg.setAttribute('viewBox','0 0 1024 1536')
    const points = missions.map(pointFor)
    const segments = points.slice(1).map((p,i) => `M${points[i]!.x*1024} ${points[i]!.y*1536} L${p.x*1024} ${p.y*1536}`)
    document.querySelector<SVGPathElement>('.world-track-base')!.setAttribute('d',segments.join(' '))
    const earned = el('world-track-earned')
    if (earned.childElementCount !== segments.length) {
      earned.replaceChildren(...segments.map(() => document.createElementNS('http://www.w3.org/2000/svg','path')))
    }
    earned.querySelectorAll('path').forEach((p,i) => p.setAttribute('d',segments[i]!))
    el('screen-map').dataset.activeRegion = m.region
    el('world-heading').textContent = copy.world
    el('world-progress').textContent = `${count}/${WORLD_MISSIONS.length}`
    el('world-progress').setAttribute('aria-label', `${count}/${WORLD_MISSIONS.length} ${copy.missions} ${copy.complete}`)
    el('map-coins').textContent = n(balance)
    el('map-name').textContent = this.playerName() || t('defaultName')
    paintAvatar(el('map-avatar') as HTMLCanvasElement, myAvatar(), 56, { round: true })
    if (!el('map-profile').querySelector('#hub-level')) el('map-profile').setAttribute('aria-label', t('profileAria'))
    el('map-wallet').setAttribute('aria-label', `${t('quickShop')}, ${n(balance)}`)
    el('map-settings').setAttribute('aria-label', t('settings')); el('map-settings').title = t('settings')
    this.pins.setAttribute('aria-label', copy.list)
    el('world-list-label').setAttribute('aria-label', `${copy.map}, ${copy.list}`)
    el('world-list-label').title = copy.list
    for (const r of REGIONS) {
      const regionMissions = WORLD_MISSIONS.filter(a => a.region === r)
      const done = regionMissions.filter(a => state.completed[a.id] !== undefined).length
      const open = unlocked(state, regionMissions[0]!)
      const status = done === regionMissions.length ? copy.complete : open ? copy.available : copy.locked
      const button = this.pins.querySelector<HTMLButtonElement>(`[data-region="${r}"]`)!
      const original = { x: landmark[r].x, y: this.camera.wide && this.camera.mode === 'world' ? r === 'forest' || r === 'volcano' ? .26 : .56 : landmark[r].y }
      const position = this.camera.mode === 'world' ? this.camera.worldPosition(original, REGIONS.indexOf(r)) : original
      button.style.left = `${position.x*100}%`
      button.style.top = `${position.y*100}%`
      button.setAttribute('aria-pressed', String(r === m.region))
      button.dataset.state = open ? done === regionMissions.length ? 'complete' : 'available' : 'locked'
      const label = `${copy.regions[r]} · ${done}/${regionMissions.length} · ${status}${open ? '' : `. ${copy.unlock}`}`
      button.setAttribute('aria-label', label); button.title = label
      const badge = document.createElement('span'); badge.className = 'world-pin-badge'
      badge.setAttribute('aria-hidden', 'true'); badge.append(icon(({forest:'map',volcano:'bomb',prism:'star',relay:'gear'} as Record<Region,GameIcon>)[r]))
      const seal = document.createElement('span'); seal.className = 'world-pin-seal'
      if (!open || done === regionMissions.length) seal.append(icon(open?'check':'lock'))
      else seal.textContent = `${done}/${regionMissions.length}`
      if (!open) seal.classList.add('world-lock')
      badge.append(seal)
      button.replaceChildren(badge)
      const row = el('world-region-list').querySelector<HTMLButtonElement>(`[data-list-region="${r}"]`)!
      row.replaceChildren(icon(regionIcon[r]),document.createTextNode(`${done}/${regionMissions.length}`))
      row.setAttribute('aria-label',label)
      row.setAttribute('aria-pressed', String(r === m.region))
    }
    el('world-region').textContent = copy.regions[m.region]
    el('world-region-mark').replaceChildren(icon(regionIcon[m.region]))
    el('world-stage-number').textContent = `${m.step}/${missions.length}`
    this.missionButtons.setAttribute('aria-label', `${copy.regions[m.region]} ${copy.missions}`)
    let completed = 0
    for (const button of this.missionButtons.querySelectorAll<HTMLButtonElement>('button')) {
      const next = missionFor(`${m.region}-${button.dataset.missionStep}`)!
      const point = pointFor(next)
      button.style.setProperty('--node-x',`${point.x*100}%`); button.style.setProperty('--node-y',`${point.y*100}%`)
      const done = state.completed[next.id] !== undefined, ready = unlocked(state, next)
      if (done) completed++
      const status = done ? copy.complete : ready ? copy.available : copy.locked
      const number = document.createElement('span'); number.className = 'world-node-number'; number.textContent = String(next.step)
      const stateMark = document.createElement('span'); stateMark.className = 'world-node-state'
      stateMark.setAttribute('aria-hidden', 'true')
      if(done || !ready) stateMark.append(icon(done?'check':'lock'))
      if (!ready) stateMark.classList.add('world-lock')
      button.replaceChildren(number, stateMark)
      button.dataset.state = done ? 'complete' : ready ? 'available' : 'locked'
      button.setAttribute('aria-pressed', String(next.id === m.id))
      button.setAttribute('aria-label', `${next.step}. ${missionTitle(next)} · ${status}`)
      button.dataset.rule = missionMode(next) ?? 'standard'
      const mode = missionMode(next)
      if (mode) {
        const rule = document.createElement('span'); rule.className = 'world-node-rule'; rule.setAttribute('aria-hidden','true')
        rule.append(icon(mode === 'factory' ? 'bomb' : mode === 'festival' ? 'star' : 'shuffle')); button.append(rule)
      }
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
    const mode = missionMode(m)
    el('world-context').textContent = `${missionCaption(m)}. ${mode ? varietyCopy().bonusDetail[mode] : copy.rules[m.region]} ${caption} ${copy.supplies}`
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
    el('map-character').setAttribute('aria-label',copy.character);el('map-character').title=copy.character
    el('map-nav-current').textContent = copy.map
    el('map-shop').querySelector('span:last-child')!.textContent = t('quickShop')
    el('map-shop').setAttribute('aria-label',t('quickShop'));el('map-shop').title=t('quickShop')
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
    const source = this.camera.mode === 'region' && this.rewardSource?.region === this.mission.region
      ? this.missionButtons.querySelector(`[data-mission-step="${this.rewardSource.step}"]`)
      : this.pins.querySelector(`[data-region="${this.rewardSource?.region}"]`)
    const visible = source?.getClientRects().length ? source : this.pins.querySelector(`[data-region="${this.rewardSource?.region}"]`)
    const root = el('screen-map'), origin = (visible ?? el('map-wallet')).getBoundingClientRect()
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
