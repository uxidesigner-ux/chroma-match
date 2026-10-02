import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { DEFAULT_ANIME, TOP_STYLES, BOTTOM_STYLES, SHOE_STYLES, wear } from './anime-spec.ts'
import type { BottomStyle, ShoeStyle, TopStyle } from './anime-spec.ts'
import { decodeSpec, encodeSpec, isKnownSpec, SPEC_MAX } from './spec.ts'
import { lookFile, parseLookFile, LookHistory } from './studio-library.ts'
import { buildWardrobe, wardrobeColour } from './wardrobe.ts'
import { exportSeed, readGlb } from './studio-export.ts'
import { Ray, Vector3 } from 'three'

const bytes = readFileSync(new URL('../../public/avatars/seed-v1/seed-san.vrm', import.meta.url))
const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
const tops = Object.keys(TOP_STYLES) as Exclude<TopStyle, 'seed'>[]
const bottoms = Object.keys(BOTTOM_STYLES) as Exclude<BottomStyle, 'seed'>[]
const footwear = Object.keys(SHOE_STYLES) as ShoeStyle[]

test('every fitted wardrobe, colour and figure round trips in a bounded v7 profile/backup', () => {
  for (const sex of ['male', 'female'] as const) for (const top of tops) for (const bottom of bottoms) for (const shoes of footwear) {
    const spec = wear({ ...DEFAULT_ANIME, sex, bust: 6, hip: 0, shoulder: 6, skinColour: 'A9714B', bottomColour: 'A234EF', shoeColour: '123456' }, { top, bottom, shoes })
    const code = encodeSpec(spec)
    assert.equal(code.length, 57)
    assert.ok(code.length <= SPEC_MAX)
    assert.match(code, /^7[a-zA-Z0-9]+$/)
    assert.deepEqual(decodeSpec(code), spec)
    assert.ok(isKnownSpec(code))
    assert.deepEqual(parseLookFile(lookFile(spec)), spec)
  }
  assert.equal(encodeSpec(DEFAULT_ANIME), '4STNN67B7A3A899E891ADB8202C3D33333FFFFFFM')
})

test('a garment selection replaces the legacy outfit once, then changes only its own slot', () => {
  const first = wear(DEFAULT_ANIME, { bottom: 'skirtLong' })
  assert.equal(first.top, 'roundShort'); assert.equal(first.bottom, 'skirtLong'); assert.equal(first.shoes, 'basketball')
  const second = wear(first, { shoes: 'heels' })
  assert.equal(second.top, first.top); assert.equal(second.bottom, first.bottom)
  const history = new LookHistory(); history.push(DEFAULT_ANIME, first); history.push(first, second)
  assert.deepEqual(history.undo(second), first)
  assert.deepEqual(history.undo(first), DEFAULT_ANIME)
  assert.deepEqual(history.redo(DEFAULT_ANIME), first)
})

test('unknown garment identifiers, partial tails and a mismatched envelope fail safely', () => {
  const code = encodeSpec(wear(DEFAULT_ANIME, { top: 'vLong', shoes: 'heels' }))
  for (const broken of [code.slice(0, -1), code.slice(0, 42) + 'X' + code.slice(43), '4' + code.slice(1), '7' + encodeSpec(DEFAULT_ANIME).slice(1), code + 'A', code.slice(0, 45) + 'G'.repeat(12)]) {
    assert.equal(isKnownSpec(broken), false)
    assert.deepEqual(decodeSpec(broken), DEFAULT_ANIME)
    assert.throws(() => parseLookFile(JSON.stringify({ format: 'chroma-character', version: 1, code: broken })))
  }
})

