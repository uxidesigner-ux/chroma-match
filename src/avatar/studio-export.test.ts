import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { DEFAULT_ANIME, gearFromBits } from './anime-spec.ts'
import { bustAmount } from './body-shape.ts'
import { exportSeed, readGlb } from './studio-export.ts'
import { hairGeometry } from './hair-strands.ts'

const bytes = readFileSync(new URL('../../public/avatars/seed-v1/seed-san.vrm', import.meta.url))
const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
const original = readGlb(source)

test('export preserves permissions, rig and expression extension while applying visibility', () => {
  for (const hair of ['tails', 'bob'] as const) for (const equipped of [false, true] as const) {
    const result = readGlb(exportSeed(source, { ...DEFAULT_ANIME, hair, ...gearFromBits(equipped ? 7 : 0) }, []))
    assert.deepEqual(result.json.extensions, original.json.extensions)
    assert.equal(result.json.nodes.find(n => n.name === 'hair_tail')?.mesh !== undefined, hair === 'tails')
    assert.equal(result.json.nodes.find(n => n.name === 'robo_arm')?.mesh !== undefined, equipped)
    const wear = result.json.nodes.find(n => n.name === 'wear')!
    const materials = result.json.meshes[wear.mesh!]!.primitives.map(p => result.json.materials[p.material]!.name)
    assert.equal(materials.includes('backpack_plastic'), equipped)
    assert.ok(materials.includes('body_bake'))
    assert.ok(result.json.asset.copyright?.includes('VirtualCast'))
  }
  assert.deepEqual(readGlb(source).json, original.json, 'Source must not be mutated')
})

test('palette export appends aligned textures without recolouring shared original materials', () => {
  const originalMap = original.json.materials.find(m => m.name === 'huku_bake')!.pbrMetallicRoughness.baseColorTexture!.index
  const result = readGlb(exportSeed(source, DEFAULT_ANIME, [
    { name: 'huku_bake', colour: [.1, .2, .3], shade: [.08, .16, .24], png: new Uint8Array([1, 2, 3, 4, 5]) },
  ]))
  const material = result.json.materials.find(m => m.name === 'huku_bake')!
  assert.deepEqual(material.pbrMetallicRoughness.baseColorFactor, [.1, .2, .3, 1])
  assert.equal(material.pbrMetallicRoughness.baseColorTexture!.index, original.json.textures.length)
  assert.deepEqual(result.json.textures[originalMap], original.json.textures[originalMap])
  const view = result.json.bufferViews[result.json.images[original.json.images.length]!.bufferView]!
  assert.equal(view.byteOffset! % 4, 0)
  assert.deepEqual([...result.binary.slice(view.byteOffset!, view.byteOffset! + view.byteLength)], [1, 2, 3, 4, 5])
  assert.equal(result.json.buffers[0]!.byteLength, result.binary.byteLength)
})

test('malformed GLB cannot be exported', () => {
  for (const size of [0, 12, 30]) assert.throws(() => readGlb(new ArrayBuffer(size)))
})

test('mixed explorer pieces strip only the hidden primitives', () => {
  const result = readGlb(exportSeed(source, { ...DEFAULT_ANIME, pack: true, arms: false, visor: true }, []))
  assert.equal(result.json.nodes.find(n => n.name === 'robo_arm')?.mesh, undefined)
  const wear = result.json.nodes.find(n => n.name === 'wear')!
  const materials = result.json.meshes[wear.mesh!]!.primitives.map(p => result.json.materials[p.material]!.name)
  assert.equal(materials.includes('backpack_plastic'), true)
  assert.equal(materials.includes('robo_face'), true)
  assert.equal(materials.includes('armgear_mat') || materials.some(name => name.startsWith('armgear_')), false)
})

/**
 * Every vertex of the largest primitive drawn with this material.
 *
 * Largest, not first: the hair mesh carries forty vertices of the outfit
 * material as well, and the body's several thousand are the ones in question.
 */
