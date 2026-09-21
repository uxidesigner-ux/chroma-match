export type Point3 = readonly [number, number, number]
export interface CharacterBounds {
  min: Point3
  max: Point3
}

/** Fit all eight corners, including depth, at any yaw and screen aspect. */
export function fitFullBody(bounds: CharacterBounds, aspect: number, yaw: number) {
  const target: Point3 = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ]
  const tanV = Math.tan(Math.PI / 12) // 30 degree vertical field of view
  const tanH = tanV * Math.max(0.01, aspect)
  let distance = 0.1
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        const dx = x - target[0],
          dy = y - target[1],
          dz = z - target[2]
        const horizontal = Math.cos(yaw) * dx - Math.sin(yaw) * dz
        const depth = Math.sin(yaw) * dx + Math.cos(yaw) * dz
        distance = Math.max(
          distance,
          depth + (Math.abs(horizontal) * 1.14) / tanH,
          depth + (Math.abs(dy) * 1.14) / tanV,
        )
      }
    }
  }
  return { target, distance }
}
