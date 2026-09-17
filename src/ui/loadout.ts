import { ITEMS } from '../game/items.ts'
import type { Item } from '../game/items.ts'
import { BOOSTER_LIMIT, stash, totalStashed } from '../meta.ts'
import { t } from '../i18n/index.ts'

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}

/**
 * The loadout picker: what to carry into a run, chosen before the board exists.
 *
 * It is a step rather than a screen. A player with an empty stash sees it once,
 * reads why it is empty, and presses on; a player with items spends two taps
 * and gets the run they planned. Either way it never blocks Play — the start
 * button is live with nothing selected, because "take nothing in" is the most
 * common answer and should not cost a detour.
 */
export class Loadout {
  private root = el('loadout')
  private grid = el('loadout-grid')
  private empty = el('loadout-empty')
  private body = el('loadout-body')
  private start = el<HTMLButtonElement>('loadout-start')
  private cancel = el<HTMLButtonElement>('loadout-cancel')
  private picked: Item[] = []
  private onStart: (picked: Item[]) => void = () => {}

  constructor() {
    for (const item of ITEMS) {
      const button = this.grid.querySelector<HTMLButtonElement>(`[data-load="${item}"]`)
      button?.addEventListener('click', () => this.toggle(item))
    }
    this.start.addEventListener('click', () => {
      const chosen = [...this.picked]
      this.hide()
      this.onStart(chosen)
    })
    this.cancel.addEventListener('click', () => this.hide())
  }

  private toggle(item: Item): void {
    const held = stash()[item]
    const already = this.picked.filter((p) => p === item).length
    if (already > 0) {
      // Tapping a picked item takes one back rather than clearing the lot: with
      // a limit of two, a doubled-up pick is a real choice.
      this.picked.splice(this.picked.indexOf(item), 1)
    } else if (this.picked.length < BOOSTER_LIMIT && held > already) {
      this.picked.push(item)
    }
    this.paint()
  }

  private paint(): void {
    const held = stash()
    for (const item of ITEMS) {
      const button = this.grid.querySelector<HTMLButtonElement>(`[data-load="${item}"]`)
      const have = this.grid.querySelector<HTMLElement>(`[data-have="${item}"]`)
      if (have) have.textContent = String(held[item])
      if (!button) continue
      const chosen = this.picked.includes(item)
      button.classList.toggle('is-picked', chosen)
      button.setAttribute('aria-pressed', String(chosen))
      button.disabled = held[item] <= 0
    }

    const room = BOOSTER_LIMIT - this.picked.length
    this.body.textContent =
      this.picked.length === 0
        ? `Pick up to ${BOOSTER_LIMIT}. They start in your tray.`
        : room > 0
          ? `${this.picked.length} picked — room for ${room} more.`
          : `${this.picked.length} picked. That is the limit.`
    this.start.textContent = this.picked.length > 0 ? t('loadoutStart') : t('loadoutStartEmpty')
  }

  show(onStart: (picked: Item[]) => void): void {
    this.onStart = onStart
    this.picked = []
    const nothing = totalStashed() === 0
    this.empty.hidden = !nothing
    this.grid.hidden = nothing
    this.body.hidden = nothing
    this.paint()
    this.root.hidden = false
    this.start.focus()
  }

  hide(): void {
    this.root.hidden = true
  }

  get visible(): boolean {
    return !this.root.hidden
  }
}
