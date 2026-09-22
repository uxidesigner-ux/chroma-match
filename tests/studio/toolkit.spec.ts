import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { readGlb } from '../../src/avatar/studio-export.ts'
import { enterLobby } from './boot.ts'

/** The file tools live behind one button in a sheet; open it if it is not up. */
async function openFiles(page: Page): Promise<void> {
  const sheet = page.locator('#sheet-studio-files')
  if (await sheet.isHidden()) {
    await page.getByRole('button', { name: 'Files & exports', exact: true }).click()
  }
  await expect(sheet).toBeVisible()
}

/** Close it again: it covers the editor while it is up, as a sheet should. */
async function closeFiles(page: Page): Promise<void> {
  const sheet = page.locator('#sheet-studio-files')
  if (await sheet.isVisible()) await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
}

test.beforeEach(async ({ page }) => {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.addInitScript(() => localStorage.setItem('chroma-match:lang', 'en'))
  await page.goto('/')
  await enterLobby(page)
  await page.locator('#lobby-edit').click()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('new expressions, undo/redo, saved looks and JSON restore preserve the explicit draft', async ({ page }) => {
  const initial = await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await page.getByRole('tab', { name: 'Expression', exact: true }).click()
  const canvases: string[] = []
  for (const label of ['Determined', 'Sad', 'Surprised']) {
    await page.getByRole('button', { name: label, exact: true }).click()
    canvases.push(await page.locator('.studio-stage canvas').evaluate(e => (e as HTMLCanvasElement).toDataURL()))
  }
  expect(new Set(canvases).size).toBe(3)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sad', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Surprised', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('tab', { name: 'Saved', exact: true }).click()
  await page.getByLabel('Look name', { exact: true }).fill('My surprised look')
  await page.getByRole('button', { name: 'Save this look', exact: true }).click()
  await expect(page.locator('.studio-saved-list li')).toHaveCount(1)
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(initial)
  await openFiles(page)
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Character file (.json)', exact: true }).click()
  const file = await downloaded
  const backup = await readFile((await file.path())!, 'utf8')
  expect(JSON.parse(backup).code).toMatch(/^5STUN/)
  await closeFiles(page)
  await page.getByRole('button', { name: 'Reset look', exact: true }).click()
  // `setInputFiles` reaches an attached input without needing it on screen, so
  // the restore half does not have to reopen the sheet.
  await page.getByLabel('Restore character file', { exact: true }).setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') })
  await expect(page.locator('.studio-status')).toContainText('not a supported')
  await page.getByLabel('Restore character file', { exact: true }).setInputFiles({ name: 'look.json', mimeType: 'application/json', buffer: Buffer.from(backup) })
  await expect(page.locator('.studio-status')).toContainText('loaded as a draft')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('.studio-status')).toHaveText('Saved on this device.')
  await page.reload()
  await enterLobby(page)
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'ready')
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(JSON.parse(backup).code)
  await page.locator('#lobby-edit').click()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
  await page.getByRole('tab', { name: 'Saved', exact: true }).click()
  await expect(page.getByText('My surprised look', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Delete: My surprised look', exact: true }).click()
  await expect(page.locator('.studio-saved-list li')).toHaveCount(1)
  await page.getByRole('button', { name: 'Confirm delete: My surprised look', exact: true }).click()
  await expect(page.locator('.studio-saved-list li')).toHaveCount(0)
})

test('PNG downloads have real pixels, transparent backgrounds and camera restoration', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openFiles(page)
  await page.getByLabel('Transparent image background', { exact: true }).check()
  const before = await page.locator('.studio-stage canvas').evaluate(e => (e as HTMLCanvasElement).toDataURL())
  for (const [label, width, height] of [['Face PNG', 512, 548], ['Full-body PNG', 512, 804], ['4-view sheet PNG', 1024, 1572]] as const) {
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button', { name: label, exact: true }).click()
    const file = await downloaded
    const bytes = await readFile((await file.path())!)
    expect(bytes.readUInt32BE(16)).toBe(width)
    expect(bytes.readUInt32BE(20)).toBe(height)
    const alpha = await page.evaluate(async base64 => {
      const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode()
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0)
      return [ctx.getImageData(0, 0, 1, 1).data[3], ctx.getImageData(0, image.height - 1, 1, 1).data[3]]
    }, bytes.toString('base64'))
    expect(alpha).toEqual([0, 255])
    expect(bytes.length).toBeGreaterThan(20000)
  }
  const restore = await page.locator('.studio-stage canvas').evaluate(async (element, before) => {
    const canvas = element as HTMLCanvasElement
    const image = new Image(); image.src = before; await image.decode()
    return { before: [image.width, image.height], after: [canvas.width, canvas.height], same: canvas.toDataURL() === before }
  }, before)
  expect(restore).toEqual({ before: restore.before, after: restore.before, same: true })
  expect(errors).toEqual([])
})

