/** Local, conforming curved tessellation of the pinned torso before sculpting.
 * Endpoint tangent planes place new samples on a rounded surface instead of
 * merely dividing the same flat source facet. Original vertices stay fixed.
 * All three consumers use the same float32 rest attributes. */
export interface ChestSurface {
  positions: Float32Array
  normals: Float32Array
  uv: Float32Array
  joints: Uint16Array
  weights: Float32Array
  index: Uint32Array
}

export function refineChestSurface(source: ChestSurface): ChestSurface {
  const p = Array.from(source.positions), n = Array.from(source.normals), uv = Array.from(source.uv)
  const joints = Array.from(source.joints), weights = Array.from(source.weights)
  let index = Array.from(source.index)
  const key = (a: number, b: number) => a < b ? `${a}/${b}` : `${b}/${a}`
  const eligible = (i: number) => p[i * 3 + 1]! > .985 && p[i * 3 + 1]! < 1.28 && p[i * 3 + 2]! > .015 && Math.abs(p[i * 3]!) < .17
  // The upper chest blends a small shoulder influence into the chest bone.
  // That is still torso, not an arm: excluding a whole triangle for its 11%
  // shoulder weight left 6 cm straight facets across the upper pole.
  const arm = (i: number) => [0, 1, 2, 3].reduce((sum, j) => sum + (joints[i * 4 + j]! >= 30 && joints[i * 4 + j]! <= 78 && joints[i * 4 + j] !== 37 ? weights[i * 4 + j]! : 0), 0) > .5
  // Stop as soon as the local edges reach about 5 mm; a few extra bounded
  // passes also catch diagonals introduced when only two edges were split.
  for (let pass = 0; pass < 7; pass++) {
    const split = new Map<string, number>()
    for (let i = 0; i < index.length; i += 3) {
      const tri = index.slice(i, i + 3)
      if (!tri.some(eligible) || tri.every(arm)) continue
      for (let j = 0; j < 3; j++) {
        const a = tri[j]!, b = tri[(j + 1) % 3]!
        if (!eligible(a) && !eligible(b)) continue
        const apex = [a, b].some(i => p[i * 3 + 1]! > 1.09 && p[i * 3 + 1]! < 1.195 && p[i * 3 + 2]! > .04 && Math.abs(p[i * 3]!) < .13)
        if (Math.hypot(...[0, 1, 2].map(k => p[a * 3 + k]! - p[b * 3 + k]!)) > (apex ? .00305 : .00505)) split.set(key(a, b), -1)
      }
    }
    if (!split.size) break
    // Tiny authored crease/detail triangles cannot accept the same curved
    // edge displacement as a broad torso facet. Bound each shared correction
    // by its thinnest incident triangle, preserving the original winding.
    const height = new Map<string, number>()
    for (let i = 0; i < index.length; i += 3) {
      const tri = index.slice(i, i + 3)
      const edges = tri.map((a, j) => key(a, tri[(j + 1) % 3]!))
      if (!edges.some(edge => split.has(edge))) continue
      const [a, b, c] = tri.map(v => [0, 1, 2].map(k => p[v * 3 + k]!)) as [number[], number[], number[]]
      const u = b.map((v, k) => v - a[k]!), v = c.map((n, k) => n - a[k]!)
      const area = Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!)
      for (let j = 0; j < 3; j++) {
        const a = tri[j]!, b = tri[(j + 1) % 3]!, edge = edges[j]!
        if (!split.has(edge)) continue
        const length = Math.hypot(...[0, 1, 2].map(k => p[a * 3 + k]! - p[b * 3 + k]!))
        height.set(edge, Math.min(height.get(edge) ?? Infinity, length ? area / length : 0))
      }
    }
    const midpoint = (a: number, b: number): number | undefined => {
      const edge = key(a, b), hit = split.get(edge)
      if (hit === undefined || hit >= 0) return hit
      const at = p.length / 3
      const delta = [0, 1, 2].map(k => p[b * 3 + k]! - p[a * 3 + k]!)
      const dotA = delta.reduce((sum, v, k) => sum + v * n[a * 3 + k]!, 0)
      const dotB = delta.reduce((sum, v, k) => sum + v * n[b * 3 + k]!, 0)
      // Average the two endpoint tangent-plane projections (Phong edge).
      // Flat surfaces stay flat; a convex corner receives a curved arc.
      const curve = [0, 1, 2].map(k => -(dotA * n[a * 3 + k]! - dotB * n[b * 3 + k]!) / 4)
      const localHeight = height.get(edge) ?? 0
      const guard = localHeight < Math.hypot(...delta) * .2 ? .005 : .1
      // A conforming split can propagate into adjacent waist triangles, but
      // only torso-interior edges may curve. Fade in above the waistband so
      // the existing skirt/seat fit remains an unchanged rest plane.
      const y = (p[a * 3 + 1]! + p[b * 3 + 1]!) / 2
      const fade = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t) }
      const taper = eligible(a) && eligible(b) ? fade((y - 1.015) / .035) * fade((1.28 - y) / .03) : 0
      const curveLength = Math.hypot(...curve), blend = Math.min(1, localHeight * guard / (curveLength || 1)) * taper
      for (let k = 0; k < 3; k++) p.push(Math.fround((p[a * 3 + k]! + p[b * 3 + k]!) / 2 + curve[k]! * blend))
      const normal = [0, 1, 2].map(k => (n[a * 3 + k]! + n[b * 3 + k]!) / 2), length = Math.hypot(...normal) || 1
      n.push(...normal.map(v => Math.fround(v / length)))
      for (let k = 0; k < 2; k++) uv.push(Math.fround((uv[a * 2 + k]! + uv[b * 2 + k]!) / 2))
      const influences = new Map<number, number>()
      for (const v of [a, b]) for (let k = 0; k < 4; k++) influences.set(joints[v * 4 + k]!, (influences.get(joints[v * 4 + k]!) ?? 0) + weights[v * 4 + k]! / 2)
      const ranked = [...influences].sort((a, b) => b[1] - a[1]).slice(0, 4), total = ranked.reduce((sum, v) => sum + v[1], 0)
      for (let k = 0; k < 4; k++) { joints.push(ranked[k]?.[0] ?? 0); weights.push(Math.fround((ranked[k]?.[1] ?? 0) / total)) }
      split.set(edge, at)
      return at
    }
    const next: number[] = []
    for (let i = 0; i < index.length; i += 3) {
      const v = index.slice(i, i + 3), m = v.map((a, j) => midpoint(a, v[(j + 1) % 3]!))
      const count = m.filter(x => x !== undefined).length
      if (!count) { next.push(...v); continue }
      if (count === 3) { next.push(v[0]!, m[0]!, m[2]!, m[0]!, v[1]!, m[1]!, m[2]!, m[1]!, v[2]!, m[0]!, m[1]!, m[2]!); continue }
      const start = count === 1 ? m.findIndex(x => x !== undefined) : m.findIndex((x, j) => x !== undefined && m[(j + 1) % 3] !== undefined)
      const a = v[start]!, b = v[(start + 1) % 3]!, c = v[(start + 2) % 3]!, ab = m[start]!
      if (count === 1) next.push(a, ab, c, ab, b, c)
      else { const bc = m[(start + 1) % 3]!; next.push(b, bc, ab, a, ab, c, ab, bc, c) }
    }
    index = next
  }
  return { positions: Float32Array.from(p), normals: Float32Array.from(n), uv: Float32Array.from(uv), joints: Uint16Array.from(joints), weights: Float32Array.from(weights), index: Uint32Array.from(index) }
}
