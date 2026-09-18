/**
 * The head, sculpted rather than assembled.
 *
 * Proportions are in head units: the skull is 2.0 tall from crown to chin,
 * centred on the origin, so y = +1 is the crown and y = -1 the chin. Every
 * other part of the figure is measured against that, which is what keeps a face
 * the same size and the same impression when the hair around it changes.
 *
 * The first attempt at this added a brow blob, a cheek blob and a chin blob to
 * a sphere, and it failed the same way the old hair did and for the same
 * reason: a silhouette that nobody designed. Adding lumps gave a pear with
 * pointed ears. So the outline comes first here — one superellipsoid whose
 * exponent makes a rounded box rather than a ball — and the modelling on top of
 * it is wide and shallow, never enough to change the outline.
 */

import { BufferGeometry, SphereGeometry, Vector3 } from 'three'
import { blob, sculpt, smoothstep } from './build'

/** Half width at the temple. */
export const HEAD_HALF_W = 0.795
/** Half depth. */
export const HEAD_HALF_D = 0.820
/**
 * How square the head is in section. 2 is an ellipsoid and reads as a ball;
 * this carries a broad frontal plane with the curvature gathered at the temple
 * and the jaw, which is what light needs to describe a face.
 */
const SQUARENESS = 2.45

export const EYE_Y = 0.010
export const EYE_X = 0.262
export const EYE_W = 0.098
export const EYE_H = 0.118

export const NOSE_Y = -0.235
export const NOSE_OUT = 0.215

/** Where the ray along `n` leaves a superellipsoid of half axes (a, b, c). */
function superRadius(n: Vector3, a: number, b: number, c: number, k: number): number {
  const s =
    Math.pow(Math.abs(n.x) / a, k) +
    Math.pow(Math.abs(n.y) / b, k) +
    Math.pow(Math.abs(n.z) / c, k)
  return Math.pow(s, -1 / k)
}

/** Half width and half depth at a given height. Gentle: the outline is the box. */
function axesAt(y: number): { a: number; c: number } {
  const jaw = smoothstep(-0.30, -1.0, y)
  const crown = smoothstep(0.55, 1.0, y)
  return {
    a: HEAD_HALF_W * (1 - 0.145 * jaw - 0.060 * crown),
    c: HEAD_HALF_D * (1 - 0.110 * jaw - 0.040 * crown),
  }
}

/**
 * Where the surface of the head is, in the direction `n`.
 *
 * Exported because the hair sits on it. A scalp fitted to its own guess at the
 * skull gapes at the temple; one built from the head's own surface cannot, and
 * it is also what keeps a face the same size under every hairstyle.
 */
export function headSurface(n: Vector3): Vector3 {
    const { a, c } = axesAt(n.y)
    const r = superRadius(n, a, 1.0, c, SQUARENESS)
    const p = new Vector3(n.x * r, n.y * r, n.z * r)

    // Only the front of the head gets modelled; the back is skull.
    const front = smoothstep(-0.05, 0.60, n.z)

    // The brow: a wide, shallow shelf across the whole forehead. Narrow and
    // deep gives a crease, which is a frown, which is a face with an opinion.
    const brow = blob(Math.hypot(p.x / 0.62, (p.y - 0.190) / 0.190), 1)
    p.z += brow * 0.026 * front

    // The cheek: very wide, very shallow, low on the face. Without it the
    // stretch from the eyes to the chin is one unbroken surface, which is the
    // note about the face reading as a single lump.
    const cheek = blob(Math.hypot((Math.abs(p.x) - 0.300) / 0.420, (p.y + 0.230) / 0.330), 1)
    p.z += cheek * 0.030 * front

    // The chin, wide and low. Forward, not down: pulling it down lengthens the
    // face and the reference face is not long.
    const chin = blob(Math.hypot(p.x / 0.400, (p.y + 0.800) / 0.330), 1)
    p.z += chin * 0.052 * front

    // The nose. Its falloff is slower above the tip than below, so the bridge
    // runs up between the eyes and the underside turns away sharply enough to
    // hold a shadow. A symmetric bump gives the soft smudge this had before.
    const dy = p.y - NOSE_Y
    const vy = dy > 0 ? dy / 0.250 : dy / 0.150
    const nose = blob(Math.hypot(p.x / 0.196, vy), 1)
    p.z += nose * NOSE_OUT * front
    p.y -= nose * 0.022

    return p
}

export function headGeometry(): BufferGeometry {
  return sculpt(new SphereGeometry(1, 192, 128), headSurface)
}

/** An ear. Small and set back; under most hair you will only catch the lobe. */
export function earGeometry(): BufferGeometry {
  const g = new SphereGeometry(1, 40, 28)
  return sculpt(g, (n) => new Vector3(n.x * 0.048, n.y * 0.148, n.z * 0.100))
}

export function earPosition(side: number): Vector3 {
  const { a } = axesAt(0.0)
  return new Vector3(side * (a - 0.040), 0.005, -0.135)
}

/** One eye: a flattened bead set into the surface rather than stuck onto it. */
export function eyeGeometry(): BufferGeometry {
  const g = new SphereGeometry(1, 56, 40)
  return sculpt(g, (n) => new Vector3(n.x * EYE_W, n.y * EYE_H, n.z * 0.080))
}

/**
 * Where an eye sits, solved against the same surface the head is built from, so
 * the eyes stay on the face when the face is retuned rather than drifting off.
 */
export function eyePosition(side: number): Vector3 {
  const { a, c } = axesAt(EYE_Y)
  const rest =
    Math.pow(Math.abs(EYE_X) / a, SQUARENESS) + Math.pow(Math.abs(EYE_Y) / 1.0, SQUARENESS)
  const z = rest >= 1 ? 0 : c * Math.pow(1 - rest, 1 / SQUARENESS)
  return new Vector3(side * EYE_X, EYE_Y, z - 0.030)
}
