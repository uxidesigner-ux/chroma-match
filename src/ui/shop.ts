import { ITEMS } from '../game/items.ts'
import type { Item } from '../game/items.ts'
import { PRICES, STASH_LIMIT, buy, coins, stash, totalStashed } from '../meta.ts'

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
  private stashHint = el('home-stash')
  private status = el('shop-status')
  private listeners: Array<() => void> = []

  constructor() {
    for (const item of ITEMS) {
      const price = document.querySelector<HTMLElement>(`[data-price="${item}"]`)
      if (price) price.textContent = String(PRICES[item])
      const button = document.querySelector<HTMLButtonElement>(`[data-buy="${item}"]`)
      button?.addEventListener('click', () => this.purchase(item))
    }
  }

  /** Fires after any change to the wallet or the stash. */
  onChange(listener: () => void): void {
    this.listeners.push(listener)
  }

  private purchase(item: Item): void {
    const result = buy(item)
    this.setStatus(
      result.ok ? `${item[0]?.toUpperCase()}${item.slice(1)} bought.` : (result.reason ?? ''),
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

    const total = totalStashed(held)
    this.stashHint.textContent = total > 0 ? ` · ${total} held` : ''

    for (const item of ITEMS) {
      const owned = document.querySelector<HTMLElement>(`[data-owned="${item}"]`)
      if (owned) {
        owned.textContent = `${held[item]} held`
        owned.classList.toggle('is-none', held[item] === 0)
      }
      const button = document.querySelector<HTMLButtonElement>(`[data-buy="${item}"]`)
      if (!button) continue
      // Affordability is shown by disabling rather than by hiding the price:
      // the price is the thing a player is saving towards.
      const full = held[item] >= STASH_LIMIT
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
