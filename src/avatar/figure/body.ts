/**
 * Neck, shoulders and chest — the skin the garment sits on.
 *
 * Built in the same head units as the head: y = -1 is the chin, so the neck
 * runs from about -1.0 down to -1.6 and the shoulder line is around -1.75.
 *
 * It is one sculpted form rather than a neck cylinder pushed into a chest box.
 * A cylinder meeting a box needs a blend, a blend swells at the join, and the
 * swelling is what made the old figure read as a post in a socket instead of a
 * neck on a body.
 */

import { BufferGeometry, SphereGeometry, Vector3 } from 'three'
import { mix, sculpt, smoothstep } from './build'

/** The bottom of the chin. Everything below is neck. */
export const CHIN_Y = -1.0
/** Where the shoulder line sits. */
export const SHOULDER_Y = -1.70
/** Half the shoulder span. */
export const SHOULDER_HALF = 1.16

/** Half width of the body at a height, and how deep it is there. */
export function bodyAxes(y: number): { a: number; c: number } {
  // The neck, then the trapezius opening out into the shoulder, then the chest.
  const neck = 0.335
  const toShoulder = smoothstep(-1.04, -1.80, y)
  const toChest = smoothstep(-1.75, -2.60, y)
  const a = mix(neck, SHOULDER_HALF, Math.pow(toShoulder, 0.68)) + 0.08 * toChest
  const c = mix(0.315, 0.520, Math.pow(toShoulder, 0.80)) + 0.06 * toChest
  return { a, c }
}

export function bodyGeometry(): BufferGeometry {
  const g = new SphereGeometry(1, 160, 128)
  // The sphere is remapped onto a vertical sweep: the polar angle picks the
  // height, the azimuth goes round the section.
  return sculpt(g, (n) => {
    const t = (n.y + 1) / 2 // 0 at the bottom, 1 at the top
    const y = mix(-3.05, -0.62, t)
    const { a, c } = bodyAxes(y)
    // Round the very top and bottom off so the form closes instead of ending
    // in a flat disc.
    const cap = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(n.y), 12)))
    const horiz = Math.hypot(n.x, n.z) || 1e-5
    const ux = n.x / horiz
    const uz = n.z / horiz
    // A rounded-rectangle section: shoulders are not round in plan.
    const k = 2.6
    const r = Math.pow(Math.pow(Math.abs(ux) / a, k) + Math.pow(Math.abs(uz) / c, k), -1 / k)
    return new Vector3(ux * r * cap, y, uz * r * cap)
  })
}
