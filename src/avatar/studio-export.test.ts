import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { DEFAULT_ANIME, gearFromBits } from './anime-spec.ts'
import { bustAmount } from './body-shape.ts'
import { exportSeed, readGlb } from './studio-export.ts'
import { hairStrands } from './hair-strands.ts'

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
  const view = result.json.bufferViews.at(-1)!
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

test('a male export is the shipped mesh, and a female export carries the bust', () => {
  const male = readGlb(exportSeed(source, { ...DEFAULT_ANIME, sex: 'male' }, []))
  const female = readGlb(exportSeed(source, { ...DEFAULT_ANIME, sex: 'female', bust: 6 }, []))
  assert.equal(bustAmount({ ...DEFAULT_ANIME, sex: 'male' }), 0)

  const shipped = positions(original, 'huku_bake')
  assert.deepEqual(Array.from(positions(male, 'huku_bake')), Array.from(shipped),
    'a male export moved vertices its author did not')

  // The chest comes forward, and only the chest.
  const sculpted = positions(female, 'huku_bake')
  assert.equal(sculpted.length, shipped.length)
  let chest = 0
  for (let i = 0; i < shipped.length; i += 3) {
    const moved = Math.hypot(
      sculpted[i]! - shipped[i]!,
      sculpted[i + 1]! - shipped[i + 1]!,
      sculpted[i + 2]! - shipped[i + 2]!,
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

/*
 * A stand-in for the strand the preview bakes: a flat triangle hanging down,
 * which is enough to say where the exporter puts it and how many it stands.
 */
const STRAND = {
  positions: new Float32Array([-0.02, 0, 0, 0.02, 0, 0, 0, -0.25, 0]),
  uv: new Float32Array([0, 0, 1, 0, 0.5, 1]),
  index: new Uint32Array([0, 1, 2]),
}

test('the ponytail keeps its own length, and only the style that has one wears it', () => {
  const tail = (hair: 'tails' | 'bob' | 'long') => {
    const glb = readGlb(exportSeed(source, { ...DEFAULT_ANIME, hair }, [], STRAND))
    return {
      worn: glb.json.nodes.find((node) => node.name === 'hair_tail')?.mesh !== undefined,
      scale: glb.json.nodes.find((node) => node.name === 'hair_tail_1')!.scale?.[0] ?? 1,
    }
  }
  // Long hair used to be this ponytail stretched half again; it has a curtain
  // of its own now, and a ponytail inside a curtain is a strand nobody sees.
  assert.deepEqual(tail('tails'), { worn: true, scale: 1 })
  assert.deepEqual(tail('bob'), { worn: false, scale: 1 })
  assert.deepEqual(tail('long'), { worn: false, scale: 1 })
})

/*
 * The hair a style adds is written into the file rather than left to the
 * studio, so a character opened in any other viewer has the head of hair its
 * owner gave it. Rigid children of the head bone, two meshes between them: one
 * strand as baked and one mirrored, because a negative scale turns triangles
 * inside out and glTF leaves fixing that to whoever reads the file.
 */
test('a style that adds hair writes it into the file, under the head bone', () => {
  for (const hair of ['tails', 'bob', 'long'] as const) {
    const glb = readGlb(exportSeed(source, { ...DEFAULT_ANIME, hair }, [], STRAND))
    const { json } = glb
    const head = json.extensions.VRMC_vrm.humanoid.humanBones.head!.node
    const strands = json.nodes.filter((node) => node.name === 'hair_strand')
    assert.equal(strands.length, hairStrands(hair).length, `${hair} stands its own strands`)
    if (!strands.length) {
      assert.equal(json.meshes.filter((mesh) => mesh.name === 'hair_strand').length, 0)
      continue
    }
    // Every one of them hangs off the head, and nothing else.
    const under = json.nodes[head]!.children ?? []
    for (const [index, node] of json.nodes.entries())
      if (node.name === 'hair_strand') assert.ok(under.includes(index), 'a strand hangs off the head')
    // Two meshes, and both are used: an unmirrored fan is tapered down one side.
    const meshes = json.meshes.map((mesh, index) => [mesh.name, index] as const)
      .filter(([name]) => name === 'hair_strand')
      .map(([, index]) => index)
    assert.equal(meshes.length, 2, 'one strand and its mirror')
    assert.deepEqual(new Set(strands.map((node) => node.mesh)), new Set(meshes))
    // Rigid: a node with a mesh and no skin is a child of the bone above it.
    for (const node of strands) {
      assert.equal(node.skin, undefined, 'a strand is not skinned')
      assert.equal(node.rotation?.length, 4)
      assert.ok((node.scale?.[1] ?? 0) > 0, 'a strand has a length')
    }
    // And each mesh reads real geometry, with the hair material on it.
    const hairMaterial = json.materials.findIndex((material) => material.name === 'hair')
    for (const mesh of meshes) {
      const primitive = json.meshes[mesh]!.primitives[0]!
      assert.equal(primitive.material, hairMaterial)
      assert.ok(primitive.indices !== undefined, 'the strand is indexed')
      for (const key of ['POSITION', 'NORMAL', 'TEXCOORD_0'])
        assert.ok(primitive.attributes[key] !== undefined, `the strand carries ${key}`)
      const position = json.accessors[primitive.attributes.POSITION!]!
      assert.equal(position.count, STRAND.positions.length / 3)
      assert.ok(position.min && position.max, 'glTF wants bounds on positions')
    }
  }
  assert.deepEqual(readGlb(source).json, original.json, 'Source must not be mutated')
})

test('without a baked strand the file is the model as it was, whatever the style', () => {
  for (const hair of ['bob', 'long'] as const) {
    const json = readGlb(exportSeed(source, { ...DEFAULT_ANIME, hair }, [])).json
    assert.equal(json.nodes.filter((node) => node.name === 'hair_strand').length, 0)
  }
})
