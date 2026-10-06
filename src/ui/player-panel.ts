import { ALL_ITEMS } from '../game/items.ts'
import { player } from '../player/ledger.ts'
import { COSMETICS, levelFor, statsFor, type PlayMode } from '../player/model.ts'
import { growthCopy } from './growth-copy.ts'
import { n, onLanguageChange, t } from '../i18n/index.ts'
import { icon as gameIcon, type GameIcon } from './game-icons.ts'
import { paintRank, paintLevel, profileRankPreview } from './profile-rank.ts'

export class PlayerPanel {
  private root = document.createElement('div')
  private mode: PlayMode = 'adventure'
  private recent = false
  constructor() {
    this.root.id = 'player-panel'
    this.root.innerHTML = `<section class="growth-section" aria-labelledby="growth-heading">
      <div class="growth-heading"><h3 id="growth-heading"></h3><strong id="player-level"></strong></div>
      <progress class="growth-bar" id="player-xp"></progress><p class="growth-summary" id="player-xp-text"></p>
      <p class="growth-next" id="player-next"></p><p class="growth-local" id="player-local"></p>
      <details class="growth-collection"><summary id="cosmetics-heading"></summary><div class="cosmetic-list" id="player-cosmetics"></div></details>
    </section><section class="growth-section" aria-labelledby="stats-heading">
      <div class="growth-heading"><h3 id="stats-heading"></h3><span class="stats-sample" id="stats-sample"></span></div>
      <div class="stats-filters"><fieldset id="stats-mode"><legend class="sr-only" id="stats-mode-label"></legend>
        <button type="button" data-mode="adventure"></button><button type="button" data-mode="free"></button></fieldset>
        <fieldset id="stats-period"><legend class="sr-only" id="stats-period-label"></legend><button type="button" data-period="all"></button><button type="button" data-period="recent"></button></fieldset></div>
      <dl class="stats-grid" id="stats-grid"></dl><div class="stats-items" id="stats-items"></div>
      <button class="stats-reset" type="button" id="stats-reset"></button><div class="stats-confirm" id="stats-confirm" hidden>
        <p id="stats-confirm-text"></p><button class="btn btn-primary" type="button" id="stats-confirm-yes"></button><button class="btn btn-ghost" type="button" id="stats-confirm-no"></button>
      </div><p id="player-status" role="status" class="growth-summary"></p>
    </section>`
    document.getElementById('profile-edit')!.before(this.root)
    for (const key of ['used', 'average', 'chain', 'created', 'fusions', 'noItems']) {
      const row = document.createElement('div'), icon = document.createElement('span'), title = document.createElement('dt'), value = document.createElement('dd')
      icon.className = 'stats-icon'; icon.setAttribute('aria-hidden', 'true')
      icon.append(gameIcon(({used:'hammer',average:'missions',chain:'rocket',created:'star',fusions:'shuffle',noItems:'check'} as Record<string,GameIcon>)[key]!))
      title.id = `stats-${key}-label`; value.id = `stats-${key}`
      row.append(icon, title, value); this.el('stats-grid').append(row)
    }
    for (const item of ALL_ITEMS) {
      const group = document.createElement('span'), icon = document.createElement('span'), value = document.createElement('span')
      icon.className = `item-art item-${item}`; icon.setAttribute('aria-hidden','true'); value.id = `stats-item-${item}`
      group.append(icon,value); this.el('stats-items').append(group)
    }
    this.root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.addEventListener('click', () => { this.mode = button.dataset.mode as PlayMode; this.refresh() }))
    this.root.querySelectorAll<HTMLButtonElement>('[data-period]').forEach(button => button.addEventListener('click', () => { this.recent = button.dataset.period === 'recent'; this.refresh() }))
    this.el('stats-reset').addEventListener('click', () => { this.el('stats-confirm').hidden = false; this.el('stats-confirm-no').focus() })
    this.el('stats-confirm-no').addEventListener('click', () => { this.el('stats-confirm').hidden = true; this.el('stats-reset').focus() })
    this.el('stats-confirm-yes').addEventListener('click', async () => {
      const button = this.el('stats-confirm-yes') as HTMLButtonElement; button.disabled = true
      try { await player.resetStats(); this.el('stats-confirm').hidden = true; this.el('stats-reset').focus() }
      catch { this.el('player-status').textContent = growthCopy().saveError }
      finally { button.disabled = false }
    })
    onLanguageChange(() => this.refresh())
    this.refresh()
  }
  private el(id: string): HTMLElement { return this.root.querySelector<HTMLElement>(`#${id}`)! }
  refresh(): void {
    const copy = growthCopy(), state = player.state, p = levelFor(state.growth.totalXp)
    this.el('growth-heading').textContent = copy.level; this.el('player-level').textContent = `Lv.${n(p.level)}`
    const portrait=profileRankPreview()
    paintRank(portrait.surface,portrait.badge,p.level)
    portrait.surface.dataset.frame=state.growth.frame
    paintLevel(this.el('player-level'),p.level)
    const bar = this.el('player-xp') as HTMLProgressElement
    bar.value = p.xp; bar.max = p.need; bar.setAttribute('aria-label', `${copy.level} ${p.level}: ${p.xp}/${p.need} XP`)
    this.el('player-xp-text').textContent = `${n(p.xp)} / ${n(p.need)} XP`
    const next = COSMETICS.find(c => c.level > p.level)
    this.el('player-next').textContent = `${copy.next} · ${next ? `Lv.${next.level} ${copy.names[next.id]}` : `Lv.${p.level + 1} +20 ${t('starterCoins')}`}`
    this.el('player-local').textContent = copy.local
    this.el('cosmetics-heading').textContent = copy.cosmetics
    const focused = this.root.querySelector<HTMLButtonElement>('.cosmetic-list :focus')?.dataset.choice
    const list = this.el('player-cosmetics'); list.replaceChildren()
    for (const kind of ['frame', 'title'] as const) {
      for (const option of [{ id: '', level: 1, kind }, ...COSMETICS.filter(c => c.kind === kind)]) {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.choice = `${kind}:${option.id}`
        button.textContent = option.id ? `${copy.names[option.id as typeof COSMETICS[number]['id']]}${p.level < option.level ? ` · Lv.${option.level}` : ''}` : `${copy.basic} · ${kind === 'frame' ? '○' : '✦'}`
        button.disabled = p.level < option.level; button.setAttribute('aria-pressed', String(state.growth[kind] === option.id))
        button.addEventListener('click', async () => {
          const wasFocused = document.activeElement === button
          button.disabled = true
          try { await player.equip(kind, option.id); this.refresh() }
          catch { this.el('player-status').textContent = copy.saveError; button.disabled = false }
          finally {
            const next = list.querySelector<HTMLButtonElement>(`[data-choice="${kind}:${option.id}"]`)
            // Disabling/repainting a committed choice removes browser focus.
            // Restore it only while this panel is visible and focus was not
            // deliberately moved to another control during the save.
            if (wasFocused && (document.activeElement === document.body || document.activeElement === button)
              && next?.getClientRects().length && !next.disabled) next.focus({ preventScroll: true })
          }
        })
        list.append(button)
      }
    }
    if (focused) list.querySelector<HTMLButtonElement>(`[data-choice="${focused}"]`)?.focus({ preventScroll: true })
    const stats = statsFor(state, this.mode, this.recent), items = stats.items
    this.el('stats-heading').textContent = copy.stats
    this.el('stats-sample').textContent = `${n(stats.rounds)} ${copy.rounds}`
    this.el('stats-mode-label').textContent = copy.stats; this.el('stats-period-label').textContent = `${copy.lifetime} / ${copy.recent}`
    for (const mode of ['adventure', 'free'] as const) {
      const button = this.root.querySelector<HTMLButtonElement>(`[data-mode="${mode}"]`)!
      button.textContent = copy[mode]; button.setAttribute('aria-pressed', String(this.mode === mode))
    }
    for (const period of ['all', 'recent']) {
      const button = this.root.querySelector<HTMLButtonElement>(`[data-period="${period}"]`)!
      button.textContent = period === 'all' ? copy.lifetime : copy.recent; button.setAttribute('aria-pressed', String(this.recent === (period === 'recent')))
    }
    const used = ALL_ITEMS.reduce((sum, item) => sum + (items[item] ?? 0), 0)
    const values: Record<string,string> = { used: n(used), average: stats.rounds ? (used / stats.rounds).toLocaleString(undefined,{maximumFractionDigits:1,minimumFractionDigits:1}) : '—',
      chain: stats.rounds ? `×${n(stats.chain)}` : '—', created: n(stats.created), fusions: n(stats.fusions), noItems: n(stats.noItems) }
    for (const key of ['used', 'average', 'chain', 'created', 'fusions', 'noItems'] as const) {
      this.el(`stats-${key}-label`).textContent = copy[key]; this.el(`stats-${key}`).textContent = values[key]!
    }
    for (const item of ALL_ITEMS) {
      const node = this.el(`stats-item-${item}`); node.textContent = n(items[item] ?? 0); node.parentElement!.setAttribute('aria-label', `${t(item === 'hammer' ? 'itemHammer' : item === 'rocket' ? 'itemRocket' : item === 'bow' ? 'itemBow' : item === 'shuffle' ? 'itemShuffle' : 'itemBomb')}: ${n(items[item] ?? 0)}`)
    }
    this.el('stats-reset').textContent = copy.reset; this.el('stats-confirm-text').textContent = copy.resetConfirm
    this.el('stats-confirm-yes').textContent = copy.reset; this.el('stats-confirm-no').textContent = copy.cancel
    const preview = document.getElementById('profile-preview')!
    preview.dataset.frame = state.growth.frame
    this.el('player-status').textContent = player.persistent ? '' : copy.saveError
  }
}
