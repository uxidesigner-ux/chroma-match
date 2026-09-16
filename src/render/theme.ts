import { activeSkin } from './skins/index.ts'
import type { BoardStyle, GemStyle } from './skins/types.ts'

export type { GemStyle, Shape } from './skins/types.ts'

/**
 * Where colour comes from.
 *
 * This used to be the palette itself. It is now a view onto whichever skin is
 * active, kept as its own module so that callers outside the renderer — the
 * confetti, the floating combo text — ask for "the colour of this kind" without
 * having to know that skins exist at all.
 */
export function styleFor(kind: number): GemStyle {
  const palette = activeSkin().palette
  return palette[kind % palette.length] as GemStyle
}

/** The plate, the wells and the rings, for the active skin. */
export function boardStyle(): BoardStyle {
  return activeSkin().board
}

/**
 * The shade of a kind that will read against the board it is drawn on.
 *
 * For anything painted over the board rather than inside a gem — the combo
 * text that floats off a match — the pale end of the palette disappears on a
 * light board and the dark end disappears on a dark one.
 */
export function contrastingShade(kind: number): string {
  const style = styleFor(kind)
  return activeSkin().board.luminance === 'light' ? style.dark : style.light
}
