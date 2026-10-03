import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { readGlb } from './studio-export.ts'
import { refineChestSurface } from './chest-surface.ts'
import { sculptChest } from './body-shape.ts'
import { DEFAULT_ANIME, wear } from './anime-spec.ts'
import { buildWardrobe } from './wardrobe.ts'

test('curved torso and embossed tunic retain outward front faces at the largest chest', () => {
  const file = readFileSync(new URL('../../public/avatars/seed-v1/seed-san.vrm', import.meta.url))
  const { json, binary } = readGlb(file.buffer.slice(file.byteOffset, file.byteOffset + file.length))
  const read = (id: number, width: number) => {
    const accessor = json.accessors[id]!, view = json.bufferViews[accessor.bufferView]!, data = new DataView(binary.buffer, binary.byteOffset)
    const size = [5126, 5125].includes(accessor.componentType) ? 4 : accessor.componentType === 5123 ? 2 : 1
    return Array.from({ length: accessor.count * width }, (_, i) => {
      const at = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + Math.floor(i / width) * (view.byteStride ?? width * size) + i % width * size
      return accessor.componentType === 5126 ? data.getFloat32(at, true) : size === 4 ? data.getUint32(at, true) : size === 2 ? data.getUint16(at, true) : data.getUint8(at)
    })
  }
  const mesh = json.meshes[json.nodes.find(n => n.name === 'wear')!.mesh!]!
  for (const name of ['body_bake', 'huku_bake']) {
    const primitive = mesh.primitives.find(p => json.materials[p.material]!.name === name)!, attrs = primitive.attributes
    const shape = refineChestSurface({ positions: Float32Array.from(read(attrs.POSITION!, 3)), normals: Float32Array.from(read(attrs.NORMAL!, 3)), uv: Float32Array.from(read(attrs.TEXCOORD_0!, 2)), joints: Uint16Array.from(read(attrs.JOINTS_0!, 4)), weights: Float32Array.from(read(attrs.WEIGHTS_0!, 4)), index: Uint32Array.from(read(primitive.indices!, 1)) })
    const position = shape.positions.slice(), normal = shape.normals.slice()
    sculptChest(.064, false, { position: shape.positions, normal: shape.normals }, { setPosition: (i, ...v) => position.set(v, i * 3), setNormal: (i, ...v) => normal.set(v, i * 3) })
    let checked = 0, inverted = 0, collapsed = 0
    for (let i = 0; i < shape.index.length; i += 3) {
      const ids = Array.from(shape.index.slice(i, i + 3))
      if (!ids.every(v => shape.positions[v * 3 + 1]! > 1.035 && shape.positions[v * 3 + 1]! < 1.26 && shape.positions[v * 3 + 2]! > .03 && Math.abs(shape.positions[v * 3]!) < .13)) continue
      const [a, b, c] = ids.map(v => Array.from(position.slice(v * 3, v * 3 + 3))) as [number[], number[], number[]]
      const u = b.map((v, k) => v - a[k]!), v = c.map((n, k) => n - a[k]!)
      const cross = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]
      const n = [0, 1, 2].map(k => ids.reduce((sum, v) => sum + normal[v * 3 + k]!, 0))
      if (cross.reduce((sum, v, k) => sum + v * n[k]!, 0) < -1e-12) inverted++
      if (Math.hypot(...cross) < 1e-12) collapsed++
      checked++
    }
    assert.ok(checked > 20000, `${name}: upper torso was not refined`)
    assert.equal(inverted, 0, `${name}: curved refinement reversed front faces`)
    assert.equal(collapsed, 0, `${name}: curved refinement collapsed front faces`)
  }
})

test('fitted chest shells do not fold across the centre join at any sampled size', () => {
  const file = readFileSync(new URL('../../public/avatars/seed-v1/seed-san.vrm', import.meta.url))
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.length)
  for (const bust of [0, 3, 6] as const) for (const top of ['roundShort', 'vShort', 'roundLong', 'vLong'] as const) {
    const part = buildWardrobe(buffer, wear({ ...DEFAULT_ANIME, sex: 'female', bust }, { top, bottom: 'skirtShort', shoes: 'dress' }))!.parts.find(p => p.name === 'wardrobe_top')!
    const p = part.positions, n = part.normals
    let checked = 0, inverted = 0
    for (let i = 0; i < part.index.length; i += 3) {
      const ids = Array.from(part.index.slice(i, i + 3))
      if (!ids.every(v => p[v * 3 + 1]! > 1.10 && p[v * 3 + 1]! < 1.21 && Math.abs(p[v * 3]!) < .018 && p[v * 3 + 2]! > .04)) continue
      const [a, b, c] = ids.map(v => Array.from(p.slice(v * 3, v * 3 + 3))) as [number[], number[], number[]]
      const u = b.map((v, k) => v - a[k]!), v = c.map((n, k) => n - a[k]!)
      const cross = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]
      const normal = [0, 1, 2].map(k => ids.reduce((sum, v) => sum + n[v * 3 + k]!, 0))
      if (cross.reduce((sum, v, k) => sum + v * normal[k]!, 0) < -1e-12) inverted++
      checked++
    }
    assert.ok(checked > 1000, `${top}/${bust}: missing centre surface`)
    assert.equal(inverted, 0, `${top}/${bust}: centre shell folded over its neighbour`)
  }
})
