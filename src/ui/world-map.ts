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
export class WorldMap {
  private selected = 'forest-1'
  private pins = el('world-pins')
  private missionButtons = el('world-missions')
  constructor(readonly progress: CampaignProgress, private play: (m: Mission) => void,
    private playerName: () => string) {
    const first = MISSIONS.find(m => unlocked(progress.state, m) && progress.state.completed[m.id] === undefined)
    if (first) this.selected = first.id
    for (const r of REGIONS) {
      const button = document.createElement('button')
      button.type = 'button'; button.className = `world-pin world-pin-${r}`; button.dataset.region = r
      button.addEventListener('click', () => this.selectRegion(r))
      this.pins.append(button)
    }
    const list = el('world-region-list')
    for (const r of REGIONS) {
      const button = document.createElement('button')
      button.type = 'button'; button.className = 'world-region-row'; button.dataset.listRegion = r
      button.addEventListener('click', () => this.selectRegion(r))
      list.append(button)
    }
    for (let step = 1; step <= 5; step++) {
      const button = document.createElement('button')
      button.type = 'button'; button.className = 'world-mission'; button.dataset.missionStep = String(step)
      button.addEventListener('click', () => this.select(`${this.mission.region}-${step}`))
      this.missionButtons.append(button)
    }
    el('world-play').addEventListener('click', () => {
      if (unlocked(progress.state, this.mission)) this.play(this.mission)
    })
    el('world-image').addEventListener('error', () => el('world-art').classList.add('art-unavailable'))
    onLanguageChange(() => this.refresh())
    window.addEventListener('storage', event => {
      // Other tabs may complete missions; reload only the ledger, never a run.
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
    this.selected = id
    this.refresh()
  }
  private selectRegion(region: Region): void {
    const missions = MISSIONS.filter(m => m.region === region)
    this.select((missions.find(m => unlocked(this.progress.state, m) && this.progress.state.completed[m.id] === undefined) ?? missions[0]!).id)
  }
  refresh(): void {
    const copy = worldCopy(), m = this.mission, state = this.progress.state
    el('world-heading').textContent = copy.world
    el('world-subtitle').textContent = copy.explore
    const count = Object.keys(state.completed).length
    el('world-progress').textContent = `${count}/20 ${copy.progress}`
    el('world-progress').setAttribute('aria-label', `${count}/20 ${copy.missions} ${copy.complete}`)
    el('map-coins').textContent = n(coins())
    el('map-name').textContent = this.playerName() || t('defaultName')
    paintAvatar(el('map-avatar') as HTMLCanvasElement, myAvatar(), 56, { round: true })
    el('map-profile').setAttribute('aria-label', t('profileAria'))
    el('map-settings').setAttribute('aria-label', t('settings')); el('map-settings').title = t('settings')
    el('world-pins').setAttribute('aria-label', copy.explore)
    el('map-nav-current').parentElement!.setAttribute('aria-label', copy.world)
    el('world-list-label').textContent = copy.list
    for (const r of REGIONS) {
      const regionMissions = MISSIONS.filter(a => a.region === r)
      const done = regionMissions.filter(a => state.completed[a.id] !== undefined).length
      const open = unlocked(state, regionMissions[0]!)
      const status = done === 5 ? copy.complete : open ? copy.available : copy.locked
      const button = this.pins.querySelector<HTMLButtonElement>(`[data-region="${r}"]`)!
      button.setAttribute('aria-pressed', String(r === m.region))
      button.dataset.state = open ? done === 5 ? 'complete' : 'available' : 'locked'
      const title = document.createElement('strong'); title.textContent = copy.regions[r]
      const meta = document.createElement('span'); meta.textContent = `${open ? done === 5 ? '✓' : mark[r] : '⌑'} ${done}/5 · ${status}`
      button.replaceChildren(title, meta)
      const row = el('world-region-list').querySelector<HTMLButtonElement>(`[data-list-region="${r}"]`)!
      row.textContent = `${copy.regions[r]} · ${done}/5 · ${status}`
      row.setAttribute('aria-pressed', String(r === m.region))
    }
    el('world-region').textContent = copy.regions[m.region]
    el('world-rule').textContent = copy.rules[m.region]
    this.missionButtons.setAttribute('aria-label', `${copy.regions[m.region]} ${copy.missions}`)
    for (const button of this.missionButtons.querySelectorAll<HTMLButtonElement>('button')) {
      const next = missionFor(`${m.region}-${button.dataset.missionStep}`)!
      const done = state.completed[next.id] !== undefined, ready = unlocked(state, next)
      const status = done ? copy.complete : ready ? copy.available : copy.locked
      button.textContent = `${next.step}${done ? ' ✓' : ready ? '' : ' ·'}`
      button.dataset.state = done ? 'complete' : ready ? 'available' : 'locked'
      button.setAttribute('aria-pressed', String(next.id === m.id))
      button.setAttribute('aria-label', `${next.step}. ${missionTitle(next)} · ${status}`)
    }
    el('world-mission-title').textContent = `${m.step}. ${missionTitle(m)}`
    el('world-current').textContent = `${copy.regions[m.region]} · ${m.step}. ${missionTitle(m)}`
    el('world-start-rule').textContent = copy.rules[m.region]
    const goal = m.goal
    el('world-goal').textContent = goal.kind === 'score' ? t('askScore', { level: m.step, need: n(goal.need), moves: m.moves })
      : goal.kind === 'power' ? t('askPower', { level: m.step, need: goal.need, moves: m.moves })
      : t('askGems', { level: m.step, need: goal.need, moves: m.moves, colour: gemName(goal.colour) })
    el('world-start-goal').textContent = el('world-goal').textContent
    el('world-reward').textContent = state.completed[m.id] === undefined ? `${copy.reward} +${m.reward}` : copy.complete
    el('world-supply').textContent = copy.supplies
    const ready = unlocked(state, m), completed = state.completed[m.id] !== undefined
    const play = el('world-play') as HTMLButtonElement
    play.disabled = !ready
    play.textContent = completed ? copy.replay : copy.play
    el('world-note').textContent = count === 20 ? copy.chapterDone : !ready ? m.step === 1 ? copy.unlock : copy.previous
      : !this.progress.persistent ? copy.storage : completed ? copy.replayNote : ''
    el('world-start-note').textContent = !ready || !this.progress.persistent ? el('world-note').textContent : ''
    el('map-character').querySelector('span:last-child')!.textContent = copy.character
    el('map-nav-current').querySelector('span:last-child')!.textContent = copy.map
    el('map-shop').querySelector('span:last-child')!.textContent = t('quickShop')
    el('map-ranks').textContent = t('quickRanks'); el('map-today').textContent = t('quickToday')
    el('map-freeplay').textContent = copy.free
    el('lobby-map').textContent = copy.map
    const kept = suspendedRun()
    el('map-continue').hidden = !kept
    el('map-continue-label').textContent = t('continueRun')
    el('map-continue-sub').textContent = kept ? missionOf(kept.record) ? missionCaption(missionOf(kept.record)!)
      : t('continueSub', { level: kept.level, score: n(kept.score) }) : ''
  }
}
