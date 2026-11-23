import { spawnSync } from 'node:child_process'
import { readFile, writeFile, mkdir, cp, rm, stat } from 'node:fs/promises'
import { resolve, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const generated = join(root, 'ios/.generated'), staging = join(generated, 'staging'), output = join(generated, 'www')
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
run(process.execPath, ['scripts/build-royal-sprites.mjs', '--verify-sources'])
run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'])
run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', 'ios/.generated/staging', '--emptyOutDir'], {
  env: { ...process.env, BASE_PATH: '/' },
})
const manifest = JSON.parse(await readFile(join(staging, 'royal-precache.json'), 'utf8'))
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
let bytes = 0
for (const file of manifest.files) {
  if (typeof file !== 'string' || file.startsWith('/') || file.includes('..') || file.includes('\\')) throw Error('Invalid native asset path')
  const destination = join(output, file)
  await mkdir(dirname(destination), { recursive: true })
  await cp(join(staging, file), destination)
  bytes += (await stat(destination)).size
}
await writeFile(join(output, 'royal-precache.json'), JSON.stringify(manifest))
// Derive the iPhone icon size from the existing game icon, without changing its artwork.
if (process.platform === 'darwin') run('/usr/bin/sips', ['-z', '180', '180', 'public/royal/app-icon-v3.png', '--out', 'ios/.generated/AppIcon.png'])
else await cp(join(root, 'public/royal/app-icon-v3.png'), join(generated, 'AppIcon.png'))
await writeFile(join(generated, 'native-build.json'), JSON.stringify({ version: manifest.version, files: manifest.files.length, bytes }, null, 2) + '\n')
await rm(staging, { recursive: true, force: true })
console.log(`Prepared ${manifest.files.length} offline files (${(bytes / 1048576).toFixed(2)} MiB) in ${relative(root, output)}. Native compilation/signing still requires Xcode.`)
