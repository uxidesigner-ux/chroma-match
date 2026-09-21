import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { DEFAULT_ANIME, gearFromBits } from './anime-spec.ts'
import { exportSeed, readGlb } from './studio-export.ts'

const bytes = readFileSync(new URL('../../public/avatars/seed-v1/seed-san.vrm', import.meta.url))
const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
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