test('all 64 fitted combinations have finite normalized skinning, solid openings and retain hands', () => {
  for (const top of tops) for (const bottom of bottoms) for (const shoes of footwear) {
    const spec = wear(DEFAULT_ANIME, { top, bottom, shoes })
    const wardrobe = buildWardrobe(source, spec)!
    assert.equal(wardrobe.skin, 4)
    for (const part of wardrobe.parts) {
      const count = part.positions.length / 3
      assert.ok(count > 0, part.name)
      assert.equal(part.normals.length, count * 3)
      assert.equal(part.uv.length, count * 2)
      assert.equal(part.joints.length, count * 4)
      assert.equal(part.weights.length, count * 4)
      assert.ok([...part.positions, ...part.normals, ...part.weights].every(Number.isFinite), part.name)
      assert.ok([...part.index].every(index => index < count), part.name)
      assert.ok([...part.joints].every(joint => joint < 80), part.name)
      for (let i = 0; i < count; i++) {
        const weights = part.weights.subarray(i * 4, i * 4 + 4)
        assert.ok([...weights].every(w => w >= 0 && w <= 1))
        assert.ok(Math.abs(weights.reduce((a, b) => a + b, 0) - 1) < 2e-6, `${part.name}/${i}: normalized influences`)
      }
    }
    const skin = wardrobe.parts.find(part => part.paint === 'skin')!
    let fingers = 0
    for (let i = 0; i < skin.positions.length / 3; i++) for (let j = 0; j < 4; j++) {
      if (skin.joints[i * 4 + j]! >= 35 && skin.joints[i * 4 + j]! <= 78 && skin.joints[i * 4 + j] !== 37 && skin.weights[i * 4 + j]! > .2) { fingers++; break }
    }
    assert.ok(fingers > 200, `${top}/${bottom}/${shoes} hid the hands`)
    assert.ok(wardrobe.parts.some(part => part.name === 'wardrobe_top_binding' && part.index.length > 20))
    if (shoes !== 'bare') assert.ok(wardrobe.parts.some(part => part.name === 'wardrobe_shoe_binding' && part.index.length > 20))
  }
})

test('palette edits reuse geometry; body edits refit the soles without mutating the pinned source', () => {
  const before = Buffer.from(new Uint8Array(source))
  assert.equal(buildWardrobe(source, DEFAULT_ANIME), null)
  const spec = wear(DEFAULT_ANIME, { top: 'vLong', bottom: 'skirtLong', shoes: 'heels' })
  const first = buildWardrobe(source, spec)
  assert.strictEqual(buildWardrobe(source, { ...spec, expression: 'happy', outfitColour: 'FF0000' }), first)
  const reshaped = buildWardrobe(source, { ...spec, waist: 0, hip: 6, shoulder: 0, head: 6 })!
  assert.notStrictEqual(reshaped, first)
  assert.strictEqual(reshaped.parts.find(part => part.paint === 'top'), first!.parts.find(part => part.paint === 'top'))
  assert.notStrictEqual(reshaped.parts.find(part => part.paint === 'sole'), first!.parts.find(part => part.paint === 'sole'))
  assert.notStrictEqual(buildWardrobe(source, { ...spec, sex: 'female', bust: 6 }), first)
  assert.deepEqual(Buffer.from(source), before)
})

function readAccessor(glb: ReturnType<typeof readGlb>, at: number): number[] {
  const a = glb.json.accessors[at]!, b = glb.json.bufferViews[a.bufferView]!
  const width = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type]!
  const size = a.componentType === 5121 ? 1 : a.componentType === 5123 ? 2 : 4
  const view = new DataView(glb.binary.buffer, glb.binary.byteOffset)
  const result: number[] = []
  for (let i = 0; i < a.count * width; i++) {
    const offset = (b.byteOffset ?? 0) + (a.byteOffset ?? 0) + Math.floor(i / width) * (b.byteStride ?? size * width) + (i % width) * size
    result.push(a.componentType === 5126 ? view.getFloat32(offset, true) : size === 1 ? view.getUint8(offset) : size === 2 ? view.getUint16(offset, true) : view.getUint32(offset, true))
  }
  return result
}

function bodyTriangles(): [Vector3, Vector3, Vector3][] {
  const glb = readGlb(source), node = glb.json.nodes.find(node => node.name === 'wear')!
  const primitive = glb.json.meshes[node.mesh!]!.primitives.find(p => glb.json.materials[p.material]!.name === 'body_bake')!
  const position = readAccessor(glb, primitive.attributes.POSITION!), joints = readAccessor(glb, primitive.attributes.JOINTS_0!)
  const weights = readAccessor(glb, primitive.attributes.WEIGHTS_0!), indices = readAccessor(glb, primitive.indices!)
  const body: [Vector3, Vector3, Vector3][] = []
  for (let i = 0; i < indices.length; i += 3) {
    const at = indices.slice(i, i + 3)
    // The body's A-pose includes fingers at waist height; exclude those by
    // actual influences, not a coordinate box that also contains the hands.
    if (at.some(v => [0, 1, 2, 3].some(j => weights[v * 4 + j]! > .1 && joints[v * 4 + j]! >= 30 && joints[v * 4 + j]! <= 78 && joints[v * 4 + j] !== 37))) continue
    body.push(at.map(v => new Vector3().fromArray(position, v * 3)) as [Vector3, Vector3, Vector3])
  }
  return body
}

