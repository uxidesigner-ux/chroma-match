import type { Screens } from './screens.ts'
import type { WorldMap } from './world-map.ts'
import type { ProfileCard } from './profile.ts'
import type { Shop } from './shop.ts'
import { player } from '../player/ledger.ts'
import { levelFor } from '../player/model.ts'
import { growthCopy } from './growth-copy.ts'
import { onLanguageChange, t } from '../i18n/index.ts'
import { paintRank } from './profile-rank.ts'

/** The same mounted HUD/navigation survives map, character and shop switches. */
export class Hub {
  private header = document.querySelector<HTMLElement>('.world-header')!
  private nav = document.querySelector<HTMLElement>('.world-nav')!
  constructor(private screens: Screens, private world: WorldMap, _profile: ProfileCard, _shop: Shop) {
    const app = document.querySelector('.app')!
    this.header.classList.add('hub-header'); this.nav.classList.add('hub-nav')
    app.append(this.header, this.nav)
    new ResizeObserver(() => {
      const height = this.header.getBoundingClientRect().height
      if (height) document.documentElement.style.setProperty('--hub-header-height', `${Math.ceil(height)}px`)
    }).observe(this.header)
    const profile = document.getElementById('map-profile')!
    const badge = document.createElement('span'); badge.id = 'hub-level'; badge.className = 'level-badge'
    const xp = document.createElement('span'); xp.id = 'hub-xp'; xp.className = 'xp-track'; xp.setAttribute('aria-hidden', 'true')
    xp.append(document.createElement('i'))
    profile.append(badge)
    document.getElementById('map-name')!.after(xp)
    const title = document.createElement('span'); title.id = 'hub-title'
    document.getElementById('map-name')!.after(title)
    document.getElementById('world-list-label')!.addEventListener('click', event => {
      if (screens.active !== 'map') { event.preventDefault(); screens.show('map') }
    })
    screens.onChange(() => this.refresh())
    onLanguageChange(() => this.refresh())
    this.refresh()
  }
  refresh(): void {
    const active = this.screens.active, visible = active === 'map' || active === 'home' || active === 'shop'
    this.header.hidden = !visible; this.nav.hidden = !visible
    document.documentElement.classList.toggle('hub-open', visible)
    for (const [id, screen] of [['world-list-label', 'map'], ['map-character', 'home'], ['map-shop', 'shop']]) {
      const node = document.getElementById(id!)!
      if (active === screen) node.setAttribute('aria-current', 'page')
      else node.removeAttribute('aria-current')
    }
    this.world.refresh()
    const progress = levelFor(player.state.growth.totalXp)
    document.getElementById('hub-level')!.textContent = `Lv.${progress.level}`
    document.getElementById('hud-player-level')!.textContent = `Lv.${progress.level}`
    paintRank(document.getElementById('map-profile')!,document.getElementById('hub-level')!,progress.level)
    paintRank(document.querySelector('.hud-face')!,document.getElementById('hud-player-level')!,progress.level)
    document.getElementById('hud-character')!.dataset.frame = player.state.growth.frame
    document.querySelector<HTMLElement>('#hub-xp > i')!.style.setProperty('--xp', String(progress.xp / progress.need))
    document.getElementById('map-profile')!.setAttribute('aria-label', `${t('profileAria')} · ${growthCopy().level} ${progress.level}, ${progress.xp}/${progress.need} XP`)
    this.header.dataset.frame = player.state.growth.frame
    const title = player.state.growth.title
    document.getElementById('hub-title')!.textContent = title ? growthCopy().names[title as keyof ReturnType<typeof growthCopy>['names']] : ''
    document.getElementById('hub-title')!.hidden = !title
  }
}
