/**
 * Mesh-building helpers.
 *
 * These exist because the two shapes this character is made of — a skull and a
 * lock of hair — are both badly served by the primitives a library ships with.
 * A sphere is not a head and a tube is not a lock: a tube has a round section,
 * and a round section is exactly what made the old hair read as lengths of
 * cable glued to a scalp. Hair is a flattened band with a width that changes
 * along it, so that is what `loft` sweeps.
 */

import { CatmullRomCurve3, Vector3, BufferGeometry, BufferAttribute } from 'three'

/** Smooth 0→1 ramp, the same one the shading language has. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** A bump that falls off smoothly to nothing at `radius`. */
export function blob(distance: number, radius: number): number {
  const t = Math.min(1, Math.max(0, distance / radius))
  const u = 1 - t * t
  return u * u * u
}

export interface LoftSection {
  /** Half width, across the band. */
  width: number
  /** Half thickness, through the band. */
  thick: number
  /** Turn of the section about the curve, in radians. */
  roll: number
}

/**
 * Sweep a flattened section along a curve.
 *
 * The frame is carried along the curve from a fixed reference up vector rather
 * than taken from the curve's own second derivative. A Frenet frame flips
 * wherever the curve straightens out, and a flipped frame puts a half turn in
 * the middle of a lock of hair — which looks exactly like the ribbon artefact
 * it is. Carrying the frame keeps it continuous whatever the curve does.
 */
export function loft(
  curve: CatmullRomCurve3,
  steps: number,
  radial: number,
  section: (t: number) => LoftSection,
): BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  let up = new Vector3(0, 0, 1)
  const rings: { centre: Vector3; x: Vector3; y: Vector3; s: LoftSection }[] = []

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const centre = curve.getPoint(t)
    const tangent = curve.getTangent(t).normalize()
    // Re-orthogonalise the carried up vector against the new tangent instead of
    // recomputing it, so the frame rotates as little as it can from ring to ring.
    const side = new Vector3().crossVectors(up, tangent)
    if (side.lengthSq() < 1e-8) {
      side.crossVectors(new Vector3(1, 0, 0), tangent)
    }
    side.normalize()
    up = new Vector3().crossVectors(tangent, side).normalize()
    rings.push({ centre, x: side.clone(), y: up.clone(), s: section(t) })
  }

  for (let i = 0; i < rings.length; i++) {
    const { centre, x, y, s } = rings[i]!
    const cr = Math.cos(s.roll)
    const sr = Math.sin(s.roll)
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2
      // An ellipse, not a circle: width across the band, thickness through it.
      const ex = Math.cos(a) * s.width
      const ey = Math.sin(a) * s.thick
      const rx = ex * cr - ey * sr
      const ry = ex * sr + ey * cr
      const p = centre.clone().addScaledVector(x, rx).addScaledVector(y, ry)
      positions.push(p.x, p.y, p.z)
      uvs.push(j / radial, i / (rings.length - 1))
    }
  }

  const perRing = radial + 1
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * perRing + j
      const b = a + perRing
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }

  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  g.setIndex(indices)
  // Derived from the built surface rather than from the section formula. The
  // analytic version was wrong wherever the section was much wider than it was
  // thick, which is every lock of hair, and wrong normals on a glossy material
  // is exactly the grey-plastic look this was meant to get away from.
  g.computeVertexNormals()
  return g
}

/**
 * Move every vertex of a sphere to where a shaping function puts it, then
 * rebuild the normals from the result.
 *
 * Sculpting by displacement rather than by blending primitives together is the
 * point. A smooth minimum of a few solids always inflates where they meet, so
 * a brow, a cheekbone and a jaw done that way come out as one swollen mass —
 * which is the note on the current face. Displacement leaves the surface
 * exactly where the function says, so a flat plane stays flat.
 */
export function sculpt(
  geometry: BufferGeometry,
  shape: (dir: Vector3) => Vector3,
): BufferGeometry {
  const pos = geometry.getAttribute('position') as BufferAttribute
  const dir = new Vector3()
  for (let i = 0; i < pos.count; i++) {
    dir.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize()
    const p = shape(dir)
    pos.setXYZ(i, p.x, p.y, p.z)
  }
  pos.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

/**
 * A disc-topology sheet: one boundary, no hole, like a scalp.
 *
 * `u` runs round it and `v` from the centre out to the rim, so the rim can be
 * put in a different place for every direction. A sphere cut by a plane cannot
 * do that, and a hairline is not a plane — it is high at the forehead, low at
 * the temple and lower still behind the ear.
 */
export function dome(
  uSteps: number,
  vSteps: number,
  point: (u: number, v: number) => Vector3,
): BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let j = 0; j <= vSteps; j++) {
    const v = j / vSteps
    for (let i = 0; i <= uSteps; i++) {
      const u = i / uSteps
      const p = point(u, v)
      positions.push(p.x, p.y, p.z)
      uvs.push(u, v)
    }
  }
  const per = uSteps + 1
  for (let j = 0; j < vSteps; j++) {
    for (let i = 0; i < uSteps; i++) {
      const a = j * per + i
      const b = a + per
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}
