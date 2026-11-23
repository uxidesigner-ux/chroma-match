import { defineConfig, type Plugin } from 'vite'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** Changes SW bytes whenever bundled code or shipped royal artwork changes. */
function royalOffline(): Plugin {
  let output = '', publicRoot = '', projectRoot = '', revision = ''
  return {
    name: 'chroma-royal-offline', apply: 'build',
    configResolved(config) { projectRoot = config.root; output = resolve(config.root, config.build.outDir); publicRoot = resolve(config.root, config.publicDir) },
    generateBundle(_options, bundle) {
      const staticFiles = ['index.html', 'manifest.webmanifest', 'royal/app-icon-v3-192.png', 'royal/app-icon-v3.png']
      const spritePack = JSON.parse(readFileSync(join(publicRoot, 'royal/sprites-v5.json'), 'utf8')) as { sources: { file: string }[] }
      // Atlas originals remain in source control for editing. The prepared pack
      // supplies their runtime pixels without downloading both representations.
      const sourceAtlases = new Set(spritePack.sources.map(source => `royal/${source.file}`))
      function collect(dir: string, prefix: string): void {
        for (const item of readdirSync(dir, { withFileTypes: true })) {
          if (item.isDirectory()) collect(join(dir, item.name), `${prefix}${item.name}/`)
          else if (!sourceAtlases.has(`${prefix}${item.name}`) && (/\.(?:webp|svg)$/.test(item.name) || `${prefix}${item.name}` === 'royal/sprites-v5.json')) staticFiles.push(`${prefix}${item.name}`)
        }
      }
      collect(join(publicRoot, 'royal'), 'royal/')
      const files = [...new Set([...staticFiles, ...Object.keys(bundle).filter(file => /\.(?:js|css)$/.test(file))])].sort()
      const hash = createHash('sha256')
      hash.update(readFileSync(join(projectRoot, 'index.html')))
      for (const file of files) {
        hash.update(file)
        const entry = bundle[file]
        if (entry) hash.update(entry.type === 'chunk' ? entry.code : entry.source)
        else if (file !== 'index.html') hash.update(readFileSync(join(publicRoot, file)))
      }
      // Also fingerprint the worker implementation itself.
      hash.update(readFileSync(join(publicRoot, 'sw.js')))
      revision = hash.digest('hex').slice(0, 16)
      this.emitFile({ type: 'asset', fileName: 'royal-precache.json', source: JSON.stringify({ version: revision, files }) })
    },
    writeBundle() {
      const worker = readFileSync(join(publicRoot, 'sw.js'), 'utf8').replaceAll('__ROYAL_BUILD_ID__', revision)
      writeFileSync(join(output, 'sw.js'), worker)
    },
  }
}

// Both project Pages (/chroma-match/) and a dedicated domain (/) are supported.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [royalOffline()],
  build: { target: 'es2022' },
})
