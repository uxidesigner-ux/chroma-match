import {
  accessoryOf,
  backdropOf,
  hairColourOf,
  hairOf,
  outfitColourOf,
  outfitOf,
  skinOf,
} from './spec.ts'
import type { AvatarSpec } from './spec.ts'

/**
 * An avatar, drawn rather than loaded.
 *
 * The style is clay: heavy rounded forms lit by one soft source from the upper
 * left, with no specular highlight anywhere. What makes it read as clay rather
 * than as an illustration of clay is not the gradients — the first version had
 * those and still looked like a sticker — it is the shadows *between* the
 * forms. A head that casts nothing onto the shoulders it sits on is a head
 * painted at the same depth as them, and no amount of shading inside its own
 * outline will fix that. So every form here is drawn with a cast shadow onto
 * whatever was painted before it, in this order: backdrop, hair behind, body,
 * neck, head, face, hair in front, accessories.
 *
 * Everything is laid out in a 100×100 space and scaled at the end, so the same
 * code draws a 26px row thumbnail and a 124px profile portrait. The features
 * are deliberately coarse for that reason: two eyes and a nose, no mouth. At 26
 * pixels a mouth is three grey pixels that read as a smudge, and a face that
 * looks wrong small is worse than a face that is simple everywhere.
 */

const UNIT = 100

