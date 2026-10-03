/** Local, conforming tessellation of the pinned torso before sculpting.
 * Linear subdivision leaves the author's rest surface unchanged. Midpoints
 * then sample the curved sculpt rather than drawing one straight edge across
 * its underside. All three consumers use the same float32 rest attributes. */
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
  const arm = (i: number) => [0, 1, 2, 3].some(j => weights[i * 4 + j]! > .1 && joints[i * 4 + j]! >= 30 && joints[i * 4 + j]! <= 78 && joints[i * 4 + j] !== 37)
  // Stop as soon as the local edges reach about 1 cm; a few extra bounded
  // passes also catch diagonals introduced when only two edges were split.
  for (let pass = 0; pass < 6; pass++) {
    const split = new Map<string, number>()
    for (let i = 0; i < index.length; i += 3) {
      const tri = index.slice(i, i + 3)
      if (!tri.some(eligible) || tri.some(arm)) continue
      for (let j = 0; j < 3; j++) {
        const a = tri[j]!, b = tri[(j + 1) % 3]!
        if (!eligible(a) && !eligible(b)) continue
        if (Math.hypot(...[0, 1, 2].map(k => p[a * 3 + k]! - p[b * 3 + k]!)) > .01005) split.set(key(a, b), -1)
      }
    }
    if (!split.size) break
    const midpoint = (a: number, b: number): number | undefined => {
      const edge = key(a, b), hit = split.get(edge)
      if (hit === undefined || hit >= 0) return hit
      const at = p.length / 3
      for (let k = 0; k < 3; k++) p.push(Math.fround((p[a * 3 + k]! + p[b * 3 + k]!) / 2))
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
