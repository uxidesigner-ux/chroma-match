/**
 * What the body's shape *is*, independent of what is drawing it.
 *
 * Two things read this: the live model in the studio, made of three.js nodes
 * and buffer attributes, and the exporter, made of glTF JSON and a binary
 * chunk. Both have to produce the same character — a downloaded avatar that
 * does not match the one on screen is worse than one that cannot be downloaded
 * at all — and the only way to be sure of that is for the rule to exist once.
 *
 * So the rule is here, written against the smallest interface either side can
 * satisfy, and neither side knows how the other stores a vertex.
 */
import type { AnimeSpec, FigureStep, HairStyle } from './anime-spec.ts'

/** A humanoid bone this cares about, named as VRM names it. */
export type ShapedBone =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'head'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftUpperArm'
  | 'rightUpperArm'

/**
 * One node of a skeleton, whichever form it is stored in.
 *
 * `rest` is the node's translation as the model shipped, never as the last pass
 * left it: the shoulders move by translation, and a pass that started from the
 * previous pass's numbers would drift a little further out every time.
 */
export interface ShapeNode {
  /** Whatever the backend uses to tell two of its own nodes apart. */
  readonly key: unknown
  readonly rest: readonly [number, number, number]
  setScale(x: number, y: number, z: number): void
  setTranslation(x: number, y: number, z: number): void
  children(): ShapeNode[]
}

export interface Skeleton {
  bone(name: ShapedBone): ShapeNode | null
}

/**
 * How wide a figure axis draws, as a multiplier on the bone's own width.
 *
 * Step 3 is exactly 1, so a character saved before the studio could change a
 * figure comes back the shape it was. The range is deliberately modest — this
 * is one body reproportioned, and a bone scaled much past a quarter either way
 * starts to tear the clothing mesh away from the skin under it.
 */
export function figureScale(step: FigureStep, reach: number): number {
  return 1 + ((step - 3) / 3) * reach
}

/**
 * Reproportions the one body along five axes.
 *
 * The torso is a single chain — hips, spine, chest — and a bone's scale carries
 * down to everything under it, so widening the hips would widen the legs and
 * the whole upper body with them. Each bone therefore gets the scale its own
 * region needs divided by whatever it has already inherited, and the parts that
 * should not change shape — thighs, neck, shoulders and arms, the backpack —
 * are divided back out to one.
 *
 * Shoulder width is the exception: an arm scaled sideways bends wrongly, so the
 * shoulders are moved apart instead. Two offsets do that, because the joint
 * sits out from the spine and the collarbone runs from there to the arm — along
 * its own axis rather than along X in this rig, so it is lengthened as a whole
 * vector while the joint moves sideways only. Head size is the other exception,
 * and the only scale allowed to carry down, because the hair and the eyes under
 * it should grow with it.
 *
 * Only width, depth and the head move. Nothing here changes how tall the
 * character stands, which keeps the camera framing and every exported image the
 * size it was.
 */
export function applyFigure(spec: AnimeSpec, skeleton: Skeleton): void {
  const hip = figureScale(spec.hip, 0.26)
  const waist = figureScale(spec.waist, 0.22)
  const bust = figureScale(spec.bust, 0.24)

  const flat = (node: ShapeNode | null, value: number) => node?.setScale(value, 1, value)
  const hips = skeleton.bone('hips')
  const spine = skeleton.bone('spine')
  const chest = skeleton.bone('chest')
  flat(hips, hip)
  flat(chest, bust / waist)
  // Whatever hangs off a widened bone is divided back out to its own shape, by
  // walking the children rather than naming them: the legs under the hips, and
  // the neck, both shoulders and the backpack under the chest.
  for (const child of hips?.children() ?? [])
    flat(child, child.key === spine?.key ? waist / hip : 1 / hip)
  for (const child of chest?.children() ?? []) flat(child, 1 / bust)

  /*
   * The chest already carries the shoulders outward as it widens, so this is
   * the amount on top of that, which is what makes the two axes separable. It
   * reaches further than the scaled axes because moving a joint does not pull
   * the clothing mesh off the skin the way widening a bone does.
   */
  const shoulder = figureScale(spec.shoulder, 0.45)
  for (const name of ['leftShoulder', 'rightShoulder'] as const) {
    const node = skeleton.bone(name)
    if (node) node.setTranslation(node.rest[0] * shoulder, node.rest[1], node.rest[2])
  }
  for (const name of ['leftUpperArm', 'rightUpperArm'] as const) {
    const node = skeleton.bone(name)
    if (node) node.setTranslation(node.rest[0] * shoulder, node.rest[1] * shoulder, node.rest[2] * shoulder)
  }
  const head = skeleton.bone('head')
  const crown = figureScale(spec.head, 0.2)
  head?.setScale(crown, crown, crown)
}

