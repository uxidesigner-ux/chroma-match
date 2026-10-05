export type ScreenName = 'map' | 'home' | 'shop' | 'game' | 'creator'

/**
 * Shows one screen at a time. Kept deliberately dumb — it toggles `hidden` and
 * tells whoever asked, so the game loop can stop drawing a canvas nobody is
 * looking at and the launch screen can refresh its board when it comes back.
 */
export class Screens {
  private readonly nodes: Record<ScreenName, HTMLElement>
  private listeners: Array<(name: ScreenName) => void> = []
  private current: ScreenName = 'map'

  constructor() {
    const home = document.getElementById('screen-home')
    const map = document.getElementById('screen-map')
    const shop = document.getElementById('screen-shop')
    const game = document.getElementById('screen-game')
    const creator = document.getElementById('screen-creator')
    if (!map || !home || !shop || !game || !creator) throw new Error('Missing a screen element')
    this.nodes = { map, home, shop, game, creator }
    try { if (localStorage.getItem('chroma-match:destination') === 'character') this.current = 'home' } catch { /* map is the safe default */ }
    for (const [key, node] of Object.entries(this.nodes)) node.hidden = key !== this.current
  }

  get active(): ScreenName {
    return this.current
  }

  show(name: ScreenName): void {
    if (this.current === name) return
    this.current = name
    if (name === 'map' || name === 'home') {
      try { localStorage.setItem('chroma-match:destination', name === 'home' ? 'character' : 'map') } catch { /* session only */ }
    }
    for (const [key, node] of Object.entries(this.nodes)) node.hidden = key !== name
    for (const listener of this.listeners) listener(name)
  }

  onChange(listener: (name: ScreenName) => void): void {
    this.listeners.push(listener)
  }
}
