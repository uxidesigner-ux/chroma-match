import type { AnimeSpec } from './anime-spec.ts'
import { encodeSpec } from './spec.ts'
import { SEED_CREDIT } from './studio-library.ts'
import {
  CHEST_HIGH,
  CHEST_LOW,
  HAIR_SHAPE,
  RIGID,
  SCULPTED,
  applyFigure,
  bustAmount,
  sculptChest,
} from './body-shape.ts'
import type { ShapeNode, ShapedBone } from './body-shape.ts'

type Vec3 = [number, number, number]
interface TextureInfo { index: number; [key: string]: unknown }
interface Accessor {
  bufferView: number
  byteOffset?: number
  componentType: number
  type: string
  count: number
  min?: number[]
  max?: number[]
}
interface GlbNode {
  name?: string
  mesh?: number
  skin?: number
  children?: number[]
  scale?: Vec3
  translation?: Vec3
}
interface MaterialData {
  name: string
  pbrMetallicRoughness: { baseColorFactor?: number[]; baseColorTexture?: TextureInfo }
  extensions?: { VRMC_materials_mtoon?: { shadeColorFactor?: number[]; shadeMultiplyTexture?: TextureInfo } }
}
export interface SeedDocument {
  asset: { copyright?: string; generator?: string; extras?: Record<string, unknown> }
  buffers: { byteLength: number }[]
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[]
  images: { bufferView: number; mimeType: string }[]
  textures: { source: number; sampler?: number }[]
  materials: MaterialData[]
  accessors: Accessor[]
  meshes: { primitives: { material: number; attributes: Record<string, number> }[] }[]
  nodes: GlbNode[]
  extensions: {
    VRMC_vrm: {
      meta: Record<string, unknown>
      humanoid: { humanBones: Partial<Record<ShapedBone, { node: number }>> }
    }
  }
}
export interface ExportMaterial { name: string; colour: number[]; shade: number[]; png: Uint8Array }

export function readGlb(buffer: ArrayBuffer): { json: SeedDocument; binary: Uint8Array } {
  const view = new DataView(buffer)
  if (buffer.byteLength < 28 || view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength ||
    view.getUint32(16, true) !== 0x4e4f534a) throw new Error('Invalid GLB')
  const length = view.getUint32(12, true)
  const binaryStart = 20 + length
  if (binaryStart + 8 > buffer.byteLength || view.getUint32(binaryStart + 4, true) !== 0x004e4942 ||
    binaryStart + 8 + view.getUint32(binaryStart, true) !== buffer.byteLength) throw new Error('Invalid BIN')
  return { json: JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length))) as SeedDocument,
    binary: new Uint8Array(buffer, binaryStart + 8) }
}

const padded = (size: number): number => Math.ceil(size / 4) * 4

/**
 * The glTF half of the shared shape rule.
 *
 * The studio's model is three.js nodes; this is the same skeleton as numbers in
 * a JSON document, and `applyFigure` cannot tell the two apart. That is the
 * point: a downloaded avatar that does not match the one on screen is worse
 * than one that cannot be downloaded at all, so the rule exists once.
 */
function glbSkeleton(json: SeedDocument) {
  const bones = json.extensions.VRMC_vrm.humanoid.humanBones
  const wrap = (index: number | undefined): ShapeNode | null => {
    if (index === undefined) return null
    const node = json.nodes[index]
    if (!node) return null
    const rest = (node.translation ?? [0, 0, 0]) as Vec3
    return {
      key: index,
      rest,
      setScale: (x, y, z) => {
        node.scale = [x, y, z]
      },
      setTranslation: (x, y, z) => {
        node.translation = [x, y, z]
      },
      children: () => (node.children ?? []).map((child) => wrap(child)!),
    }
  }
  return { bone: (name: ShapedBone) => wrap(bones[name]?.node) }
}

