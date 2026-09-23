import type { HairStyle } from './anime-spec.ts'

/*
 * Hair the model does not have, built from the one strand it does.
 *
 * The cap is a single mesh weighted almost entirely to the head bone, so it
 * cannot be restyled: scaling the strand chains around it moves a few dozen
 * vertices at the tips and nothing else. The ponytail is different — 156
 * vertices of real hair with real UVs into the hair texture — so longer hair is
 * made by standing copies of it around the skull rather than by authoring
 * geometry that would need a texture of its own.
 *
 * What that buys and what it costs, both measured:
 *
 * - It reaches shoulder length and stops. Every copy is the same tapered
 *   ribbon, so stretching one amplifies both the gaps between them and the
 *   points they end in: past the shoulder a curtain reads as stripes with a
 *   saw for a hem.
 * - The locks down the sides of the face matter more than the curtain behind.
 *   With the curtain alone the character is unchanged from the front, which is
 *   the view the lobby and the profile both use.
 * - Nothing sways. These are rigid to the head bone, where the ponytail has a
 *   six-bone chain. At this length, standing still, that reads as hair; it
 *   would not at twice it.
 */
export interface HairStrand {
  /** Turn about the head's up axis: how far around the skull it stands. */
  readonly turn: number
  /** Lean back off the skull, so a curtain falls behind the shoulders. */
  readonly lean: number
  /** Roll out from the head, so a lock by the face clears the jaw. */
  readonly roll: number
  /** Where it hangs from, in the head bone's own space. */
  readonly at: readonly [number, number, number]
  /** How long, as a multiple of the ponytail's own length. */
  readonly length: number
  /** Mirrored: a fan of one handed strand shows its tapered edge down one side. */
  readonly flip: boolean
}

/*
 * The curtain down the back. Thirteen is enough that the gaps between strands
 * read as strands rather than as gaps, and the hem is a cosine rather than a
 * straight cut across thirteen points.
 */
const BACK = { count: 13, spread: 1, lean: 0.3, dome: 0.15, at: [0, 0.03, -0.035] } as const
/*
 * The locks beside the face. They hang from above the ear and tuck up under the
 * cap, which is what hides the join; the roll is small on purpose, because past
 * about a tenth of a radian the tips splay out into hooks instead of hanging.
 */
const SIDE = { out: 0.088, up: 0.105, front: 0.035, roll: 0.06, step: 0.045 } as const

function curtain(length: number): HairStrand[] {
  const out: HairStrand[] = []
  for (let i = 0; i < BACK.count; i++) {
    const across = i / (BACK.count - 1) - 0.5
    out.push({
      turn: across * BACK.spread * 2,
      lean: BACK.lean,
      roll: 0,
      at: BACK.at,
      length: length * (1 - BACK.dome * (1 - Math.cos(across * Math.PI))),
      flip: across < 0,
    })
  }
  return out
}

function locks(count: number, length: number): HairStrand[] {
  const out: HairStrand[] = []
  for (const hand of [-1, 1]) {
    for (let i = 0; i < count; i++) {
      const across = count === 1 ? 0 : i / (count - 1) - 0.5
      out.push({
        turn: 0,
        lean: 0,
        roll: -hand * SIDE.roll,
        at: [hand * SIDE.out, SIDE.up, SIDE.front + across * SIDE.step],
        length: length * (1 - Math.abs(across) * 0.25),
        flip: hand < 0,
      })
    }
  }
  return out
}

/**
 * The strands a style stands around the head, beyond the cap the model ships.
 *
 * The ponytail style adds none: it is the model as its author rigged it, and a
 * curtain would bury the one part that actually swings.
 */
export function hairStrands(style: HairStyle): readonly HairStrand[] {
  if (style === 'bob') return locks(2, 0.85)
  if (style === 'long') return [...curtain(1.15), ...locks(2, 1.25)]
  return []
}

/**
 * Stands a strand upright.
 *
 * The ponytail hangs down, back and to one side at once. Copies of that
 * diagonal only stack the same diagonal — which reads as a scarf — so it is
 * first turned to hang straight down, by the direction of its own lowest tenth.
 */
export function straighten(local: Float32Array): Float32Array {
  let lowest = Infinity
  for (let i = 1; i < local.length; i += 3) lowest = Math.min(lowest, local[i]!)
  let tipX = 0
  let tipY = 0
  let tipZ = 0
  let tips = 0
  for (let i = 0; i < local.length; i += 3)
    if (local[i + 1]! < lowest * 0.9) {
      tipX += local[i]!
      tipY += local[i + 1]!
      tipZ += local[i + 2]!
      tips++
    }
  if (!tips) return local.slice()
  const unit = Math.hypot(tipX, tipY, tipZ) || 1
  return turnOnto([tipX / unit, tipY / unit, tipZ / unit], [0, -1, 0], local)
}

