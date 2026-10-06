import { ALL_ITEMS as ITEMS } from '../game/items.ts'
import type { Item } from '../game/items.ts'
import { PRICES, STASH_LIMIT, buyStored, coins, stash } from '../meta.ts'
import { growthCopy } from './growth-copy.ts'
import { t } from '../i18n/index.ts'

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}

/**
 * The shop, and the wallet on the launch screen.
 *
 * Both read the same two numbers — coins held, items stashed — so they are one
 * class rather than two that have to be told about each other. Everything it
 * shows comes from meta.ts on demand: there is no cached balance here to fall
 * out of step with a purchase made two screens away.
 */
export class Shop {
  private coinsHome = el('home-coins')
  private coinsShop = el('shop-coins')
  private status = el('shop-status')
  private listeners: Array<() => void> = []

  constructor() {
    for (const item of ITEMS) {
      const price = document.querySelector<HTMLElement>(`[data-price="${item}"]`)
      if (price) price.textContent = String(PRICES[item])
      const button = document.querySelector<HTMLButtonElement>(`[data-buy="${item}"]`)
      button?.addEventListener('click', () => void this.purchase(item))
    }
  }

  /** Fires after any change to the wallet or the stash. */
  onChange(listener: () => void): void {
    this.listeners.push(listener)
  }

  private async purchase(item: Item): Promise<void> {
    const button = document.querySelector<HTMLButtonElement>(`[data-buy="${item}"]`)!
    button.disabled = true
    const result = await buyStored(item)
    this.setStatus(
      result.ok ? `✓ ${t(item === 'hammer' ? 'itemHammer' : item === 'rocket' ? 'itemRocket' : item === 'bow' ? 'itemBow' : item === 'shuffle' ? 'itemShuffle' : 'itemBomb')}` : growthCopy().saveError,
      result.ok ? 'is-ok' : 'is-error',
    )
    this.refresh()
    for (const listener of this.listeners) listener()
  }

  private setStatus(text: string, tone: 'is-ok' | 'is-error'): void {
    this.status.textContent = text
    this.status.classList.remove('is-ok', 'is-error')
    if (text) this.status.classList.add(tone)
  }

  /** Repaints both the wallet and the shop rows from storage. */
  refresh(): void {
    const balance = coins()
    const held = stash()
    this.coinsHome.textContent = balance.toLocaleString()
    this.coinsShop.textContent = balance.toLocaleString()

    for (const item of ITEMS) {
      const owned = document.querySelector<HTMLElement>(`[data-owned="${item}"]`)
      if (owned) {
        owned.textContent = `×${(held[item] ?? 0)}`
        owned.classList.toggle('is-none', (held[item] ?? 0) === 0)
      }
      const button = document.querySelector<HTMLButtonElement>(`[data-buy="${item}"]`)
      if (!button) continue
      // Affordability is shown by disabling rather than by hiding the price:
      // the price is the thing a player is saving towards.
      const full = (held[item] ?? 0) >= STASH_LIMIT
      button.disabled = full || balance < PRICES[item]
      button.classList.toggle('is-full', full)
    }
  }

  /** Clears the last purchase message, so it does not greet the next visit. */
  reset(): void {
    this.setStatus('', 'is-ok')
    this.refresh()
  }
}
