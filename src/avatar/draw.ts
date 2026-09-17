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
 * The style is matte clay: rounded forms, no outlines, and light that falls
 * from the upper left as a soft gradient with no hot spot. That last part is
 * what "matte" means here and it is the whole difference between clay and
 * plastic — a specular highlight would read as glass, and this game already
 * has glass on the board.
 *
 * Everything is laid out in a 100×100 space and scaled at the end, so the same
 * code draws a 28px row thumbnail and a 96px profile portrait. The features are
 * deliberately coarse for that reason: two eyes and a nose, no mouth, no brows.
 * At 28 pixels a mouth is three grey pixels that read as a smudge, and a face
 * that looks wrong small is worse than a face that is simple everywhere.
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
 * The matte fill for a form: lit from the upper left, shaded to the lower
 * right, with the base colour holding the middle so the object still reads as
 * the colour it is meant to be rather than as a gradient swatch.
 */
function clay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  base: string,
  lift = 0.16,
  drop = 0.14,
): CanvasGradient {
  const gradient = ctx.createLinearGradient(x, y, x + w * 0.75, y + h)
  gradient.addColorStop(0, shade(base, lift))
  gradient.addColorStop(0.45, base)
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

  // Clipped before anything is drawn, so every form can run off the edge of
  // the frame the way a portrait crop does rather than being drawn to fit
  // inside it — shoulders that stop short of the border read as a sticker.
  ctx.beginPath()
  if (options.round) ctx.arc(50, 50, 50, 0, Math.PI * 2)
  else ctx.rect(0, 0, UNIT, UNIT)
  ctx.clip()

  ctx.fillStyle = backdropOf(spec).colour
  ctx.fillRect(0, 0, UNIT, UNIT)

  drawHairBack(ctx, hair, hairColour)
  drawBody(ctx, outfit, cloth, skin)
  drawHead(ctx, skin, !COVERS_EARS.has(hair))
  drawFace(ctx, skin)
  drawHairFront(ctx, hair, hairColour)
  drawAccessory(ctx, accessory)

  ctx.restore()
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

function drawHead(ctx: CanvasRenderingContext2D, skin: string, ears: boolean): void {
  if (ears) {
    // Drawn first so the head's own shading covers where they meet it.
    ctx.fillStyle = clay(ctx, 24, 40, 12, 14, shade(skin, -0.06))
    ellipse(ctx, 29.5, 47, 4.6, 6)
    ctx.fillStyle = clay(ctx, 66, 40, 12, 14, shade(skin, -0.1))
    ellipse(ctx, 70.5, 47, 4.6, 6)
  }

  // The skull is a rounded rectangle rather than an oval: the reference shape
  // is a soft brick, with straight-ish temples and all the curvature in the
  // jaw. An oval reads as an egg, which is a different character entirely.
  ctx.fillStyle = clay(ctx, 30, 17, 40, 52, skin)
  ctx.beginPath()
  ctx.roundRect(30, 17, 40, 52, [19, 19, 17, 17])
  ctx.fill()

  // Where the jaw turns under. Without it the chin and the neck are one flat
  // field of the same colour and the head stops having a bottom.
  const under = ctx.createLinearGradient(0, 58, 0, 70)
  under.addColorStop(0, 'rgba(0, 0, 0, 0)')
  under.addColorStop(1, 'rgba(0, 0, 0, 0.1)')
  ctx.fillStyle = under
  ctx.beginPath()
  ctx.roundRect(30, 17, 40, 52, [19, 19, 17, 17])
  ctx.fill()
}

function drawFace(ctx: CanvasRenderingContext2D, skin: string): void {
  ctx.fillStyle = '#211C1A'
  ellipse(ctx, 42, 45, 2.5, 3.1)
  ellipse(ctx, 58, 45, 2.5, 3.1)

  // The nose is the one piece of relief on the face, so it carries its own
  // little shadow — it is what stops the front of the head reading as flat.
  // Only where the nose meets the face, and faint. A full ring around it at
  // any opacity reads on pale skin as a smudge rather than as contact.
  const cast = ctx.createLinearGradient(0, 52, 0, 57)
  cast.addColorStop(0, 'rgba(0, 0, 0, 0)')
  cast.addColorStop(1, 'rgba(0, 0, 0, 0.055)')
  ctx.fillStyle = cast
  ellipse(ctx, 50, 53.4, 4.3, 3.5)
  ctx.fillStyle = clay(ctx, 45, 48, 10, 8, shade(skin, 0.05), 0.14, 0.1)
  ellipse(ctx, 50, 52.4, 4.2, 3.4)
}

/* ---- body --------------------------------------------------------------- */

function drawBody(
  ctx: CanvasRenderingContext2D,
  outfit: string,
  cloth: string,
  skin: string,
): void {
  // Neck, drawn before the shoulders so the neckline cuts it off wherever the
  // outfit's collar happens to sit.
  ctx.fillStyle = clay(ctx, 42, 58, 16, 22, shade(skin, -0.12))
  ctx.beginPath()
  ctx.roundRect(42, 58, 16, 24, 7)
  ctx.fill()

  const shoulders = (): void => {
    ctx.beginPath()
    ctx.moveTo(4, UNIT)
    ctx.lineTo(4, 92)
    // One curve each side from the outer edge up to the neck: shoulders are a
    // slope, and a rounded rectangle here reads as a box someone is standing
    // behind.
    ctx.bezierCurveTo(10, 79, 26, 73, 39, 72)
    ctx.lineTo(61, 72)
    ctx.bezierCurveTo(74, 73, 90, 79, 96, 92)
    ctx.lineTo(96, UNIT)
    ctx.closePath()
  }

  ctx.fillStyle = clay(ctx, 4, 70, 92, 30, cloth, 0.13, 0.16)
  shoulders()
  ctx.fill()

  // Everything below dresses that silhouette. Each one is clipped to the
  // shoulders so a lapel or a hood can be drawn as a plain shape and still
  // finish exactly on the outline.
  ctx.save()
  shoulders()
  ctx.clip()

  if (outfit === 'crew') {
    neckline(ctx, cloth, 11)
  } else if (outfit === 'turtle') {
    ctx.fillStyle = clay(ctx, 38, 62, 24, 16, shade(cloth, 0.06))
    ctx.beginPath()
    ctx.roundRect(38.5, 62, 23, 15, 7)
    ctx.fill()
  } else if (outfit === 'hoodie') {
    neckline(ctx, cloth, 10)
    // The hood, sitting behind the neck and rolling over the shoulders.
    ctx.fillStyle = clay(ctx, 26, 62, 48, 22, shade(cloth, -0.1))
    ctx.beginPath()
    ctx.moveTo(30, 88)
    ctx.bezierCurveTo(28, 70, 38, 64, 50, 64)
    ctx.bezierCurveTo(62, 64, 72, 70, 70, 88)
    ctx.closePath()
    ctx.fill()
    neckline(ctx, shade(cloth, -0.1), 9)
    // Hanging from under the hood rather than floating on the chest, and long
    // enough to read as cord — two short ovals read as teeth.
    ctx.fillStyle = shade(cloth, 0.34)
    ctx.beginPath()
    ctx.roundRect(43.4, 84, 2.6, 16, 1.3)
    ctx.roundRect(54, 84, 2.6, 16, 1.3)
    ctx.fill()
  } else {
    // Shirt, tie and blazer all share a collar; only what sits under it moves.
    if (outfit === 'blazer') {
      ctx.fillStyle = clay(ctx, 38, 70, 24, 30, '#2A2C33')
      ctx.beginPath()
      ctx.moveTo(42, 72)
      ctx.lineTo(58, 72)
      ctx.lineTo(55, UNIT)
      ctx.lineTo(45, UNIT)
      ctx.closePath()
      ctx.fill()
    } else {
      neckline(ctx, cloth, 8)
    }

    if (outfit === 'tie') {
      ctx.fillStyle = clay(ctx, 45, 74, 10, 26, shade(cloth, -0.45))
      ctx.beginPath()
      ctx.moveTo(50, 76)
      ctx.lineTo(54, 81)
      ctx.lineTo(52.5, UNIT)
      ctx.lineTo(47.5, UNIT)
      ctx.lineTo(46, 81)
      ctx.closePath()
      ctx.fill()
    }

    const lapel = outfit === 'blazer'
    ctx.fillStyle = clay(ctx, 34, 70, 32, 20, shade(cloth, lapel ? -0.06 : 0.09))
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.4
    ctx.strokeStyle = ctx.fillStyle
    const flap = (sign: number): void => {
      ctx.beginPath()
      ctx.moveTo(50 + sign * 9, 71)
      ctx.lineTo(50 + sign * (lapel ? 1.5 : 0.5), lapel ? 84 : 83)
      ctx.lineTo(50 + sign * (lapel ? 15 : 15), lapel ? 90 : 84)
      ctx.closePath()
      // Stroked as well as filled, so the corners are rounded: a collar point
      // is pressed cloth, and a bare fill gives it three needle-sharp corners.
      ctx.fill()
      ctx.stroke()
    }
    flap(-1)
    flap(1)
  }

  ctx.restore()
}

/** The scoop of skin between the collarbones, however deep the outfit cuts. */
function neckline(ctx: CanvasRenderingContext2D, cloth: string, depth: number): void {
  ctx.fillStyle = clay(ctx, 40, 70, 20, 14, shade(cloth, -0.22))
  ctx.beginPath()
  ctx.ellipse(50, 72, 11, depth, 0, 0, Math.PI)
  ctx.fill()
}

/* ---- hair --------------------------------------------------------------- */

/** Whatever falls behind the head and the shoulders. */
function drawHairBack(ctx: CanvasRenderingContext2D, style: string, colour: string): void {
  if (style === 'bob') {
    ctx.fillStyle = clay(ctx, 24, 16, 52, 60, shade(colour, -0.12))
    ctx.beginPath()
    ctx.roundRect(25, 16, 50, 58, [24, 24, 16, 16])
    ctx.fill()
    return
  }
  if (style === 'long') {
    ctx.fillStyle = clay(ctx, 22, 16, 56, 84, shade(colour, -0.12))
    ctx.beginPath()
    ctx.roundRect(23, 16, 54, 84, [26, 26, 12, 12])
    ctx.fill()
    return
  }
  if (style === 'wave') {
    ctx.fillStyle = clay(ctx, 20, 15, 60, 85, shade(colour, -0.12))
    ctx.beginPath()
    ctx.moveTo(22, UNIT)
    ctx.bezierCurveTo(16, 62, 20, 30, 34, 20)
    ctx.lineTo(66, 20)
    ctx.bezierCurveTo(80, 30, 84, 62, 78, UNIT)
    ctx.closePath()
    ctx.fill()
    return
  }
  if (style === 'bun') {
    ctx.fillStyle = clay(ctx, 38, 2, 24, 22, shade(colour, -0.08))
    ellipse(ctx, 50, 13, 11, 10)
  }
}

/** The part that covers the skull, drawn over the face. */
function drawHairFront(ctx: CanvasRenderingContext2D, style: string, colour: string): void {
  if (style === 'none') return
  ctx.fillStyle = clay(ctx, 28, 12, 44, 30, colour, 0.18, 0.12)

  if (style === 'buzz') {
    // Follows the skull all the way to the temple instead of stopping in a
    // straight line across it, which is what made this read as a cap.
    ctx.beginPath()
    ctx.moveTo(30, 42)
    ctx.bezierCurveTo(29, 21, 38, 15, 50, 15)
    ctx.bezierCurveTo(62, 15, 71, 21, 70, 42)
    ctx.lineTo(66.5, 42)
    ctx.bezierCurveTo(66, 28, 60, 24, 50, 24)
    ctx.bezierCurveTo(40, 24, 34, 28, 33.5, 42)
    ctx.closePath()
    ctx.fill()
    return
  }

  if (style === 'curls') {
    // Six overlapping discs rather than one mass: curls are lumps, and a lumpy
    // outline is the entire read at any size.
    for (const [x, y, r] of [
      [33, 24, 9],
      [42, 16, 10],
      [53, 14, 10.5],
      [64, 19, 9.5],
      [69, 28, 8],
      [50, 24, 12],
    ] as const) {
      ellipse(ctx, x, y, r, r * 0.92)
    }
    return
  }

  if (style === 'bun') {
    ctx.beginPath()
    ctx.moveTo(29, 40)
    ctx.bezierCurveTo(28, 20, 38, 13, 50, 13)
    ctx.bezierCurveTo(62, 13, 72, 20, 71, 40)
    ctx.bezierCurveTo(66, 28, 58, 24, 50, 24)
    ctx.bezierCurveTo(42, 24, 34, 28, 29, 40)
    ctx.closePath()
    ctx.fill()
    return
  }

  if (style === 'crop') {
    // A side part with a fringe that drops further on the heavy side.
    ctx.beginPath()
    ctx.moveTo(28, 44)
    ctx.bezierCurveTo(26, 20, 36, 12, 50, 12)
    ctx.bezierCurveTo(64, 12, 73, 20, 72, 40)
    ctx.bezierCurveTo(68, 30, 62, 26, 54, 28)
    ctx.bezierCurveTo(46, 30, 38, 34, 34, 44)
    ctx.closePath()
    ctx.fill()
    return
  }

  // bob, long and wave share a crown; the difference is what the back layer did
  // and how far the front strands come down past the ear.
  const drop = style === 'bob' ? 50 : 58
  ctx.beginPath()
  ctx.moveTo(27, drop)
  ctx.bezierCurveTo(25, 22, 36, 12, 50, 12)
  ctx.bezierCurveTo(64, 12, 75, 22, 73, drop)
  ctx.lineTo(67, drop)
  ctx.bezierCurveTo(68, 34, 62, 27, 50, 27)
  ctx.bezierCurveTo(38, 27, 32, 34, 33, drop)
  ctx.closePath()
  ctx.fill()
}

/* ---- accessories -------------------------------------------------------- */

function drawAccessory(ctx: CanvasRenderingContext2D, style: string): void {
  if (style === 'studs' || style === 'roundStuds') {
    ctx.fillStyle = '#EFE3C2'
    ellipse(ctx, 29.5, 52, 1.9, 1.9)
    ellipse(ctx, 70.5, 52, 1.9, 1.9)
  }
  if (style === 'none' || style === 'studs') return

  const round = style !== 'square'
  // Frames are the one stroked thing in the whole avatar, because a lens rim
  // is a line — filling one would make it a mask.
  ctx.strokeStyle = round ? '#9A7B3C' : '#24242A'
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'

  ctx.beginPath()
  if (round) {
    ctx.moveTo(48.4, 45)
    ctx.arc(42, 45, 6.4, 0, Math.PI * 2)
    ctx.moveTo(64.4, 45)
    ctx.arc(58, 45, 6.4, 0, Math.PI * 2)
  } else {
    ctx.roundRect(35, 39.5, 14, 11, 3.2)
    ctx.roundRect(51, 39.5, 14, 11, 3.2)
  }
  // The bridge and both arms, in one path with the lenses so the whole pair is
  // a single stroke and the joins stay even.
  ctx.moveTo(round ? 48.4 : 49, 45)
  ctx.lineTo(round ? 51.6 : 51, 45)
  ctx.moveTo(round ? 35.6 : 35, 45)
  ctx.lineTo(30, 45.5)
  ctx.moveTo(round ? 64.4 : 65, 45)
  ctx.lineTo(70, 45.5)
  ctx.stroke()
}
