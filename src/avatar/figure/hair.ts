/**
 * Hair: a scalp that sits on the actual skull, and locks that are lofted bands.
 *
 * Two things here are deliberate reversals of how this was built before.
 *
 * The scalp is a sheet with a rim I place per direction, not a shell cut by a
 * plane. A hairline is high at the forehead, drops at the temple and drops
 * again behind the ear, and a plane through a shell cannot do that — which is
 * why every previous style came out as a thick cover clamped round the face.
 *
 * The locks are lofted bands with a flat section, not tubes. A tube has a round
 * section and reads as cable; hair falls in ribbons that are much wider than
 * they are thick. Their width and thickness both taper to nothing at the end,
 * so a lock comes to a point instead of stopping in a blunt hem.
 */

import { BufferGeometry, CatmullRomCurve3, Vector3 } from 'three'
import { dome, loft, mix, smoothstep } from './build'
import { headSurface } from './head'

/** Where the hairline sits, as a polar angle from straight up, per azimuth. */
function rimAngle(phi: number): number {
  // phi: 0 at the front, pi at the back.
  const front = Math.cos(phi) // 1 forward, -1 back
  const side = Math.abs(Math.sin(phi))
  // Low at the temple, high across the forehead, lowest behind. The temple
  // term is what stops the hairline reading as a ruled line across the brow —
  // a constant angle projects as a straight edge and nothing about a hairline
  // is straight.
  // Low at the temple, high across the forehead, lowest behind. The temple
  // term is what stops the hairline reading as a ruled line across the brow —
  // a constant angle projects as a straight edge and nothing about a hairline
  // is straight. The back reaches well below the ear so the scalp arrives at
  // the lengths instead of stopping short and leaving a seam.
  return (
    Math.PI *
    (0.430 - 0.115 * front + 0.190 * side * side + 0.175 * smoothstep(0.2, -1, front))
  )
}

/** The scalp, offset off the head's own surface so it cannot gape. */
export function scalpGeometry(lift = 0.055): BufferGeometry {
  return dome(128, 40, (u, v) => {
    const phi = u * Math.PI * 2
    const theta = Math.pow(v, 0.92) * rimAngle(phi)
    const dir = new Vector3(
      Math.sin(theta) * Math.sin(phi),
      Math.cos(theta),
      Math.sin(theta) * Math.cos(phi),
    ).normalize()
    const p = headSurface(dir)
    // Thicker over the crown and the back, thinning to nothing at the rim so
    // the scalp ends in an edge rather than a wall.
    const thin = 1 - Math.pow(v, 3.2)
    const bulk = lift * (0.55 + 0.75 * smoothstep(0.1, 0.9, Math.cos(theta)) + 0.35 * smoothstep(0.3, -0.9, Math.cos(phi)))
    return p.addScaledVector(dir, bulk * thin)
  })
}

export interface Lock {
  /** Points the band passes through, in head units. */
  path: [number, number, number][]
  /** Half width at the root and at the tip. */
  width: [number, number]
  /** Half thickness at the root and at the tip. */
  thick: [number, number]
  /** Fraction along the lock where it is widest. */
  belly?: number
  roll?: number
}

export function lockGeometry(lock: Lock): BufferGeometry {
  const curve = new CatmullRomCurve3(
    lock.path.map((p) => new Vector3(p[0], p[1], p[2])),
    false,
    'catmullrom',
    0.4,
  )
  const belly = lock.belly ?? 0.42
  return loft(curve, 44, 22, (t) => {
    // Widest somewhere along its length, not at the root: a lock of hair swells
    // where it leaves the head and draws in again at the tip.
    const swell = Math.sin(Math.PI * Math.pow(t, Math.log(0.5) / Math.log(belly)))
    const taper = Math.pow(1 - t, 0.55)
    return {
      width: mix(lock.width[0], lock.width[1], t) * mix(0.72, 1.0, swell) * mix(1, taper, 0.55),
      thick: mix(lock.thick[0], lock.thick[1], t) * mix(0.8, 1.0, swell) * mix(1, taper, 0.5),
      roll: lock.roll ?? 0,
    }
  })
}