/** One rotation after another: `later` applied on top of `first`. */
function then(
  later: readonly [number, number, number, number],
  first: readonly [number, number, number, number],
): [number, number, number, number] {
  const [ax, ay, az, aw] = later
  const [bx, by, bz, bw] = first
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

/** A turn of `angle` about one axis. */
function about(axis: 0 | 1 | 2, angle: number): [number, number, number, number] {
  const out: [number, number, number, number] = [0, 0, 0, Math.cos(angle / 2)]
  out[axis] = Math.sin(angle / 2)
  return out
}

/** Rotates every point by the rotation that carries `from` onto `to`. */
function turnOnto(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  points: Float32Array,
): Float32Array {
  const dot = from[0] * to[0] + from[1] * to[1] + from[2] * to[2]
  let axis: [number, number, number] = [
    from[1] * to[2] - from[2] * to[1],
    from[2] * to[0] - from[0] * to[2],
    from[0] * to[1] - from[1] * to[0],
  ]
  let angle = Math.acos(Math.max(-1, Math.min(1, dot)))
  const length = Math.hypot(...axis)
  // Already there, or exactly opposite: any perpendicular axis will do.
  if (length < 1e-8) {
    if (dot > 0) return points.slice()
    axis = Math.abs(from[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
    angle = Math.PI
  } else {
    axis = [axis[0] / length, axis[1] / length, axis[2] / length]
  }
  const sin = Math.sin(angle / 2)
  return spin([axis[0] * sin, axis[1] * sin, axis[2] * sin, Math.cos(angle / 2)], points)
}

/** Applies a quaternion to every point. */
function spin(q: readonly [number, number, number, number], points: Float32Array): Float32Array {
  const out = new Float32Array(points.length)
  const [qx, qy, qz, qw] = q
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i]!
    const y = points[i + 1]!
    const z = points[i + 2]!
    const ix = qw * x + qy * z - qz * y
    const iy = qw * y + qz * x - qx * z
    const iz = qw * z + qx * y - qy * x
    const iw = -qx * x - qy * y - qz * z
    out[i] = ix * qw + iw * -qx + iy * -qz - iz * -qy
    out[i + 1] = iy * qw + iw * -qy + iz * -qx - ix * -qz
    out[i + 2] = iz * qw + iw * -qz + ix * -qy - iy * -qx
  }
  return out
}

/**
 * The same strand, mirrored across X.
 *
 * Mirrored geometry rather than a negative scale on the node: a negative scale
 * turns the triangles inside out, which glTF says a reader should correct for
 * and not every reader does.
 */
export function mirror(
  positions: Float32Array,
  index: Uint32Array,
): { positions: Float32Array; index: Uint32Array } {
  const flipped = positions.slice()
  for (let i = 0; i < flipped.length; i += 3) flipped[i] = -flipped[i]!
  const wound = index.slice()
  for (let i = 0; i + 2 < wound.length; i += 3) {
    const swap = wound[i + 1]!
    wound[i + 1] = wound[i + 2]!
    wound[i + 2] = swap
  }
  return { positions: flipped, index: wound }
}

/** Flat-shaded-per-vertex normals, averaged over the faces that meet at one. */
export function normalsFor(positions: Float32Array, index: Uint32Array): Float32Array {
  const out = new Float32Array(positions.length)
  for (let i = 0; i + 2 < index.length; i += 3) {
    const a = index[i]! * 3
    const b = index[i + 1]! * 3
    const c = index[i + 2]! * 3
    const ux = positions[b]! - positions[a]!
    const uy = positions[b + 1]! - positions[a + 1]!
    const uz = positions[b + 2]! - positions[a + 2]!
    const vx = positions[c]! - positions[a]!
    const vy = positions[c + 1]! - positions[a + 1]!
    const vz = positions[c + 2]! - positions[a + 2]!
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    for (const at of [a, b, c]) {
      out[at] = out[at]! + nx
      out[at + 1] = out[at + 1]! + ny
      out[at + 2] = out[at + 2]! + nz
    }
  }
  for (let i = 0; i < out.length; i += 3) {
    const unit = Math.hypot(out[i]!, out[i + 1]!, out[i + 2]!) || 1
    out[i] = out[i]! / unit
    out[i + 1] = out[i + 1]! / unit
    out[i + 2] = out[i + 2]! / unit
  }
  return out
}

/**
 * A strand's rotation as a quaternion, from the three angles it is described
 * by. Turn, then lean, then roll — the order three.js calls 'YXZ', so the
 * preview and the exported file stand a strand in the same place.
 */
export function strandRotation(strand: HairStrand): [number, number, number, number] {
  return then(then(about(1, strand.turn), about(0, strand.lean)), about(2, strand.roll))
}
