export type ScreenName = 'home' | 'shop' | 'game'

/**
 * Shows one screen at a time. Kept deliberately dumb — it toggles `hidden` and
 * tells whoever asked, so the game loop can stop drawing a canvas nobody is
 * looking at and the launch screen can refresh its board when it comes back.
 */
export class Screens {
  private readonly nodes: Record<ScreenName, HTMLElement>
  private listeners: Array<(name: ScreenName) => void> = []
  private current: ScreenName = 'home'

  constructor() {
    const home = document.getElementById('screen-home')
    const shop = document.getElementById('screen-shop')
    const game = document.getElementById('screen-game')
    if (!home || !shop || !game) throw new Error('Missing a screen element')
    this.nodes = { home, shop, game }
  }

  get active(): ScreenName {
    return this.current
  }

  show(name: ScreenName): void {
    if (this.current === name) return
    this.current = name
    for (const [key, node] of Object.entries(this.nodes)) node.hidden = key !== name
    for (const listener of this.listeners) listener(name)
  }

  onChange(listener: (name: ScreenName) => void): void {
    this.listeners.push(listener)
  }
}
