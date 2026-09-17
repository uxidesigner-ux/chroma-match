import { PACKS, grantPack } from '../packs.ts'

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}

/**
 * The coin packs, under the items in the shop.
 *
 * Built from the data rather than written into the HTML, so the price ladder
 * lives in one file and a change to it cannot leave a stale row on the screen.
 * Nothing here charges anybody — see src/packs.ts for why that is deliberate
 * and why the screen says so out loud.
 */
export class PackShelf {
  private list = el<HTMLUListElement>('packs')
  private listeners: Array<(coins: number) => void> = []

  constructor() {
    for (const pack of PACKS) {
      const row = document.createElement('li')
      row.className = pack.best ? 'pack is-best' : 'pack'

      const art = document.createElement('span')
      art.className = 'pack-art'
      art.setAttribute('aria-hidden', 'true')

      const text = document.createElement('span')
      text.className = 'pack-text'
      const amount = document.createElement('strong')
      amount.className = 'pack-amount'
      amount.textContent = `${pack.coins.toLocaleString()} coins`
      const note = document.createElement('span')
      note.className = 'pack-note'
      // The bonus is what the ladder is for: it is the reason a bigger pack is
      // a different decision rather than the same one three times.
      note.textContent = pack.bonus > 0 ? `+${pack.bonus}% more per won` : 'Starter amount'
      text.append(amount, note)

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'btn btn-primary pack-buy'
      button.textContent = pack.price
      button.addEventListener('click', () => {
        const added = grantPack(pack.id)
        if (added === 0) return
        for (const listener of this.listeners) listener(added)
      })

      if (pack.best) {
        const flag = document.createElement('span')
        flag.className = 'pack-flag'
        flag.textContent = 'Best value'
        row.append(flag)
      }
      row.append(art, text, button)
      this.list.append(row)
    }
  }

  /** Fires after a pack is taken, with the coins added. */
  onBuy(listener: (coins: number) => void): void {
    this.listeners.push(listener)
  }
}