function positions(glb: ReturnType<typeof readGlb>, material: string): Float32Array {
  const index = glb.json.materials.findIndex((mat) => mat.name === material)
  const wanted = glb.json.meshes
    .flatMap((mesh) => mesh.primitives)
    .filter((primitive) => primitive.material === index)
    .sort((a, b) => glb.json.accessors[b.attributes.POSITION!]!.count - glb.json.accessors[a.attributes.POSITION!]!.count)[0]
  for (const primitive of wanted ? [wanted] : [])
    {
      const accessor = glb.json.accessors[primitive.attributes.POSITION!]!
      const view = glb.json.bufferViews[accessor.bufferView]!
      const data = new DataView(glb.binary.buffer, glb.binary.byteOffset)
      const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
      const stride = view.byteStride ?? 12
      const out = new Float32Array(accessor.count * 3)
      for (let i = 0; i < accessor.count; i++) {
        const at = base + i * stride
        out[i * 3] = data.getFloat32(at, true)
        out[i * 3 + 1] = data.getFloat32(at + 4, true)
        out[i * 3 + 2] = data.getFloat32(at + 8, true)
      }
      return out
    }
  throw new Error(`no primitive uses ${material}`)
}

const bone = (glb: ReturnType<typeof readGlb>, name: 'hips' | 'chest' | 'head' | 'leftShoulder') =>
  glb.json.nodes[glb.json.extensions.VRMC_vrm.humanoid.humanBones[name]!.node]!

test('an exported avatar carries the figure it was drawn with', () => {
  const spec = { ...DEFAULT_ANIME, hip: 6 as const, waist: 0 as const, shoulder: 6 as const, head: 6 as const }
  const out = readGlb(exportSeed(source, spec, []))
  const shipped = original

  // The hips widen, and the head grows, exactly as the studio draws them.
  assert.ok(bone(out, 'hips').scale![0]! > 1.2, 'the hips did not widen')
  assert.equal(bone(out, 'hips').scale![1], 1, 'the figure changed the height')
  assert.ok(bone(out, 'head').scale![0]! > 1.15, 'the head did not grow')
  // The shoulder moves out from the spine, and only sideways.
  const restShoulder = bone(shipped, 'leftShoulder').translation!
  const movedShoulder = bone(out, 'leftShoulder').translation!
  assert.ok(Math.abs(movedShoulder[0]) > Math.abs(restShoulder[0]) * 1.3, 'the shoulder did not move out')
  assert.equal(movedShoulder[1], restShoulder[1], 'the shoulder changed height')
})

test('both exports have the rounded seat, while only the female chest carries the bust', () => {
  const male = readGlb(exportSeed(source, { ...DEFAULT_ANIME, sex: 'male' }, []))
  const female = readGlb(exportSeed(source, { ...DEFAULT_ANIME, sex: 'female', bust: 6 }, []))
  assert.equal(bustAmount({ ...DEFAULT_ANIME, sex: 'male' }), 0)

  const shipped = positions(original, 'huku_bake')
  const baseline = positions(male, 'huku_bake')
  let seat = 0
  for (let i = 0; i < shipped.length; i += 3) {
    assert.equal(baseline[i], shipped[i], 'seat changed width')
    assert.equal(baseline[i + 1], shipped[i + 1], 'seat changed height')
    const delta = shipped[i + 2]! - baseline[i + 2]!
    if (delta <= 1e-6) { assert.ok(Math.abs(delta) < 1e-6); continue }
    assert.ok(delta <= .0321)
    assert.ok(shipped[i + 1]! > .68 && shipped[i + 1]! < .95 && shipped[i + 2]! < -.008)
    seat++
  }
  assert.ok(seat > 40, 'rounded seat missing from original outfit export')

  // The chest comes forward, and only the chest.
  const sculpted = positions(female, 'huku_bake')
  assert.equal(sculpted.length, shipped.length)
  let chest = 0
  for (let i = 0; i < shipped.length; i += 3) {
    const moved = Math.hypot(
      sculpted[i]! - baseline[i]!,
      sculpted[i + 1]! - baseline[i + 1]!,
      sculpted[i + 2]! - baseline[i + 2]!,
    )
    if (moved <= 1e-6) continue
    chest++
    /*
     * The shape's own reach: a centre at 1.155 and a base of 0.105, which
     * counts for a sixth again more below the centre than above so the
     * underside runs out into the ribcage. Nothing outside that may move.
     */
    assert.ok(
      shipped[i + 1]! > 1.155 - 0.105 * 1.6 && shipped[i + 1]! < 1.155 + 0.105,
      `a vertex at y=${shipped[i + 1]} moved, which is outside the bust`,
    )
    assert.ok(shipped[i + 2]! > 0, 'a vertex behind the spine moved')
  }
  assert.ok(chest > 50, `only ${chest} vertices moved; the bust is not in the file`)
})