test('skirts seat on the torso, clear only the tucked shirt and follow bare hips without floating', () => {
  const body = bodyTriangles()
  for (const bottom of ['skirtLong', 'skirtShort'] as const) {
    const part = buildWardrobe(source, wear(DEFAULT_ANIME, { bottom, shoes: 'dress' }))!.parts.find(p => p.paint === 'bottom')!
    for (const y of [.949, .941, .927, .895, .875, .850, .82, .79]) {
      let measured = 0
      const section = body.filter(t => !t.every(v => v.y < y) && !t.every(v => v.y > y))
      for (let i = 0; i < part.positions.length; i += 3) {
        const p = new Vector3().fromArray(part.positions, i)
        if (Math.abs(p.y - y) > 1e-6) continue
        const ray = new Ray(new Vector3(0, y, .007), new Vector3(p.x, 0, p.z - .007).normalize())
        let radius = 0
        for (const t of section) {
          const hit = ray.intersectTriangle(...t, false, new Vector3())
          if (hit) radius = Math.max(radius, hit.distanceTo(ray.origin))
        }
        assert.ok(radius > 0, `${bottom}/${y}: no torso behind the waistband`)
        const gap = p.distanceTo(ray.origin) - radius
        assert.ok(gap >= .0054 && gap <= .0121, `${bottom}/${y}: ${gap} m clearance`)
        for (let j = 0; j < 4; j++) assert.ok(part.weights[i / 3 * 4 + j]! < .1 || part.joints[i / 3 * 4 + j]! < 30, 'waist bound to an arm')
        measured++
      }
      assert.equal(measured, 65)
    }
    const xs = Array.from(part.positions).filter((_, i) => i % 3 === 0)
    assert.ok(Math.max(...xs.map(Math.abs)) < .17, 'slim skirt regressed to a flared cone')
  }
})

test('body-fit skirts taper from the seat, enclose both legs and keep a smooth pencil panel', () => {
  const body = bodyTriangles()
  for (const bottom of ['skirtLong', 'skirtShort'] as const) {
    const part = buildWardrobe(source, wear(DEFAULT_ANIME, { bottom }))!.parts.find(p => p.paint === 'bottom')!
    const rows = new Map<string, Vector3[]>()
    for (let i = 0; i < part.positions.length; i += 3) {
      const p = new Vector3().fromArray(part.positions, i), key = p.y.toFixed(5)
      const row = rows.get(key) ?? []
      row.push(p); rows.set(key, row)
    }
    const rings = [...rows.values()].sort((a, b) => b[0]!.y - a[0]!.y)
    const seat = rings.filter(r => r[0]!.y > .70 && r[0]!.y < .88), hem = rings.at(-1)!
    const width = (r: Vector3[]) => Math.max(...r.map(p => p.x)) - Math.min(...r.map(p => p.x))
    const depth = (r: Vector3[]) => Math.max(...r.map(p => p.z)) - Math.min(...r.map(p => p.z))
    assert.ok(width(hem) < Math.max(...seat.map(width)) * .98, `${bottom}: hem wider than fitted seat`)
    assert.ok(depth(hem) < Math.max(...seat.map(depth)) * .90, `${bottom}: suspended hip-depth cylinder`)
    let minimumClearance = Infinity, narrowestLevel = 0
    for (const ring of rings.filter(r => r[0]!.y < .79)) {
      const y = ring[0]!.y
      const edges: Vector3[] = []
      for (const triangle of body) for (let i = 0; i < 3; i++) {
        const a = triangle[i]!, b = triangle[(i + 1) % 3]!
        if ((a.y < y) !== (b.y < y)) edges.push(a.clone().lerp(b, (y - a.y) / (b.y - a.y)))
      }
      assert.ok(edges.length > 10, 'no body section under the skirt')
      // Independent polygon containment: every actual thigh/calf section is
      // inside one joined skirt ring, with clearance, not two trouser lobes.
      for (const p of edges) for (let i = 0; i < 64; i++) {
        const a = ring[i]!, b = ring[i + 1]!, dx = b.x - a.x, dz = b.z - a.z
        const clearance = (dx * (p.z - a.z) - dz * (p.x - a.x)) / Math.hypot(dx, dz)
        if (clearance < minimumClearance) { minimumClearance = clearance; narrowestLevel = y }
      }
    }
    assert.ok(minimumClearance > .002, `${bottom}/${narrowestLevel}: less than 2 mm section clearance (${minimumClearance})`)
    if (bottom === 'skirtLong') {
      const thigh = rings.find(r => Math.abs(r[0]!.y - .567) < 1e-6)!
      for (const row of rings.filter(r => r[0]!.y < .567)) for (let i = 0; i < 65; i++) {
        const radius = (p: Vector3) => Math.hypot(p.x, p.z - .007)
        const t = (.567 - row[0]!.y) / (.567 - .175)
        const straight = radius(thigh[i]!) * (1 - t) + radius(hem[i]!) * t
        assert.ok(Math.abs(radius(row[i]!) - straight) < .00041, 'pencil panel traces a knee/calf bulge')
      }
    }
  }
})