test('VRM and GLB exports load again, retain permissions and match selected palette/visibility', async ({ page }) => {
  await page.getByRole('button', { name: 'Ember', exact: true }).click()
  await page.getByRole('tab', { name: 'Hair', exact: true }).click()
  await page.getByRole('button', { name: 'Short bob', exact: true }).click()
  await openFiles(page)
  for (const label of ['Avatar (.vrm)', '3D model (.glb)']) {
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button', { name: label, exact: true }).click()
    const file = await downloaded
    const bytes = await readFile((await file.path())!)
    const json = readGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)).json
    expect(json.extensions.VRMC_vrm.meta.authors).toEqual(['VirtualCast, Inc.'])
    expect(json.extensions.VRMC_vrm.meta.creditNotation).toBe('required')
    expect(json.nodes.find(n => n.name === 'hair_tail')?.mesh).toBeUndefined()
    expect(json.nodes.find(n => n.name === 'robo_arm')?.mesh).toBeUndefined()
    expect(json.images.length).toBe(18)
    await page.route('**/test-export.vrm', route => route.fulfill({ contentType: 'model/gltf-binary', body: bytes }))
    const result = await page.evaluate(async () => {
      const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js')
      const { VRMLoaderPlugin, VRMUtils } = await import('/node_modules/.vite/deps/@pixiv_three-vrm.js')
      const loader = new GLTFLoader(); loader.register(parser => new VRMLoaderPlugin(parser))
      const gltf = await loader.loadAsync('/test-export.vrm')
      const vrm = gltf.userData.vrm
      const materials: string[] = []
      const colours: string[] = []
      vrm.scene.traverse(node => {
        if (!node.isMesh) return
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          materials.push(material.name)
          if (material.name === 'hair') colours.push(material.color.getHexString())
        }
      })
      const result = { head: !!vrm.humanoid.getNormalizedBoneNode('head'), expressions: Object.keys(vrm.expressionManager.expressionMap), materials, colours }
      VRMUtils.deepDispose(vrm.scene)
      return result
    })
    expect(result.head).toBe(true)
    expect(result.expressions).toContain('surprised')
    expect(result.materials).not.toContain('backpack_plastic')
    expect(result.colours.every(c => c === 'ed9560')).toBe(true)
    expect(result.colours.length).toBeGreaterThan(0)
    await page.unroute('**/test-export.vrm')
  }
})

test('a held cheer pose fits inside full-body PNG without clipping raised hands', async ({ page }) => {
  await page.getByRole('button', { name: 'Cheer', exact: true }).click()
  await openFiles(page)
  await page.getByLabel('Transparent image background', { exact: true }).check()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Full-body PNG', exact: true }).click()
  const file = await downloaded
  const bytes = await readFile((await file.path())!)
  const edgePixels = await page.evaluate(async base64 => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode()
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0)
    const { data } = ctx.getImageData(0, 0, image.width, 768)
    let opaqueEdges = 0, opaqueBody = 0
    for (let y = 0; y < 768; y++) for (let x = 0; x < image.width; x++) {
      if (data[(y * image.width + x) * 4 + 3]! < 10) continue
      opaqueBody++
      if (y < 8 || y >= 760 || x < 8 || x >= image.width - 8) opaqueEdges++
    }
    return { opaqueEdges, opaqueBody }
  }, bytes.toString('base64'))
  expect(edgePixels.opaqueEdges).toBe(0)
  expect(edgePixels.opaqueBody).toBeGreaterThan(20000)
})

test('mobile library and downloads remain keyboard accessible and storage errors preserve drafts', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.getByRole('tab', { name: 'Looks', exact: true }).focus()
  await page.keyboard.press('End')
  await expect(page.getByRole('tab', { name: 'Saved', exact: true })).toBeFocused()
  await page.getByLabel('Look name', { exact: true }).fill('<look name with long text>')
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Quota', 'QuotaExceededError') }
  })
  await page.getByRole('button', { name: 'Save this look', exact: true }).click()
  await expect(page.locator('.studio-status')).toContainText('could not save')
  await expect(page.locator('.studio-saved-list li')).toHaveCount(0)
  await openFiles(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
})
