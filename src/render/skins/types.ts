/**
 * What a skin owns, and what it is not allowed to touch.
 *
 * A skin owns colour, silhouette and finish. It does not own how many kinds are
 * in play, the board's shape, or anything else the rules read — a leaderboard
 * row carries the board it was played on and every client replays that run
 * before believing the score, so a skin that moved those numbers would
 * invalidate every record posted under the previous one. Skins are a coat of
 * paint by construction, not by good intentions.
 */

export type Shape =
  | 'circle'
  | 'triangle'
  | 'square'
  | 'diamond'
  | 'hexagon'
  | 'flower'
  /**
   * The same six-lobed idea as `flower`, but as one continuous outline rather
   * than overlapping circles. `flower` traces every petal's full circle, which
   * a hairline stroke reads as facets and a heavy one reads as a scribble — so
   * a skin that outlines its gems in ink wants this instead.
   */
  | 'rosette'

export interface GemStyle {
  name: string
  /**
   * Every colour also gets its own silhouette. Colour alone is not a reliable
   * signal — roughly one player in twelve cannot separate the red and the green
   * at a glance — so the shape carries the same information independently. A
   * skin may reassign which shape goes with which colour; it may not hand two
   * kinds the same one.
   */
  shape: Shape
  base: string
  light: string
  dark: string
}

/** The furniture the gems sit on: the plate, the wells and the two rings. */
export interface BoardStyle {
  boardFill: string
  boardStroke: string
  cellFill: string
  /** An outline on each well, or null where the fill alone is the whole look. */
  cellStroke: string | null
  /** Stroke weight for the plate and the wells, in CSS pixels. */
  lineWidth: number
  selectRing: string
  hintRing: string
  /** The ring thrown off when a gem is about to clear. */
  flash: string
  /**
   * The badge drawn on a power gem — the stripes, the bomb, the prism's star.
   * It was white until a skin put light-coloured gems on the board, where a
   * white badge is invisible and the player loses the only signal that says
   * what a gem will do.
   */
  mark: string
  /**
   * Whether the board is dark or light overall.
   *
   * Anything drawn on top of a gem rather than inside it — the combo text that
   * floats off a match — has to pick the end of the palette that will read
   * against the board, and only the skin knows which end that is.
   */
  luminance: 'dark' | 'light'
}

/** Everything a skin needs to paint one gem, in the gem's own coordinates. */
export interface GemPaint {
  style: GemStyle
  /** Half the drawn size of the gem, in CSS pixels. */
  r: number
  /** The alpha the caller has already applied; clipped passes restore to it. */
  alpha: number
  /** Seconds since the game started, for anything that animates. */
  time: number
  /** A prism gem, which is drawn from the whole palette rather than one colour. */
  rainbow: boolean
  palette: readonly GemStyle[]
}

/**
 * The CSS custom properties a skin sets on the document root.
 *
 * Declared as a closed list so the compiler, not a reviewer, is what catches a
 * skin that forgets one: a missing property would otherwise inherit whatever
 * the previously active skin left behind, which is invisible until someone
 * switches skins twice and finds a stray colour.
 */
export const SKIN_VARS = [
  'bg',
  'bg-glow',
  'bg-glow-2',
  'panel',
  'panel-strong',
  'panel-blur',
  'panel-shadow',
  'line',
  'text',
  'muted',
  'accent',
  'accent-2',
  'radius',
] as const

export type SkinVar = (typeof SKIN_VARS)[number]

type Ctx = CanvasRenderingContext2D

export interface Skin {
  /** Stable across releases: it is persisted and accepted from the URL. */
  readonly id: string
  /** What the toggle says once this skin is on. */
  readonly name: string
  readonly palette: readonly GemStyle[]
  readonly board: BoardStyle
  readonly css: Readonly<Record<SkinVar, string>>

  /**
   * The gem's body: its silhouette filled, and whatever separates it from the
   * board behind it. The caller has already translated and scaled, so this
   * draws around (0, 0) and owns its own save/restore.
   */
  paintBody(ctx: Ctx, p: GemPaint): void

  /**
   * Anything that has to stay inside the silhouette — highlights, refraction,
   * texture. The caller clips to the gem path first and draws the power badge
   * afterwards, inside the same clip.
   */
  paintInterior(ctx: Ctx, p: GemPaint): void

  /** The edge treatment, drawn last so it reads on top of the badge. */
  paintEdge(ctx: Ctx, p: GemPaint): void
}
