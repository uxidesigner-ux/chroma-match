import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile, readdir, access } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
const www = join(root, 'ios/.generated/www')
const manifest = JSON.parse(await readFile(join(www, 'royal-precache.json'), 'utf8'))
assert.equal(manifest.files.length > 0, true)
for (const file of manifest.files) await access(join(www, file))
const html = await readFile(join(www, 'index.html'), 'utf8')
assert(!html.includes('/src/'), 'Native game must contain a compiled production entry')
assert(!html.includes('/chroma-match/'), 'Native game assets must use the bundled root')
const project = await readFile(join(root, 'ios/ChromaRoyale.xcodeproj/project.pbxproj'), 'utf8')
assert(project.includes('PBXResourcesBuildPhase') && project.includes('.generated/www'))
assert(project.includes('ChromaRoyale/HapticBridge.swift') && project.includes('ChromaRoyale/BundledGame.swift'))
if (process.platform === 'darwin') {
  run('/usr/bin/plutil', ['-lint', 'ios/ChromaRoyale/Info.plist', 'ios/ChromaRoyale.xcodeproj/project.pbxproj'])
  const sources = (await readdir(join(root, 'ios/ChromaRoyale'))).filter(name => name.endsWith('.swift')).map(name => `ios/ChromaRoyale/${name}`)
  run('/usr/bin/swiftc', ['-frontend', '-parse', ...sources])
  const xcode = spawnSync('/usr/bin/xcrun', ['--find', 'xcodebuild'], { encoding: 'utf8' })
  if (xcode.status === 0) {
    run(xcode.stdout.trim(), ['-project', 'ios/ChromaRoyale.xcodeproj', '-scheme', 'ChromaRoyale', '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', 'ios/.generated/DerivedData', 'CODE_SIGNING_ALLOWED=NO', 'build'])
  } else {
    console.log('Static checks passed. Xcode/iOS SDK is unavailable: native compilation, simulator launch and physical haptics remain unverified.')
  }
} else console.log('Asset checks passed. Swift/Xcode checks require macOS with Xcode.')