test('formal footwear has its own tapered last, narrow collar and thin colour-matched sole', () => {
  for (const shoes of ['dress', 'heels'] as const) {
    const spec = wear(DEFAULT_ANIME, { shoes }), parts = buildWardrobe(source, spec)!.parts
    const upper = parts.find(p => p.paint === 'shoe')!
    assert.ok(Math.max(...Array.from(upper.positions).filter((_, i) => i % 3 === 2)) > .19, 'toe last not distinct from the sneaker')
    const collars = new Map<number, number[]>()
    for (let i = 0; i < upper.positions.length / 3; i++) if (upper.uv[i * 2 + 1]! > .9999) {
      const foot = upper.joints[i * 4]!, xs = collars.get(foot) ?? []
      xs.push(upper.positions[i * 3]!); collars.set(foot, xs)
    }
    assert.equal(collars.size, 2)
    for (const xs of collars.values()) assert.ok(Math.max(...xs) - Math.min(...xs) < .068, 'wide sneaker collar on formal footwear')
    const base = wardrobeColour('shoe', spec), sole = wardrobeColour('sole', spec)
    assert.deepEqual(sole, base.map(c => c * .28), 'white sneaker outsole used for formal footwear')
    assert.ok(parts.find(p => p.paint === 'sole')!.index.length > 100, 'underside/heel missing')
  }
})

test('VRM/GLB exports carry exact preview surfaces, weights, palette, heel stance and metadata', () => {
  const original = readGlb(source)
  for (const spec of [
    wear(DEFAULT_ANIME, { top: 'roundShort', bottom: 'shorts', shoes: 'basketball' }),
    wear({ ...DEFAULT_ANIME, sex: 'female', bust: 6, waist: 0, hip: 6, hair: 'long', skinColour: 'D19A6E', outfitColour: 'D47777' }, { top: 'vLong', bottom: 'skirtLong', shoes: 'heels' }),
  ]) {
    const wardrobe = buildWardrobe(source, spec)!, result = readGlb(exportSeed(source, spec, []))
    assert.deepEqual(result.json.extensions, original.json.extensions)
    for (const part of wardrobe.parts) {
      const node = result.json.nodes.find(n => n.name === part.name)!
      assert.equal(node.skin, wardrobe.skin)
      const primitive = result.json.meshes[node.mesh!]!.primitives[0]!
      for (const [field, expected] of [
        ['POSITION', part.positions], ['NORMAL', part.normals], ['TEXCOORD_0', part.uv],
        ['JOINTS_0', part.joints], ['WEIGHTS_0', part.weights],
      ] as const) assert.deepEqual(readAccessor(result, primitive.attributes[field]!), Array.from(expected), `${part.name}/${field}`)
      assert.deepEqual(readAccessor(result, primitive.indices!), Array.from(part.index))
    }
    for (const { node, rotation } of wardrobe.rotations) assert.deepEqual(result.json.nodes[node]!.rotation, rotation)
    const stance = result.json.nodes.find(n => n.name === 'wardrobe_stance')
    assert.equal(Boolean(stance), Boolean(wardrobe.lift))
    if (stance) assert.deepEqual(stance.translation, [0, wardrobe.lift, 0])
    const oldWear = result.json.nodes.find(node => node.name === 'wear')!
    assert.ok(result.json.meshes[oldWear.mesh!]!.primitives.every(p => !/^(body_bake|body_nm|huku_bake|wear_metal|anim_logo)$/.test(result.json.materials[p.material]!.name)))
  }
})