/** Reads a tightly-read VEC3 accessor, whatever stride the source packed it at. */
function readVec3(json: SeedDocument, binary: Uint8Array, index: number): Float32Array {
  const accessor = json.accessors[index]
  if (!accessor || accessor.type !== 'VEC3' || accessor.componentType !== 5126)
    throw new Error('Unsupported vertex data')
  const view = json.bufferViews[accessor.bufferView]
  if (!view) throw new Error('Unsupported vertex data')
  const data = new DataView(binary.buffer, binary.byteOffset)
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

/** Template-preserving export for the pinned Seed model, NOT a general VRM optimizer.
 * Keep humanoid, spring bones, expressions, original author and permission metadata.
 * New textures are appended so shared original textures/material indices remain valid.
 */
export function exportSeed(source: ArrayBuffer, spec: AnimeSpec, materials: ExportMaterial[]): ArrayBuffer {
  const { json, binary } = readGlb(source)
  const meta = json.extensions.VRMC_vrm.meta
  if (meta.name !== 'Seed-san' || meta.allowRedistribution !== true ||
    meta.modification !== 'allowModificationRedistribution') throw new Error('Unsupported export source')
  const chunks = [binary]
  let byteLength = padded(binary.byteLength)
  for (const palette of materials) {
    const mat = json.materials.find(item => item.name === palette.name)
    if (!mat?.pbrMetallicRoughness.baseColorTexture) throw new Error('Missing palette material')
    const original = mat.pbrMetallicRoughness.baseColorTexture
    const bufferView = json.bufferViews.length
    json.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: palette.png.length })
    const image = json.images.length
    json.images.push({ bufferView, mimeType: 'image/png' })
    const texture = json.textures.length
    json.textures.push({ ...json.textures[original.index]!, source: image })
    mat.pbrMetallicRoughness.baseColorTexture = { ...original, index: texture }
    mat.pbrMetallicRoughness.baseColorFactor = [...palette.colour, 1]
    const toon = mat.extensions?.VRMC_materials_mtoon
    if (toon) {
      toon.shadeColorFactor = [...palette.shade]
      if (toon.shadeMultiplyTexture) toon.shadeMultiplyTexture = { ...toon.shadeMultiplyTexture, index: texture }
    }
    chunks.push(palette.png)
    byteLength += padded(palette.png.length)
  }
  /*
   * The figure, the ponytail's length and the bust, written into the document
   * itself rather than left to the viewer. Everything here is derived from the
   * appearance code through the same rule the studio draws with, so a file
   * opened anywhere else is the character its owner made.
   */
  applyFigure(spec, glbSkeleton(json))
  const tail = json.nodes.findIndex((node) => node.name === 'hair_tail_1')
  const hair = HAIR_SHAPE[spec.hair] ?? HAIR_SHAPE.tails
  if (tail >= 0) json.nodes[tail]!.scale = [hair.tail, hair.tail, hair.tail]

  // Skin is a tint over the shipped texture, so only the factors move; the
  // material keeps the warm falloff its author gave it, multiplied through.
  const skinHex = /^[0-9a-f]{6}$/i.test(spec.skinColour) ? spec.skinColour : 'FFFFFF'
  // glTF factors are linear and the studio's are too, so the swatch's sRGB has
  // to make the same trip here that three.js makes when it reads the hex.
  const linear = [0, 2, 4].map((at) => {
    const channel = parseInt(skinHex.slice(at, at + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  for (const mat of json.materials) {
    if (mat.name !== 'body_bake') continue
    const base = mat.pbrMetallicRoughness.baseColorFactor ?? [1, 1, 1, 1]
    mat.pbrMetallicRoughness.baseColorFactor = [linear[0]!, linear[1]!, linear[2]!, base[3] ?? 1]
    const toon = mat.extensions?.VRMC_materials_mtoon
    if (toon?.shadeColorFactor)
      toon.shadeColorFactor = toon.shadeColorFactor.map((channel, at) => channel * linear[at]!)
  }

  const amount = bustAmount(spec)
  if (amount > 0) {
    for (const mesh of json.meshes)
      for (const primitive of mesh.primitives) {
        const name = json.materials[primitive.material]!.name
        if (!SCULPTED.has(name)) continue
        const positionAt = primitive.attributes.POSITION
        const normalAt = primitive.attributes.NORMAL
        if (positionAt === undefined || normalAt === undefined) continue
        const position = readVec3(json, binary, positionAt)
        const normal = readVec3(json, binary, normalAt)
        /*
         * Only the meshes that actually carry geometry across the chest. The
         * head's skin shares a material name with the body's but sits entirely
         * above the neck, and rewriting base vertices under its forty-three
         * expression morphs would quietly corrupt them.
         */
        let inside = false
        for (let i = 0; i < position.length && !inside; i += 3)
          inside = position[i + 1]! > CHEST_LOW && position[i + 1]! < CHEST_HIGH && position[i + 2]! > 0
        if (!inside) continue
        const moved = { position: new Float32Array(position), normal: new Float32Array(normal) }
        sculptChest(amount, RIGID.has(name), { position, normal }, {
          setPosition: (i, x, y, z) => {
            moved.position[i * 3] = x
            moved.position[i * 3 + 1] = y
            moved.position[i * 3 + 2] = z
          },
          setNormal: (i, x, y, z) => {
            moved.normal[i * 3] = x
            moved.normal[i * 3 + 1] = y
            moved.normal[i * 3 + 2] = z
          },
        })
        // Appended rather than written over: the originals stay valid for
        // anything else in the document still pointing at them.
        for (const [key, values] of [['POSITION', moved.position], ['NORMAL', moved.normal]] as const) {
          const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength)
          const bufferView = json.bufferViews.length
          json.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length })
          const accessor = json.accessors.length
          const bounds: Partial<Accessor> = {}
          if (key === 'POSITION') {
            // glTF requires these on positions, and the sculpt moves them.
            const min = [Infinity, Infinity, Infinity]
            const max = [-Infinity, -Infinity, -Infinity]
            for (let i = 0; i < values.length; i += 3)
              for (let axis = 0; axis < 3; axis++) {
                min[axis] = Math.min(min[axis]!, values[i + axis]!)
                max[axis] = Math.max(max[axis]!, values[i + axis]!)
              }
            bounds.min = min
            bounds.max = max
          }
          json.accessors.push({
            bufferView,
            componentType: 5126,
            type: 'VEC3',
            count: values.length / 3,
            ...bounds,
          })
          primitive.attributes[key] = accessor
          chunks.push(bytes)
          byteLength += padded(bytes.length)
        }
      }
  }

  for (const node of json.nodes) {
    if (node.mesh === undefined) continue
    if ((!hair.ponytail && node.name?.startsWith('hair_tail')) ||
      (!spec.arms && node.name?.startsWith('robo_arm'))) {
      delete node.mesh
      delete node.skin
      continue
    }
    const mesh = json.meshes[node.mesh]!
    mesh.primitives = mesh.primitives.filter(p => {
      const name = json.materials[p.material]!.name
      if (!spec.pack && name.startsWith('backpack_')) return false
      if (!spec.arms && name.startsWith('armgear_')) return false
      if (!spec.visor && /^(robo_face|glass|anim_logo)$/.test(name)) return false
      return true
    })
  }
  json.asset.copyright = SEED_CREDIT
  json.asset.generator = 'Chroma Match · Seed appearance export'
  json.asset.extras = { ...json.asset.extras, chromaCharacter: { version: 1, code: encodeSpec(spec) } }
  json.buffers[0]!.byteLength = byteLength
  const encoded = new TextEncoder().encode(JSON.stringify(json))
  const jsonSize = padded(encoded.length)
  const result = new ArrayBuffer(28 + jsonSize + byteLength)
  const view = new DataView(result)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, result.byteLength, true)
  view.setUint32(12, jsonSize, true)
  view.setUint32(16, 0x4e4f534a, true)
  new Uint8Array(result, 20, jsonSize).fill(32)
  new Uint8Array(result, 20, encoded.length).set(encoded)
  view.setUint32(20 + jsonSize, byteLength, true)
  view.setUint32(24 + jsonSize, 0x004e4942, true)
  let offset = 28 + jsonSize
  for (const chunk of chunks) {
    new Uint8Array(result, offset, chunk.length).set(chunk)
    offset += padded(chunk.length)
  }
  return result
}