/** Lightens or darkens a hex colour. Positive lifts towards white. */
function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const to = amount > 0 ? 255 : 0
  const t = Math.abs(amount)
  const channel = (shift: number): number => {
    const value = (n >> shift) & 255
    return Math.round(value + (to - value) * t)
  }
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`
}

/**
 * Canvas shadows are specified in device pixels and are deliberately *not*
 * transformed by the current matrix, which is a trap for anything drawn in its
 * own coordinate space: a blur of 6 is a soft edge on a 124px portrait and a
 * smear that swallows a 26px thumbnail whole. Everything below asks for blur
 * and offset in the 100-unit space and multiplies by the real scale.
 */
interface Depth {
  /** Total device scale, read off the transform once per avatar. */
  k: number
}

function cast(
  ctx: CanvasRenderingContext2D,
  depth: Depth,
  blur: number,
  dy: number,
  alpha: number,
): void {
  ctx.shadowColor = `rgba(38, 26, 20, ${alpha})`
  ctx.shadowBlur = blur * depth.k
  ctx.shadowOffsetX = dy * 0.35 * depth.k
  ctx.shadowOffsetY = dy * depth.k
}

function noCast(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
}

/**
 * The matte fill for a form: lit from the upper left, shaded to the lower
 * right, with the base colour holding the middle so the object still reads as
 * the colour it is meant to be rather than as a gradient swatch. The range is
 * wide — clay is soft but it is not flat — and there is no stop brighter than
 * the lift, because a bright point is a specular highlight and that is glass.
 */
function clay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  base: string,
  lift = 0.22,
  drop = 0.2,
): CanvasGradient {
  const gradient = ctx.createLinearGradient(x + w * 0.15, y, x + w * 0.85, y + h)
  gradient.addColorStop(0, shade(base, lift))
  gradient.addColorStop(0.42, base)
  gradient.addColorStop(1, shade(base, -drop))
  return gradient
}

function ellipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): void {
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * A pool of shade sitting in the crease where two forms meet.
 *
 * The cast shadows put the forms at different depths; this is the other half —
 * contact. Where a jaw meets a neck or a hairline meets a forehead, light stops
 * reaching entirely, and that dark line is what the eye reads as two solid
 * objects touching rather than two shapes overlapping.
 */
function occlude(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  alpha: number,
): void {
  const pool = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry))
  pool.addColorStop(0, `rgba(48, 32, 24, ${alpha})`)
  pool.addColorStop(1, 'rgba(48, 32, 24, 0)')
  ctx.fillStyle = pool
  ellipse(ctx, cx, cy, rx, ry)
}

/**
 * Draws one avatar into the current context, filling `size` square.
 *
 * The caller owns the canvas and its pixel ratio; this only ever paints inside
 * the box it is given, so the same call works for a thumbnail, a portrait, and
 * an offscreen canvas being turned into a shareable image.
 */
export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  spec: AvatarSpec,
  size: number,
  options: { round?: boolean } = {},
): void {
  const skin = skinOf(spec).colour
  const hair = hairOf(spec).style
  const hairColour = hairColourOf(spec).colour
  const outfit = outfitOf(spec).style
  const cloth = outfitColourOf(spec).colour
  const accessory = accessoryOf(spec).style

  ctx.save()
  ctx.scale(size / UNIT, size / UNIT)
  const depth: Depth = { k: ctx.getTransform().a }

  // Clipped before anything is drawn, so every form can run off the edge of
  // the frame the way a portrait crop does rather than being drawn to fit
  // inside it — shoulders that stop short of the border read as a sticker.
  ctx.beginPath()
  if (options.round) ctx.arc(50, 50, 50, 0, Math.PI * 2)
  else ctx.rect(0, 0, UNIT, UNIT)
  ctx.clip()

  drawBackdrop(ctx, backdropOf(spec).colour)
  drawHairBack(ctx, depth, hair, hairColour)
  drawBody(ctx, depth, outfit, cloth, skin)
  drawHead(ctx, depth, skin, !COVERS_EARS.has(hair))
  drawFace(ctx, depth, skin)
  drawHairFront(ctx, depth, hair, hairColour)
  drawAccessory(ctx, depth, accessory)

  noCast(ctx)
  ctx.restore()
}

/* ---- the stage ---------------------------------------------------------- */

/**
 * Not a flat fill.
 *
 * A figure with cast shadows standing on a flat colour reads as a cut-out
 * pasted onto paper. One soft light from the upper left and a little fall-off
 * at the corners is enough to make the same colour read as a lit surface, and
 * it is the cheapest depth on the whole card.
 */
function drawBackdrop(ctx: CanvasRenderingContext2D, base: string): void {
  const stage = ctx.createRadialGradient(34, 26, 4, 50, 56, 82)
  stage.addColorStop(0, shade(base, 0.16))
  stage.addColorStop(0.5, base)
  stage.addColorStop(1, shade(base, -0.16))
  ctx.fillStyle = stage
  ctx.fillRect(0, 0, UNIT, UNIT)
}

/* ---- head and face ------------------------------------------------------ */

/**
 * Hair that hangs past the ear.
 *
 * The ears are drawn with the head, before the hair goes on, so for these
 * styles they used to poke out through the sides — the front layer covers the
 * skull, not the full width an ear reaches. Under hair this long an ear is not
 * visible on a real head either, so the fix is to leave it out rather than to
 * widen every hair path until it happens to cover one.
 */
const COVERS_EARS = new Set(['bob', 'long', 'wave'])

function drawHead(
  ctx: CanvasRenderingContext2D,
  depth: Depth,
  skin: string,
  ears: boolean,
): void {
  if (ears) {
    cast(ctx, depth, 2.5, 1.2, 0.3)
    ctx.fillStyle = clay(ctx, 22, 38, 12, 16, shade(skin, -0.08), 0.12, 0.2)
    ellipse(ctx, 27.8, 46.5, 5.2, 6.6)
    ctx.fillStyle = clay(ctx, 66, 38, 12, 16, shade(skin, -0.14), 0.1, 0.22)
    ellipse(ctx, 72.2, 46.5, 5.2, 6.6)
  }

  // The skull is a heavy rounded brick: straight-ish temples, all the curvature
  // in the jaw. An oval reads as an egg, which is a different character. The
  // cast is the largest in the drawing because this is the form that has to sit
  // *in front of* the shoulders rather than on the same plane as them.
  cast(ctx, depth, 7, 4.5, 0.3)
  ctx.fillStyle = clay(ctx, 28, 15, 44, 54, skin)
  ctx.beginPath()
  ctx.roundRect(28, 15, 44, 54, [22, 22, 20, 20])
  ctx.fill()
  noCast(ctx)

  // A broad, weak light on the temple. Broad is the whole point: a small bright
  // spot is a highlight, and a highlight is a hard surface.
  const lit = ctx.createRadialGradient(40, 26, 2, 42, 32, 30)
  lit.addColorStop(0, 'rgba(255, 255, 255, 0.16)')
  lit.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(28, 15, 44, 54, [22, 22, 20, 20])
  ctx.clip()
  ctx.fillStyle = lit
  ctx.fillRect(28, 15, 44, 54)
  // Where the jaw turns under. Without it the chin and the neck are one flat
  // field of the same colour and the head stops having a bottom.
  const under = ctx.createLinearGradient(0, 54, 0, 69)
  under.addColorStop(0, 'rgba(0, 0, 0, 0)')
  under.addColorStop(1, 'rgba(38, 26, 20, 0.2)')
  ctx.fillStyle = under
  ctx.fillRect(28, 15, 44, 54)
  ctx.restore()
}

function drawFace(ctx: CanvasRenderingContext2D, depth: Depth, skin: string): void {
  // Set into the face rather than printed on it: a touch of shade around each
  // eye is the difference between a socket and a dot.
  occlude(ctx, 41.5, 44.5, 5, 4.4, 0.12)
  occlude(ctx, 58.5, 44.5, 5, 4.4, 0.12)
  noCast(ctx)
  ctx.fillStyle = '#231D1A'
  ellipse(ctx, 41.5, 44, 2.7, 3.3)
  ellipse(ctx, 58.5, 44, 2.7, 3.3)

  // The nose is the one piece of relief on the face and the clearest proof the
  // head is round, so it gets a real cast rather than a painted smudge.
  cast(ctx, depth, 3, 2, 0.26)
  ctx.fillStyle = clay(ctx, 44, 47, 12, 10, shade(skin, 0.06), 0.2, 0.14)
  ellipse(ctx, 50, 52, 4.8, 4)
  noCast(ctx)
}

/* ---- body --------------------------------------------------------------- */

function drawBody(
  ctx: CanvasRenderingContext2D,
  depth: Depth,
  outfit: string,
  cloth: string,
  skin: string,
): void {
  // Neck, drawn before the shoulders so the neckline cuts it off wherever the
  // outfit's collar happens to sit. Thick: a thin one reads as a doll's.
  cast(ctx, depth, 4, 2.5, 0.26)
  ctx.fillStyle = clay(ctx, 40, 56, 20, 28, shade(skin, -0.16), 0.14, 0.18)
  ctx.beginPath()
  ctx.roundRect(40.5, 56, 19, 28, 9)
  ctx.fill()
  noCast(ctx)

  const shoulders = (): void => {
    ctx.beginPath()
    ctx.moveTo(0, UNIT)
    ctx.lineTo(0, 94)
    // One curve each side from the outer edge up to the neck. Shoulders are a
    // slope; a rounded rectangle here reads as a box someone is standing behind.
    ctx.bezierCurveTo(7, 80, 24, 72.5, 38, 71.5)
    ctx.lineTo(62, 71.5)
    ctx.bezierCurveTo(76, 72.5, 93, 80, 100, 94)
    ctx.lineTo(100, UNIT)
    ctx.closePath()
  }

  cast(ctx, depth, 7, 4, 0.22)
  ctx.fillStyle = clay(ctx, 0, 68, 100, 34, cloth, 0.18, 0.22)
  shoulders()
  ctx.fill()
  noCast(ctx)

  // Everything below dresses that silhouette. Each piece is clipped to the
  // shoulders so a lapel or a hood can be drawn as a plain shape and still
  // finish exactly on the outline.
  ctx.save()
  shoulders()
  ctx.clip()

  // The shoulders turn away from the light at their outer ends, which is what
  // stops them reading as one flat sweep across the bottom of the card.
  const roll = ctx.createLinearGradient(0, 0, 100, 0)
  roll.addColorStop(0, 'rgba(38, 26, 20, 0.22)')
  roll.addColorStop(0.32, 'rgba(38, 26, 20, 0)')
  roll.addColorStop(0.72, 'rgba(38, 26, 20, 0)')
  roll.addColorStop(1, 'rgba(38, 26, 20, 0.26)')
  ctx.fillStyle = roll
  ctx.fillRect(0, 68, 100, 34)

  if (outfit === 'crew') {
    neckline(ctx, cloth, 11)
  } else if (outfit === 'turtle') {
    cast(ctx, depth, 3, 2, 0.24)
    ctx.fillStyle = clay(ctx, 36, 60, 28, 18, shade(cloth, 0.08), 0.16, 0.16)
    ctx.beginPath()
    ctx.roundRect(37.5, 60, 25, 17, 8)
    ctx.fill()
    noCast(ctx)
  } else if (outfit === 'hoodie') {
    neckline(ctx, cloth, 10)
    // The hood, rolling over the shoulders behind the neck.
    cast(ctx, depth, 4, 2.5, 0.24)
    ctx.fillStyle = clay(ctx, 24, 60, 52, 26, shade(cloth, -0.12), 0.16, 0.2)
    ctx.beginPath()
    ctx.moveTo(29, 90)
    ctx.bezierCurveTo(27, 70, 38, 63, 50, 63)
    ctx.bezierCurveTo(62, 63, 73, 70, 71, 90)
    ctx.closePath()
    ctx.fill()
    noCast(ctx)
    neckline(ctx, shade(cloth, -0.12), 9)
    // Hanging from under the hood rather than floating on the chest, and long
    // enough to read as cord — two short ovals read as teeth.
    ctx.fillStyle = shade(cloth, 0.36)
    ctx.beginPath()
    ctx.roundRect(43.2, 83, 3, 17, 1.5)
    ctx.roundRect(53.8, 83, 3, 17, 1.5)
    ctx.fill()
  } else {
    // Shirt, tie and blazer share a collar; only what sits under it moves.
    if (outfit === 'blazer') {
      ctx.fillStyle = clay(ctx, 38, 70, 24, 30, '#2A2C33', 0.16, 0.12)
      ctx.beginPath()
      ctx.moveTo(42, 71)
      ctx.lineTo(58, 71)
      ctx.lineTo(55, UNIT)
      ctx.lineTo(45, UNIT)
      ctx.closePath()
      ctx.fill()
    } else {
      neckline(ctx, cloth, 8)
    }

    if (outfit === 'tie') {
      ctx.fillStyle = clay(ctx, 45, 74, 10, 26, shade(cloth, -0.5), 0.2, 0.1)
      ctx.lineJoin = 'round'
      ctx.lineWidth = 2.6
      ctx.strokeStyle = ctx.fillStyle
      ctx.beginPath()
      ctx.moveTo(50, 77)
      ctx.lineTo(53.4, 81.5)
      ctx.lineTo(52.2, UNIT)
      ctx.lineTo(47.8, UNIT)
      ctx.lineTo(46.6, 81.5)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }

    const lapel = outfit === 'blazer'
    cast(ctx, depth, 2.5, 1.5, 0.22)
    // Slightly darker than the shirt, not lighter. Lifting it and then letting
    // the gradient drop away turned a white collar into a silver dart — it has
    // to read as a fold of the same cloth, which means the same colour with
    // less light on it.
    ctx.fillStyle = clay(ctx, 32, 70, 36, 22, shade(cloth, -0.14), 0.12, 0.12)
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3.4
    ctx.strokeStyle = ctx.fillStyle
    const flap = (sign: number): void => {
      ctx.beginPath()
      ctx.moveTo(50 + sign * 9, 71)
      ctx.lineTo(50 + sign * (lapel ? 1.5 : 0.5), lapel ? 84 : 83)
      ctx.lineTo(50 + sign * 15, lapel ? 90 : 84)
      ctx.closePath()
      // Stroked as well as filled, so the corners round off: a collar point is
      // pressed cloth, and a bare fill gives it three needle-sharp corners.
      ctx.fill()
      ctx.stroke()
    }
    flap(-1)
    flap(1)
    noCast(ctx)
  }

  ctx.restore()
}

/** The scoop of skin between the collarbones, however deep the outfit cuts. */
function neckline(ctx: CanvasRenderingContext2D, cloth: string, depth: number): void {
  ctx.fillStyle = clay(ctx, 39, 68, 22, 16, shade(cloth, -0.26), 0.1, 0.16)
  ctx.beginPath()
  ctx.ellipse(50, 71.5, 11.5, depth, 0, 0, Math.PI)
  ctx.fill()
  // The neck disappears into the cloth rather than stopping at it.
  occlude(ctx, 50, 71.5, 11, depth * 0.9, 0.3)
}

/* ---- hair --------------------------------------------------------------- */

/** The styles that put anything behind the head at all. */
const BEHIND = new Set(['bob', 'long', 'wave', 'bun'])

/** Whatever falls behind the head and the shoulders. */
function drawHairBack(
  ctx: CanvasRenderingContext2D,
  depth: Depth,
  style: string,
  colour: string,
): void {
  // Only the styles with something behind the head to draw.
  if (!BEHIND.has(style)) return
  cast(ctx, depth, 5, 3, 0.24)

  if (style === 'bob') {
    ctx.fillStyle = clay(ctx, 22, 14, 56, 62, shade(colour, -0.14), 0.16, 0.2)
    ctx.beginPath()
    ctx.roundRect(23, 14, 54, 62, [27, 27, 18, 18])
    ctx.fill()
  } else if (style === 'long') {
    ctx.fillStyle = clay(ctx, 20, 14, 60, 86, shade(colour, -0.14), 0.16, 0.2)
    ctx.beginPath()
    ctx.roundRect(21, 14, 58, 86, [29, 29, 13, 13])
    ctx.fill()
  } else if (style === 'wave') {
    ctx.fillStyle = clay(ctx, 18, 13, 64, 87, shade(colour, -0.14), 0.16, 0.2)
    ctx.beginPath()
    ctx.moveTo(20, UNIT)
    ctx.bezierCurveTo(13, 62, 18, 28, 33, 18)
    ctx.lineTo(67, 18)
    ctx.bezierCurveTo(82, 28, 87, 62, 80, UNIT)
    ctx.closePath()
    ctx.fill()
  } else if (style === 'bun') {
    ctx.fillStyle = clay(ctx, 37, 0, 26, 26, shade(colour, -0.1), 0.2, 0.18)
    ellipse(ctx, 50, 12, 12, 11)
  }
  noCast(ctx)
}

/** The part that covers the skull, drawn over the face. */
function drawHairFront(
  ctx: CanvasRenderingContext2D,
  depth: Depth,
  style: string,
  colour: string,
): void {
  if (style === 'none') return
  // Onto the forehead. A hairline with no shadow under it is a wig painted on.
  cast(ctx, depth, 4, 2.5, 0.3)
  ctx.fillStyle = clay(ctx, 26, 10, 48, 34, colour, 0.24, 0.16)

  if (style === 'buzz') {
    // Follows the skull to the temple instead of stopping in a straight line
    // across it, which is what made this read as a swim cap.
    ctx.beginPath()
    ctx.moveTo(28.5, 42)
    ctx.bezierCurveTo(27.5, 20, 37, 13.5, 50, 13.5)
    ctx.bezierCurveTo(63, 13.5, 72.5, 20, 71.5, 42)
    ctx.lineTo(67.5, 42)
    ctx.bezierCurveTo(67, 27, 60, 23, 50, 23)
    ctx.bezierCurveTo(40, 23, 33, 27, 32.5, 42)
    ctx.closePath()
    ctx.fill()
  } else if (style === 'curls') {
    // Seven overlapping discs rather than one mass: curls are lumps, and a
    // lumpy outline is the entire read at any size. Each one casts, so the pile
    // has depth inside itself rather than being one silhouette.
    for (const [x, y, r] of [
      [31, 24, 10],
      [41, 15, 11],
      [53, 12.5, 11.5],
      [65, 18, 10.5],
      [70, 28, 9],
      [50, 23, 13],
      [36, 32, 8],
    ] as const) {
      ellipse(ctx, x, y, r, r * 0.92)
    }
  } else if (style === 'bun') {
    ctx.beginPath()
    ctx.moveTo(28, 40)
    ctx.bezierCurveTo(27, 18, 37, 11, 50, 11)
    ctx.bezierCurveTo(63, 11, 73, 18, 72, 40)
    ctx.bezierCurveTo(67, 27, 58, 22.5, 50, 22.5)
    ctx.bezierCurveTo(42, 22.5, 33, 27, 28, 40)
    ctx.closePath()
    ctx.fill()
  } else if (style === 'crop') {
    // A side part with a fringe that drops further on the heavy side.
    ctx.beginPath()
    ctx.moveTo(27, 44)
    ctx.bezierCurveTo(25, 18, 36, 10, 50, 10)
    ctx.bezierCurveTo(64, 10, 74, 18, 73, 40)
    ctx.bezierCurveTo(69, 29, 62, 24.5, 54, 26.5)
    ctx.bezierCurveTo(46, 28.5, 37, 33, 33, 44)
    ctx.closePath()
    ctx.fill()
  } else {
    // bob, long and wave share a crown; the difference is what the back layer
    // did and how far the front strands come down past the ear.
    const drop = style === 'bob' ? 50 : 58
    ctx.beginPath()
    ctx.moveTo(25, drop)
    ctx.bezierCurveTo(23, 20, 35, 10, 50, 10)
    ctx.bezierCurveTo(65, 10, 77, 20, 75, drop)
    ctx.lineTo(68, drop)
    ctx.bezierCurveTo(69, 33, 62, 25.5, 50, 25.5)
    ctx.bezierCurveTo(38, 25.5, 31, 33, 32, drop)
    ctx.closePath()
    ctx.fill()
  }
  noCast(ctx)
}

/* ---- accessories -------------------------------------------------------- */

function drawAccessory(ctx: CanvasRenderingContext2D, depth: Depth, style: string): void {
  if (style === 'studs' || style === 'roundStuds') {
    cast(ctx, depth, 1.5, 1, 0.3)
    ctx.fillStyle = '#F0E2BE'
    ellipse(ctx, 27.8, 51.5, 2.1, 2.1)
    ellipse(ctx, 72.2, 51.5, 2.1, 2.1)
    noCast(ctx)
  }
  if (style === 'none' || style === 'studs') return

  const round = style !== 'square'
  // Frames are the one stroked thing in the whole avatar, because a lens rim is
  // a line — filling one would make it a mask. They sit off the face, so the
  // cast is what puts them there rather than painted onto it.
  cast(ctx, depth, 2.5, 1.8, 0.3)
  ctx.strokeStyle = round ? '#9C7C3C' : '#26262C'
  ctx.lineWidth = 2.4
  ctx.lineJoin = 'round'

  ctx.beginPath()
  if (round) {
    ctx.moveTo(48.2, 44)
    ctx.arc(41.5, 44, 6.7, 0, Math.PI * 2)
    ctx.moveTo(65.2, 44)
    ctx.arc(58.5, 44, 6.7, 0, Math.PI * 2)
  } else {
    ctx.roundRect(34.3, 38.5, 14.4, 11.4, 3.4)
    ctx.roundRect(51.3, 38.5, 14.4, 11.4, 3.4)
  }
  // The bridge and both arms, in one path with the lenses so the whole pair is
  // a single stroke and the joins stay even.
  ctx.moveTo(round ? 48.2 : 48.7, 44)
  ctx.lineTo(round ? 51.8 : 51.3, 44)
  ctx.moveTo(round ? 34.8 : 34.3, 44)
  ctx.lineTo(28.5, 44.8)
  ctx.moveTo(round ? 65.2 : 65.7, 44)
  ctx.lineTo(71.5, 44.8)
  ctx.stroke()
  noCast(ctx)
}
