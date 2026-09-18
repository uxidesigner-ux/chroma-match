/**
 * The garment: a knit crew neck.
 *
 * Its section is the body's own section pushed outward by a cloth thickness,
 * which is the one thing that makes skin coming through it impossible rather
 * than merely unlikely. That lesson survives from the previous build; what is
 * new is that the neckline, the shoulder and the cuff are real edges on a
 * separate piece of geometry instead of a colour change on the torso.
 */

import { BufferGeometry, CatmullRomCurve3, TorusGeometry, Vector3 } from 'three'
import { bodyAxes, SHOULDER_HALF, SHOULDER_Y } from './body'
import { dome, loft, mix, smoothstep } from './build'

/** Where the neck opening sits. */
export const NECKLINE_Y = -1.40
const CLOTH = 0.070

/**
 * The body of the jumper, as a tube with a hole at the neck.
 *
 * Built as a sheet whose rim is the neckline and whose other end is the hem, so
 * both edges are edges — a closed blob with the neck pushed through it has no
 * neckline, and that is what "a coloured torso" looks like.
 */
export function topGeometry(): BufferGeometry {
  const hem = -3.15
  return dome(144, 72, (u, v) => {
    const phi = u * Math.PI * 2
    // v = 0 at the neckline, 1 at the hem.
    const y = mix(NECKLINE_Y, hem, Math.pow(v, 0.94))
    const { a, c } = bodyAxes(y)
    // The collar rolls over: right at the neckline the cloth turns back in.
    const roll = smoothstep(0.055, 0.0, v)
    const grow = CLOTH * (1 - 0.65 * roll)
    const k = 2.6
    const ux = Math.sin(phi)
    const uz = Math.cos(phi)
    const r = Math.pow(
      Math.pow(Math.abs(ux) / (a + grow), k) + Math.pow(Math.abs(uz) / (c + grow), k),
      -1 / k,
    )
    // Ribbing. Shallow enough that it is a material cue and not corrugation:
    // it changes how the light breaks across the chest, not the silhouette.
    const rib = Math.cos(phi * 34) * 0.006 * smoothstep(0.02, 0.14, v)
    return new Vector3(ux * (r + rib), y, uz * (r + rib))
  })
}

/** The rib band round the neck opening. */
export function collarGeometry(): BufferGeometry {
  const { a } = bodyAxes(NECKLINE_Y)
  return new TorusGeometry(a + CLOTH * 0.55, 0.052, 20, 96)
}

/** A sleeve, lofted from the shoulder down the upper arm. */
export function sleeveGeometry(side: number): BufferGeometry {
  const curve = new CatmullRomCurve3(
    [
      new Vector3(side * SHOULDER_HALF * 0.34, SHOULDER_Y + 0.12, 0),
      new Vector3(side * SHOULDER_HALF * 0.86, SHOULDER_Y - 0.10, -0.02),
      new Vector3(side * SHOULDER_HALF * 1.06, SHOULDER_Y - 0.92, -0.06),
      new Vector3(side * SHOULDER_HALF * 1.10, SHOULDER_Y - 1.60, -0.08),
    ],
    false,
    'catmullrom',
    0.4,
  )
  return loft(curve, 36, 28, (t) => ({
    width: mix(0.52, 0.30, smoothstep(0.05, 0.85, t)),
    thick: mix(0.46, 0.28, smoothstep(0.05, 0.85, t)),
    roll: 0,
  }))
}
