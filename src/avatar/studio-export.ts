import type { AnimeSpec } from './anime-spec.ts'
import { encodeSpec } from './spec.ts'
import { SEED_CREDIT } from './studio-library.ts'

interface TextureInfo { index: number; [key: string]: unknown }
interface MaterialData {
  name: string
  pbrMetallicRoughness: { baseColorFactor?: number[]; baseColorTexture?: TextureInfo }
  extensions?: { VRMC_materials_mtoon?: { shadeColorFactor?: number[]; shadeMultiplyTexture?: TextureInfo } }
}
export interface SeedDocument {
  asset: { copyright?: string; generator?: string; extras?: Record<string, unknown> }
  buffers: { byteLength: number }[]
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number }[]
  images: { bufferView: number; mimeType: string }[]
  textures: { source: number; sampler?: number }[]
  materials: MaterialData[]
  meshes: { primitives: { material: number }[] }[]
  nodes: { name?: string; mesh?: number; skin?: number }[]
  extensions: { VRMC_vrm: { meta: Record<string, unknown> } }
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
  for (const node of json.nodes) {
    if (node.mesh === undefined) continue
    if ((spec.hair === 'bob' && node.name?.startsWith('hair_tail')) ||
      (spec.equipment === 'none' && node.name?.startsWith('robo_arm'))) {
      delete node.mesh
      delete node.skin
    }
  }
  if (spec.equipment === 'none') {
    // The original wear node contains separate body and equipment primitives.
    for (const node of json.nodes) {
      if (node.mesh === undefined) continue
      const mesh = json.meshes[node.mesh]!
      mesh.primitives = mesh.primitives.filter(p =>
        !/^(backpack_|armgear_|robo_face|glass|anim_logo|green_emit)/.test(json.materials[p.material]!.name))
    }
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
