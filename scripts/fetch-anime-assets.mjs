/** Fetch a pinned, redistributable VRM with its original license metadata intact. */
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const revision = '821c11b250d8c70d5804ee13431e42bee56ea9c0'
const source = `https://raw.githubusercontent.com/vrm-c/vrm-specification/${revision}/samples/Seed-san/vrm/Seed-san.vrm`
const response = await fetch(source)
if (!response.ok) throw new Error(`Asset download: ${response.status}`)
const bytes = Buffer.from(await response.arrayBuffer())
if (bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error('Expected a binary glTF')
const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)))
const meta = json.extensions?.VRMC_vrm?.meta
if (meta?.avatarPermission !== 'everyone' || meta?.commercialUsage !== 'corporation' ||
    meta?.modification !== 'allowModificationRedistribution' || !meta?.allowRedistribution) {
  throw new Error('Asset does not have the expected permissions; review before importing')
}
const dir = new URL('../public/avatars/seed-v1/', import.meta.url)
await mkdir(dir, { recursive: true })
await writeFile(new URL('seed-san.vrm', dir), bytes)
await writeFile(new URL('source.json', dir), JSON.stringify({
  source, revision, sha256: createHash('sha256').update(bytes).digest('hex'),
  bytes: bytes.length, metadata: meta, modifications: 'None. Runtime palette, hairstyle visibility and pose edits only.',
}, null, 2) + '\n')
console.log(`Seed-san: ${bytes.length} bytes, permissions verified`)