/*
 * Where the chest is, in the model's own metres: between the chest bone and the
 * neck bone. Both the search for sculptable geometry and the sculpt itself work
 * in these coordinates, because a skinned mesh's vertices are stored in bind
 * space and this model stands in its bind pose at the origin.
 */
export const CHEST_LOW = 1.06
export const CHEST_HIGH = 1.29
/*
 * The centre of one breast, and the point it domes away from.
 *
 * That point sits well back inside the ribcage on purpose. Put it just under
 * the surface and the shape pushes sideways as readily as forward, widening the
 * body instead of rounding it; set deep, the direction is dominated by forward
 * and the sideways part only rounds the edges, which is the shape wanted.
 */
const BUST_Y = 1.155
const BUST_X = 0.062
const BUST_ANCHOR_Z = -0.11
/*
 * How wide each side reaches, and how much further it reaches downward.
 *
 * The width matters more than it looks: a dome as tall as it is wide comes to a
 * point, so the base is kept well over half again the height the amount can
 * add. Below the centre the distance counts for less, which carries the shape
 * on down and lets it run out into the ribcage rather than stopping on a rim —
 * a breast is not symmetric about its own middle.
 */
const BUST_REACH = 0.105
const BUST_UNDER = 1.6
/** The body, the clothing on it, and the badge printed on that clothing. */
export const SCULPTED = new Set(['body_bake', 'body_nm', 'huku_bake', 'anim_logo'])
/*
 * What moves whole rather than vertex by vertex. The badge straddles the middle
 * of the shape — measured, y 1.071 to 1.172 against a centre at 1.155 — so the
 * field would push its top out five centimetres and its bottom nothing,
 * shearing a stiff printed shape.
 */
export const RIGID = new Set(['anim_logo'])

/** How far the chest comes forward for this character, in metres. Zero for male. */
export function bustAmount(spec: AnimeSpec): number {
  // Never a fixed size for a female character: the chest axis still says how
  // much, so the two controls do not fight.
  return spec.sex === 'female' ? 0.022 + spec.bust * 0.007 : 0
}

/**
 * Where one point of the surface goes, and how strongly it is moved.
 *
 * Nothing behind the spine moves at all. In front, a vertex leaves a point set
 * back inside the ribcage — which is what rounds the shape rather than shearing
 * it — by an amount that falls off with its distance from the centre of its own
 * side, measured across the body.
 *
 * Writes the displacement into `out` and returns the falloff, which callers use
 * to lean the normal by the same amount.
 */
export function bustField(amount: number, x: number, y: number, z: number, out: number[]): number {
  out[0] = out[1] = out[2] = 0
  if (amount <= 0 || z <= 0) return 0
  // Below the centre the distance counts for less, so the shape carries on down
  // and runs out into the ribcage instead of ending on a rim.
  const dy = y - BUST_Y
  const rise = dy < 0 ? dy / BUST_UNDER : dy
  let strongest = 0
  for (const side of [-BUST_X, BUST_X]) {
    const across = Math.hypot(x - side, rise)
    if (across >= BUST_REACH) continue
    const t = 1 - across / BUST_REACH
    /*
     * Smoothstep squared. Plain smoothstep is already flat at the peak, but it
     * sheds height too quickly on the way out and leaves a shape that reads as
     * a cone; squaring it holds the top rounder and spends the falloff over the
     * outer half, which is where a breast actually curves.
     */
    const smooth = t * t * (3 - 2 * t)
    /*
     * And held back over the breastbone, which does not come forward on
     * anybody. Without this the neckline's own slit is pulled open from inside
     * and shows two gaps through the front of the shirt.
     */
    const inner = Math.min(1, Math.abs(x) / BUST_X)
    const sternum = 0.3 + 0.7 * inner * inner * (3 - 2 * inner)
    const fall = smooth * smooth * (3 - 2 * smooth) * sternum
    /*
     * The nearer side wins rather than the two being added. Summed, the pair
     * merge into one shelf across the sternum; taken one at a time they stay
     * two, with the valley between them that makes them read as two.
     */
    if (fall <= strongest) continue
    strongest = fall
    let ox = x - side
    let oy = dy
    let oz = z - BUST_ANCHOR_Z
    const reach = Math.hypot(ox, oy, oz) || 1
    ox /= reach
    oy /= reach
    oz /= reach
    out[0] = ox * amount * fall
    out[1] = oy * amount * fall
    out[2] = oz * amount * fall
  }
  return strongest
}

