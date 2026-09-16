import { GLASS } from './glass.ts'
import { JEWEL } from './jewel.ts'
import { SKIN_VARS } from './types.ts'
import type { Skin } from './types.ts'

export type { BoardStyle, GemPaint, GemStyle, Shape, Skin } from './types.ts'
export { SKIN_VARS } from './types.ts'

/** Every skin, in the order the toggle cycles them. The first one is the default. */
export const SKINS: readonly Skin[] = [JEWEL, GLASS]

const STORAGE_KEY = 'chroma.skin'

let current: Skin = SKINS[0] as Skin
const listeners: Array<(skin: Skin) => void> = []

/**
 * The skin the renderer should be drawing right now.
 *
 * Read per frame rather than captured once, so switching skins takes effect on
 * the next frame without the renderer having to be rebuilt or told.
 */
export function activeSkin(): Skin {
  return current
}

export function skinById(id: string | null | undefined): Skin | null {
  return SKINS.find((skin) => skin.id === id) ?? null
}

/**
 * Applies a skin and remembers it.
 *
 * The CSS half of a skin is a set of custom properties on the document root;
 * the canvas half is read straight off `activeSkin()`. `data-skin` is set as
 * well, for the few rules that need more than a colour swap.
 */
export function setSkin(skin: Skin, remember = true): void {
  current = skin
  const root = document.documentElement
  root.dataset.skin = skin.id
  for (const name of SKIN_VARS) root.style.setProperty(`--${name}`, skin.css[name])

  // The address bar and the standalone window's chrome are painted from this,
  // so a skin that did not update it would leave a seam at the top of the app.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', skin.css.bg)

  if (remember) {
    try {
      localStorage.setItem(STORAGE_KEY, skin.id)
    } catch {
      // Private mode, or storage the browser has blocked. The skin still
      // applies for this session; only the memory of it is lost.
    }
  }
  for (const listener of listeners) listener(skin)
}

/** Fires after every change, including the one `initSkin` makes at startup. */
export function onSkinChange(listener: (skin: Skin) => void): void {
  listeners.push(listener)
}

/** The next skin in the list, wrapping — what the toggle does. */
export function nextSkin(): Skin {
  const i = SKINS.indexOf(current)
  return SKINS[(i + 1) % SKINS.length] as Skin
}

/**
 * Picks the skin to open with: `?skin=` first so a link can carry one, then
 * whatever was last chosen on this device, then the default.
 *
 * An unknown id falls through to the default rather than failing, because this
 * runs before anything is on screen and a typo in a shared link should not cost
 * someone the game.
 */
export function initSkin(): Skin {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(STORAGE_KEY)
  } catch {
    stored = null
  }
  const asked = new URLSearchParams(location.search).get('skin')
  const skin = skinById(asked) ?? skinById(stored) ?? (SKINS[0] as Skin)
  // A skin that came from the URL is applied but not remembered: following a
  // link should not quietly redecorate the game for good.
  setSkin(skin, skinById(asked) === null)
  return skin
}