test('an exported avatar carries its skin tone, and white leaves the material alone', () => {
  const shipped = original.json.materials.find((mat) => mat.name === 'body_bake')!
  const pale = readGlb(exportSeed(source, { ...DEFAULT_ANIME, skinColour: 'FFFFFF' }, []))
    .json.materials.find((mat) => mat.name === 'body_bake')!
  const deep = readGlb(exportSeed(source, { ...DEFAULT_ANIME, skinColour: '6F4530' }, []))
    .json.materials.find((mat) => mat.name === 'body_bake')!

  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(pale.pbrMetallicRoughness.baseColorFactor![i]! - 1) < 1e-6, 'white tinted the skin')
    assert.ok(deep.pbrMetallicRoughness.baseColorFactor![i]! < 0.7, 'the deep tone did not reach the file')
  }
  // The warm falloff its author gave it survives, multiplied rather than replaced.
  const rest = shipped.extensions!.VRMC_materials_mtoon!.shadeColorFactor!
  const tinted = deep.extensions!.VRMC_materials_mtoon!.shadeColorFactor!
  assert.ok(tinted[0]! / rest[0]! > tinted[2]! / rest[2]!, 'the skin shade lost its warmth')
})

test('the ponytail keeps its own length, and only that style wears it', () => {
  for (const hair of ['tails', 'bob', 'long'] as const) {
    const glb = readGlb(exportSeed(source, { ...DEFAULT_ANIME, hair }, []))
    assert.equal(glb.json.nodes.find(node => node.name === 'hair_tail')?.mesh !== undefined, hair === 'tails')
    assert.equal(glb.json.nodes.find(node => node.name === 'hair_tail_1')!.scale?.[0] ?? 1, 1)
  }
})

test('new cuts export the exact preview shell, colour shading and head attachment', () => {
  for (const hair of ['tails', 'bob', 'long'] as const) for (const pack of [false, true]) {
    const { json, binary } = readGlb(exportSeed(source, { ...DEFAULT_ANIME, hair, pack }, []))
    const shape = hairGeometry(hair, pack)
    const nodes = json.nodes.filter(node => node.name === 'hair_shape')
    assert.equal(nodes.length, shape ? 1 : 0)
    if (!shape) continue
    const nodeAt = json.nodes.findIndex(node => node.name === 'hair_shape')
    const head = json.extensions.VRMC_vrm.humanoid.humanBones.head!.node
    assert.ok(json.nodes[head]!.children!.includes(nodeAt))
    assert.equal(nodes[0]!.skin, undefined, 'rigid head child, no invalid second skin')
    const primitive = json.meshes[nodes[0]!.mesh!]!.primitives[0]!
    const mat = json.materials[primitive.material]!
    assert.equal(mat.name, 'hair_shape')
    assert.equal(mat.pbrMetallicRoughness.baseColorTexture, undefined)
    for (const [key, values] of [['POSITION', shape.positions], ['NORMAL', shape.normals],
      ['TEXCOORD_0', shape.uv]] as const) {
      const accessor = json.accessors[primitive.attributes[key]!]!
      const view = json.bufferViews[accessor.bufferView]!
      const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
      const exported = new Float32Array(binary.buffer, binary.byteOffset + start, values.length)
      assert.deepEqual(exported, values, `${key} differs from the preview`)
    }
    assert.ok(json.accessors[primitive.attributes.POSITION!]!.min)
    assert.ok(json.accessors[primitive.attributes.POSITION!]!.max)
    assert.deepEqual(json.extensions, original.json.extensions, 'original permission/rig/expression data intact')
  }
  assert.deepEqual(readGlb(source).json, original.json, 'source is never mutated')
})
