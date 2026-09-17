import { DAILY_REWARDS, claimDaily, dailyState } from '../daily.ts'
import type { DailyState } from '../daily.ts'
import { claimMission, todayMissions } from '../missions.ts'
import type { MissionKind, MissionState } from '../missions.ts'
import { Sheet } from './sheet.ts'
import { n, t } from '../i18n/index.ts'

/** An item's name in the current language, for the daily card's sentence. */
function itemName(item: string): string {
  if (item === 'hammer') return t('itemHammer')
  if (item === 'rocket') return t('itemRocket')
  return t('itemBomb')
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}

/** What each mission asks for, in the fewest words that are still specific. */
const ASK: Record<MissionKind, (need: number) => string> = {
  score: (need) => t('missionScore', { need: n(need) }),
  gems: (need) => t('missionGems', { need }),
  chain: (need) => t('missionChain', { need }),
  power: (need) => t('missionPower', { need }),
  item: (need) => t('missionItem', { need }),
  level: (need) => t('missionLevel', { need }),
}

/**
 * The daily reward and today's three missions.
 *
 * Both are read from storage every time this repaints rather than cached here,
 * for the same reason the shop reads its balance on demand: a mission finished
 * on the board two screens ago has to be finished on this one too, and a cached
 * copy is how that stops being true.
 */
export class TodayPanel {
  private row = el<HTMLButtonElement>('today-row')
  private summaryBadge = el('today-summary-badge')
  private sheet = new Sheet('sheet-today')
  private daily = el<HTMLButtonElement>('daily-claim')
  private dailyName = el('daily-name')
  private dailySub = el('daily-sub')
  private dailyTake = el('daily-take')
  private list = el<HTMLUListElement>('missions')
  private listeners: Array<() => void> = []

  /** Set while a claim card is up, so the reward is announced once. */
  private announce: ((state: DailyState) => void) | null = null

  constructor() {
    this.row.addEventListener('click', () => this.sheet.show())
    this.daily.addEventListener('click', () => {
      const claimed = claimDaily()
      this.refresh()
      if (!claimed) return
      for (const listener of this.listeners) listener()
      this.announce?.(claimed)
    })
  }

  /** Fires whenever coins or the stash changed, so the wallet can repaint. */
  onChange(listener: () => void): void {
    this.listeners.push(listener)
  }

  /** Where the daily card's copy goes when a reward is taken. */
  onDailyClaimed(announce: (state: DailyState) => void): void {
    this.announce = announce
  }

  refresh(): void {
    const daily = dailyState()
    const missions = todayMissions()
    this.paintDaily(daily)
    this.paintMissions(missions)
    this.paintSummary(daily, missions)
  }

  /**
   * The count on the closed button.
   *
   * All the button has room for now is a number, and a number is the only part
   * worth having at a glance: how many rewards are sitting there unclaimed.
   * Anything else — which day of the streak, how far along each mission is —
   * is a sentence, and a sentence belongs behind the tap.
   */
  private paintSummary(daily: DailyState, missions: readonly MissionState[]): void {
    const ready = (daily.available ? 1 : 0) + missions.filter((m) => m.done && !m.claimed).length
    this.summaryBadge.textContent = String(ready)
    this.summaryBadge.hidden = ready === 0
    this.row.classList.toggle('is-ready', ready > 0)
  }

  private paintDaily(state: DailyState): void {
    const last = DAILY_REWARDS.length
    this.dailyName.textContent = state.available
      ? t('dailyReward', { day: state.day })
      : t('dailyClaimed', { day: state.day })

    const item = state.reward.item ? t('dailyAndItem', { item: itemName(state.reward.item) }) : ''
    this.dailySub.textContent = state.available
      ? t(state.day === last ? 'dailySubFull' : 'dailySub', { coins: state.reward.coins, item })
      : t('dailyBack', { streak: state.streak, next: (state.day % last) + 1 })

    this.daily.disabled = !state.available
    this.daily.classList.toggle('is-ready', state.available)
    this.dailyTake.textContent = state.available ? t('claim') : '✓'
  }

  private paintMissions(missions: readonly MissionState[]): void {
    this.list.replaceChildren()
    for (const mission of missions) {
      const row = document.createElement('li')
      row.className = 'mission'
      if (mission.claimed) row.classList.add('is-claimed')
      else if (mission.done) row.classList.add('is-done')

      const text = document.createElement('span')
      text.className = 'mission-text'
      const ask = document.createElement('strong')
      ask.className = 'mission-ask'
      ask.textContent = ASK[mission.kind](mission.need)
      const count = document.createElement('span')
      count.className = 'mission-count'
      count.textContent = `${n(mission.progress)} / ${n(mission.need)}`
      text.append(ask, count)

      const bar = document.createElement('span')
      bar.className = 'mission-bar'
      const fill = document.createElement('span')
      fill.className = 'mission-fill'
      fill.style.width = `${Math.round((mission.progress / mission.need) * 100)}%`
      bar.append(fill)
      text.append(bar)

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'mission-claim btn btn-primary'
      if (mission.claimed) {
        button.textContent = '✓'
        button.disabled = true
      } else if (mission.done) {
        button.textContent = `+${mission.reward}`
      } else {
        // The reward is shown even while it is out of reach: it is what the
        // player is deciding whether to go after.
        button.textContent = `+${mission.reward}`
        button.disabled = true
      }
      button.addEventListener('click', () => {
        if (claimMission(mission.id) === 0) return
        this.refresh()
        for (const listener of this.listeners) listener()
      })

      row.append(text, button)
      this.list.append(row)
    }
  }
}
