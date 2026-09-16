import { ITEMS } from '../game/items.ts'
import type { Inventory, Item } from '../game/items.ts'

const LABELS: Record<Item, string> = {
  hammer: 'Hammer',
  rocket: 'Rocket',
  bomb: 'Bomb',
}

const HINTS: Record<Item, string> = {
  hammer: 'Tap a gem to smash it',
  rocket: 'Tap a gem to clear its row',
  bomb: 'Tap a gem to blow up the square around it',
}

/**
 * The item tray, and the arming state that goes with it.
 *
 * Arming is a mode, and a mode the player cannot see is a bug waiting to
 * happen: pressing an item changes what the next tap on the board does, so the
 * tray says which item is armed, the board says it is waiting for a target, and
 * anything that is not a target — a second press, the board settling, the run
 * ending — disarms rather than leaving the mode on.
 */
export class ItemTray {
  private buttons = new Map<Item, HTMLButtonElement>()
  private counts = new Map<Item, HTMLElement>()
  private hint: HTMLElement
  private armedItem: Item | null = null
  private listeners: Array<(item: Item | null) => void> = []
  private shown: Inventory | null = null

  constructor() {
    const root = document.getElementById('items')
    const hint = document.getElementById('items-hint')
    if (!root || !hint) throw new Error('Missing the item tray')
    this.hint = hint

    for (const item of ITEMS) {
      const button = root.querySelector<HTMLButtonElement>(`[data-item="${item}"]`)
      const count = root.querySelector<HTMLElement>(`[data-count="${item}"]`)
      if (!button || !count) throw new Error(`Missing the ${item} button`)
      this.buttons.set(item, button)
      this.counts.set(item, count)
      button.addEventListener('click', () => this.toggle(item))
    }
  }

  get armed(): Item | null {
    return this.armedItem
  }

  onArm(listener: (item: Item | null) => void): void {
    this.listeners.push(listener)
  }

  private toggle(item: Item): void {
    this.arm(this.armedItem === item ? null : item)
  }

  arm(item: Item | null): void {
    if (item && (this.shown?.[item] ?? 0) <= 0) return
    if (this.armedItem === item) return
    this.armedItem = item

    for (const [key, button] of this.buttons) {
      button.classList.toggle('is-armed', key === item)
      button.setAttribute('aria-pressed', String(key === item))
    }
    this.hint.textContent = item ? HINTS[item] : ''
    this.hint.hidden = !item
    document.body.classList.toggle('is-aiming', item !== null)
    for (const listener of this.listeners) listener(item)
  }

  /** Called every frame; only touches the document when a count moved. */
  update(inventory: Inventory): void {
    if (
      this.shown &&
      ITEMS.every((item) => this.shown?.[item] === inventory[item])
    ) {
      return
    }
    this.shown = { ...inventory }

    for (const item of ITEMS) {
      const held = inventory[item]
      const button = this.buttons.get(item)
      const count = this.counts.get(item)
      if (!button || !count) continue
      count.textContent = String(held)
      button.disabled = held <= 0
      button.classList.toggle('is-empty', held <= 0)
      button.setAttribute('aria-label', `${LABELS[item]}, ${held} held`)
    }

    // Spending the last one has to drop the mode with it, or the next tap on
    // the board fires an item that is no longer there.
    if (this.armedItem && inventory[this.armedItem] <= 0) this.arm(null)
  }

  /** Plays the earned animation on one item's button. */
  flash(item: Item): void {
    const button = this.buttons.get(item)
    if (!button) return
    button.classList.remove('is-earned')
    void button.offsetWidth
    button.classList.add('is-earned')
  }
}