/** How far a normal leans past the turn the surface itself makes. */
const BUST_LEAN = 1.4

/**
 * Sculpts one mesh's vertices, from the model's own vertices rather than from
 * the last pass's, so the amount goes down as readily as up and male lands back
 * on the mesh its author shipped bit for bit.
 *
 * `rigid` takes the displacement at the mesh's own middle and keeps its
 * proportions, which is what a badge on a garment does.
 */
export function sculptChest(
  amount: number,
  rigid: boolean,
  rest: { position: Float32Array; normal: Float32Array },
  into: { setPosition(i: number, x: number, y: number, z: number): void; setNormal(i: number, x: number, y: number, z: number): void },
): void {
  const count = rest.position.length / 3
  const move = [0, 0, 0]
  if (rigid) {
    const centre = [0, 0, 0]
    for (let i = 0; i < count; i++)
      for (let axis = 0; axis < 3; axis++) centre[axis]! += rest.position[i * 3 + axis]! / count
    bustField(amount, centre[0]!, centre[1]!, centre[2]!, move)
    for (let i = 0; i < count; i++) {
      const o = i * 3
      into.setPosition(i, rest.position[o]! + move[0]!, rest.position[o + 1]! + move[1]!, rest.position[o + 2]! + move[2]!)
      into.setNormal(i, rest.normal[o]!, rest.normal[o + 1]!, rest.normal[o + 2]!)
    }
    return
  }
  for (let i = 0; i < count; i++) {
    const o = i * 3
    const px = rest.position[o]!
    const py = rest.position[o + 1]!
    const pz = rest.position[o + 2]!
    const fall = bustField(amount, px, py, pz, move)
    into.setPosition(i, px + move[0]!, py + move[1]!, pz + move[2]!)
    if (fall <= 0) {
      into.setNormal(i, rest.normal[o]!, rest.normal[o + 1]!, rest.normal[o + 2]!)
      continue
    }
    /*
     * Shading has to follow the new surface or the bust reads flat. The normal
     * leans the way the vertex moved; it leans further than the surface itself
     * turns because this model is shaded in toon bands, and a lean that does
     * not carry a normal across a band edge produces a shape that is there in
     * the silhouette and invisible from the front.
     */
    const length = Math.hypot(move[0]!, move[1]!, move[2]!) || 1
    const lean = fall * BUST_LEAN
    let nx = rest.normal[o]! + (move[0]! / length) * lean
    let ny = rest.normal[o + 1]! + (move[1]! / length) * lean
    let nz = rest.normal[o + 2]! + (move[2]! / length) * lean
    const unit = Math.hypot(nx, ny, nz) || 1
    nx /= unit
    ny /= unit
    nz /= unit
    into.setNormal(i, nx, ny, nz)
  }
}

/*
 * Whether the ponytail is drawn, and how long it runs as a multiple of the
 * length the model ships with.
 *
 * The cap cannot be styled from here: it is one mesh weighted almost entirely
 * to the head bone, so scaling the strand chains around it moves a few dozen
 * vertices at the tips and nothing else. What each style adds around the cap
 * lives in hair-strands.ts; this is only the ponytail the model already has.
 *
 * Long hair used to be the ponytail at one and a half times its length, which
 * was the longest the model could be asked for. It has a curtain of its own
 * now, and a ponytail inside that curtain is a strand nobody can see, so the
 * style that swings is the one named for it and no other.
 */
export const HAIR_SHAPE: Record<HairStyle, { tail: number; ponytail: boolean }> = {
  tails: { tail: 1, ponytail: true },
  bob: { tail: 1, ponytail: false },
  long: { tail: 1, ponytail: false },
}
