import { expect, test } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { enterLobby } from './boot.ts'
import { decodeSpec } from '../../src/avatar/spec.ts'
import { readGlb } from '../../src/avatar/studio-export.ts'

test('wardrobe is a draft: independent pieces/colours, undo, save/reload and cancel', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.addInitScript(() => localStorage.setItem('chroma-match:lang', 'ko'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/'); await enterLobby(page)
  const initial = await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))
  await page.locator('#lobby-edit').click()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
  await page.getByRole('tab', { name: '의상', exact: true }).click()
  await page.getByRole('button', { name: 'V넥 · 긴팔', exact: true }).click()
  await page.getByRole('button', { name: '짧은치마', exact: true }).click()
  await page.getByRole('button', { name: '하이힐', exact: true }).click()
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(initial)
  for (const [name, colour] of [['상의 색상', '#d47777'], ['하의 색상', '#35465d'], ['신발 색상', '#263a46']] as const) {
    await page.getByLabel(name, { exact: true }).evaluate((input, colour) => { (input as HTMLInputElement).value = colour; input.dispatchEvent(new Event('input', { bubbles: true })) }, colour)
  }
  await page.getByRole('button', { name: '손인사', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('wardrobe-mobile-wave.png') })
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.locator('.studio-status')).toHaveText('이 기기에 저장했어요.')
  const saved = await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))
  expect(saved).toMatch(/^7/)
  expect(decodeSpec(saved!)).toMatchObject({ top: 'vLong', bottom: 'skirtShort', shoes: 'heels', outfitColour: 'D47777', bottomColour: '35465D', shoeColour: '263A46' })
  await page.reload(); await enterLobby(page)
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'ready')
  await expect(page.locator('#profile-avatar')).toHaveAttribute('data-avatar-state', 'ready')
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(saved)
  await page.screenshot({ path: testInfo.outputPath('wardrobe-lobby.png') })
  await page.locator('#lobby-edit').click()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
  await page.getByRole('tab', { name: '의상', exact: true }).click()
  for (const name of ['V넥 · 긴팔', '짧은치마', '하이힐']) await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '긴치마', exact: true }).click()
  await page.getByRole('button', { name: '되돌리기', exact: true }).click()
  await expect(page.getByRole('button', { name: '짧은치마', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '긴치마', exact: true }).click()
  await page.getByRole('button', { name: '뒤로', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: '변경 취소', exact: true }).click()
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(saved)
})

test('real rig keeps sleeves, hands, skirts and grounded footwear through body variants and gestures', async ({ page }, testInfo) => {
  test.setTimeout(240000)
  await page.route('**/src/main.ts', route => route.fulfill({ contentType: 'application/javascript', body: '' }))
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { StudioCharacter } = await import('/src/avatar/character-studio/character.ts')
    const { DEFAULT_ANIME, FIGURE_PRESETS, wear } = await import('/src/avatar/anime-spec.ts')
    const { buildWardrobe } = await import('/src/avatar/wardrobe.ts')
    const { Mesh, SkinnedMesh, Scene, WebGLRenderer, PerspectiveCamera, HemisphereLight, DirectionalLight, Color, Vector3, Quaternion, Box3, Ray } = await import('/node_modules/.vite/deps/three.js')
    const character = await StudioCharacter.load(new AbortController().signal)
    const canvas = document.createElement('canvas'), renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
    renderer.setSize(320, 520, false)
    const scene = new Scene(); scene.background = new Color('#202C3D')
    scene.add(character.vrm.scene, new HemisphereLight(0xffffff, 0x718095, 2))
    const light = new DirectionalLight(0xffffff, 2); light.position.set(-1, 2, 3); scene.add(light)
    const camera = new PerspectiveCamera(30, 320 / 520, .1, 100)
    const sheet = document.createElement('canvas'); sheet.width = 1280; sheet.height = 2200
    const ctx = sheet.getContext('2d')!, failures: string[] = []
    const original = character.vrm.scene.getObjectByName('wear_1') as SkinnedMesh
    const source = (character as unknown as { source: ArrayBuffer }).source
    const outfits = [
      { top: 'roundShort', bottom: 'trousers', shoes: 'basketball' },
      { top: 'roundLong', bottom: 'shorts', shoes: 'dress' },
      { top: 'vShort', bottom: 'skirtLong', shoes: 'heels' },
      { top: 'vLong', bottom: 'skirtShort', shoes: 'heels' },
      { top: 'roundShort', bottom: 'shorts', shoes: 'bare' },
    ] as const
    let cases = 0, minimumGround = Infinity, maximumContactGap = 0
    let skirtSamples = 0, minimumSkirtClearance = Infinity, maximumSkirtClearance = 0
    const indices = original.geometry.index!, skinIndex = original.geometry.attributes.skinIndex!, skinWeight = original.geometry.attributes.skinWeight!
    const bodyFaces: number[][] = []
    for (let i = 0; i < indices.count; i += 3) {
      const at = [0, 1, 2].map(j => indices.getX(i + j))
      if (at.some(v => [0, 1, 2, 3].some(j => skinWeight.getComponent(v, j) > .1 && skinIndex.getComponent(v, j) >= 30 && skinIndex.getComponent(v, j) <= 78 && skinIndex.getComponent(v, j) !== 37))) continue
      bodyFaces.push(at)
    }
    try {
      const builds = { ...FIGURE_PRESETS, min: { hip: 0, waist: 0, bust: 0, shoulder: 0, head: 0 }, max: { hip: 6, waist: 6, bust: 6, shoulder: 6, head: 6 },
        wideHip: { hip: 6, waist: 0, bust: 6, shoulder: 0, head: 6 }, narrowHip: { hip: 0, waist: 6, bust: 0, shoulder: 6, head: 0 } }
      for (const [build, figure] of Object.entries(builds)) for (const sex of ['male', 'female'] as const) for (const [column, outfit] of outfits.entries()) {
        const spec = wear({ ...DEFAULT_ANIME, ...figure, sex, hair: 'bob', outfitColour: 'D47777', shoeColour: '263A46' }, outfit)
        character.apply(spec)
        const wardrobe = buildWardrobe(source, spec)!
        for (const { node, rotation } of wardrobe.rotations) {
          const name = node === 132 ? 'leftFoot' : node === 134 ? 'leftToes' : node === 139 ? 'rightFoot' : 'rightToes'
          const raw = character.vrm.humanoid.getRawBoneNode(name)!
          // Imported rest quaternions have float32 rounding; normalize both
          // before angleTo so identical values cannot produce a false angle.
          if (raw.quaternion.clone().normalize().angleTo(new Quaternion(...rotation).normalize()) > 2e-5) failures.push(`${build}/${sex}/${outfit.shoes}/${name}: raw export stance differs`)
        }
        const meshes: SkinnedMesh[] = []
        character.vrm.scene.traverse(node => { if (node instanceof SkinnedMesh && node.name.startsWith('wardrobe_')) meshes.push(node) })
        for (const mesh of meshes) if (mesh.skeleton !== original.skeleton) failures.push(`${mesh.name}: separate skeleton`)
        const skin = meshes.find(mesh => mesh.name === 'wardrobe_skin')!
        if (!skin?.geometry.attributes.position.count) failures.push(`${build}/${sex}: no exposed skin`)
        for (const gesture of ['wave', 'cheer', 'pose'] as const) {
          character.perform(gesture); let previous = 0
          for (const phase of [0, .2, .75, 1.4, 2.8]) {
            character.tick(phase - previous, true); previous = phase
            character.vrm.scene.updateMatrixWorld(true)
            // CPU getVertexPosition reads boneMatrices; matrixWorld alone is
            // insufficient before a render. Do not measure the previous figure.
            original.skeleton.update()
            const soles = meshes.find(mesh => mesh.name === (outfit.shoes === 'bare' ? 'wardrobe_skin' : 'wardrobe_soles'))!
            let ground = Infinity, frontContact = Infinity, heelContact = Infinity
            for (let i = 0; i < soles.geometry.attributes.position.count; i++) {
              if (outfit.shoes === 'bare' && soles.geometry.attributes.position.getY(i) > .16) continue
              const p = soles.getVertexPosition(i, new Vector3()); soles.localToWorld(p)
              ground = Math.min(ground, p.y)
              if (p.z > .09) frontContact = Math.min(frontContact, p.y)
              if (p.z < .02) heelContact = Math.min(heelContact, p.y)
            }
            minimumGround = Math.min(minimumGround, ground)
            maximumContactGap = Math.max(maximumContactGap, Math.abs(frontContact), Math.abs(heelContact))
            if (ground < -.007 || Math.abs(frontContact) > .008 || Math.abs(heelContact) > .008) failures.push(`${build}/${sex}/${outfit.shoes}/${gesture}/${phase}: sole contact ${ground.toFixed(4)}/${frontContact.toFixed(4)}/${heelContact.toFixed(4)}`)
            if (outfit.bottom === 'skirtLong' || outfit.bottom === 'skirtShort') {
              const skirt = meshes.find(mesh => mesh.name === 'wardrobe_bottom')!, positions = skirt.geometry.attributes.position!
              const body = Array.from({ length: original.geometry.attributes.position!.count }, (_, i) => original.localToWorld(original.getVertexPosition(i, new Vector3())))
              const centre = character.vrm.humanoid.getRawBoneNode('hips')!.getWorldPosition(new Vector3())
              const levels = [.895, .76, outfit.bottom === 'skirtShort' ? .567 : .175]
              for (let i = 0; i < positions.count; i++) {
                if (!levels.some(y => Math.abs(positions.getY(i) - y) < 1e-6) || i % 4 !== 0) continue
                const p = skirt.localToWorld(skirt.getVertexPosition(i, new Vector3()))
                const origin = new Vector3(centre.x, p.y, centre.z)
                const ray = new Ray(origin, p.clone().sub(origin).normalize())
                let radius = 0, hitFace: number[] = []
                for (const face of bodyFaces) {
                  const [a, b, c] = face.map(at => body[at]!) as [Vector3, Vector3, Vector3]
                  if ([a, b, c].every(v => v.y < p.y) || [a, b, c].every(v => v.y > p.y)) continue
                  const hit = ray.intersectTriangle(a, b, c, false, new Vector3())
                  if (hit && hit.distanceTo(origin) > radius) { radius = hit.distanceTo(origin); hitFace = face }
                }
                // The joined front/back panel may span empty space between the
                // legs. Where skin lies on this ray, check the ACTUAL posed rig.
                if (!radius) continue
                const gap = p.distanceTo(origin) - radius
                skirtSamples++; minimumSkirtClearance = Math.min(minimumSkirtClearance, gap); maximumSkirtClearance = Math.max(maximumSkirtClearance, gap)
                if (gap < .002 || gap > .050) failures.push(`${build}/${sex}/${outfit.bottom}/${gesture}/${phase}: skirt clearance ${gap.toFixed(4)} at ${positions.getY(i).toFixed(3)}, source face ${hitFace.map(at => original.geometry.attributes.position!.getY(at).toFixed(3))}`)
              }
            }
            for (const side of ['left', 'right'] as const) {
              const elbow = character.vrm.humanoid.getNormalizedBoneNode(`${side}LowerArm`)!.quaternion
              if (Math.abs(elbow.x) > 1e-7 || Math.abs(elbow.z) > 1e-7) failures.push(`${gesture}: elbow side-flexion`)
            }
            if (phase !== .75 || sex !== 'female' || build !== 'curved' || column > 3) continue
            const row = gesture === 'wave' ? 1 : gesture === 'cheer' ? 2 : 3
            for (const [view, angle] of [0, Math.PI / 2].entries()) {
              if (view && gesture !== 'wave') continue
              const bounds = new Box3()
              character.vrm.scene.traverseVisible(node => { if (node instanceof Mesh) bounds.expandByObject(node, true) })
              const target = bounds.getCenter(new Vector3())
              camera.position.set(Math.sin(angle) * 4.3, target.y, Math.cos(angle) * 4.3); camera.lookAt(target)
              renderer.render(scene, camera)
              const imageRow = view ? 0 : row
              ctx.drawImage(canvas, column * 320, imageRow * 550)
              ctx.fillStyle = '#ffffff'; ctx.font = '14px sans-serif'
              ctx.fillText(`${outfit.top} / ${outfit.bottom} / ${outfit.shoes} · ${view ? 'side' : gesture}`, column * 320 + 8, imageRow * 550 + 540)
            }
          }
          cases++
        }
      }
      character.apply(DEFAULT_ANIME)
      if (character.vrm.scene.position.y !== 0) failures.push('heel lift survived returning to original outfit')
      for (const side of ['left', 'right'] as const) if (character.vrm.humanoid.getNormalizedBoneNode(`${side}Foot`)!.rotation.x !== 0) failures.push('heel angle survived returning to original outfit')
      return { failures, cases, minimumGround, maximumContactGap, skirtSamples, minimumSkirtClearance, maximumSkirtClearance, png: sheet.toDataURL('image/png').split(',')[1]! }
    } finally { character.dispose(); renderer.dispose() }
  })
  await writeFile(testInfo.outputPath('wardrobe-fit-gestures.png'), Buffer.from(result.png, 'base64'))
  await writeFile(testInfo.outputPath('wardrobe-fit-results.json'), JSON.stringify({ ...result, png: undefined }, null, 2))
  expect(result.failures).toEqual([])
  expect(result.cases).toBe(240)
  expect(result.skirtSamples).toBeGreaterThan(15000)
  expect(result.minimumSkirtClearance).toBeGreaterThan(.002)
})

test('tailored hips and formal shoe lasts render clearly from front, side and back', async ({ page }, testInfo) => {
  await page.route('**/src/main.ts', route => route.fulfill({ contentType: 'application/javascript', body: '' }))
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { StudioCharacter } = await import('/src/avatar/character-studio/character.ts')
    const { DEFAULT_ANIME, wear } = await import('/src/avatar/anime-spec.ts')
    const { Scene, WebGLRenderer, OrthographicCamera, HemisphereLight, DirectionalLight, Color, Vector3 } = await import('/node_modules/.vite/deps/three.js')
    const character = await StudioCharacter.load(new AbortController().signal)
    const scene = new Scene(); scene.background = new Color('#263245')
    scene.add(character.vrm.scene, new HemisphereLight(0xffffff, 0x718095, 2))
    const light = new DirectionalLight(0xffffff, 2); light.position.set(-1, 2, 3); scene.add(light)
    const canvas = document.createElement('canvas'), renderer = new WebGLRenderer({ canvas, antialias: true })
    renderer.setSize(440, 380, false)
    const sheet = document.createElement('canvas'); sheet.width = 1320; sheet.height = 1520
    const ctx = sheet.getContext('2d')!
    try {
      for (const [row, item] of ['dress', 'heels', 'skirtLong', 'skirtShort'].entries()) {
        const shoes = item === 'dress' ? 'dress' : 'heels', bottom = item === 'skirtLong' ? 'skirtLong' : 'skirtShort'
        character.apply(wear({ ...DEFAULT_ANIME, sex: 'female', hair: 'bob', shoeColour: '263A46' }, { top: 'vShort', bottom, shoes }))
        character.tick(0, false); character.vrm.scene.updateMatrixWorld(true)
        for (const [column, angle] of [0, Math.PI / 2, row < 2 ? Math.PI / 4 : Math.PI].entries()) {
          // Include the hem, not just the already-fitted waist. A waist crop
          // hid the old lower skirt's boxy silhouette from visual review.
          const target = new Vector3(0, row < 2 ? .085 : item === 'skirtLong' ? .59 : .79, row < 2 ? .06 : .007)
          const size = row < 2 ? .32 : item === 'skirtLong' ? .98 : .52
          const camera = new OrthographicCamera(-size / 2 * 440 / 380, size / 2 * 440 / 380, size / 2, -size / 2, .01, 20)
          camera.position.copy(target).add(new Vector3(Math.sin(angle) * 3, row < 2 ? .65 : .15, Math.cos(angle) * 3))
          camera.lookAt(target); renderer.render(scene, camera)
          ctx.drawImage(canvas, column * 440, row * 380)
          ctx.fillStyle = '#fff'; ctx.font = '18px sans-serif'
          ctx.fillText(`${item} · ${column === 0 ? 'front' : column === 1 ? 'side' : row < 2 ? 'three-quarter' : 'back'}`, column * 440 + 10, row * 380 + 365)
        }
      }
      return sheet.toDataURL('image/png').split(',')[1]!
    } finally { character.dispose(); renderer.dispose() }
  })
  await writeFile(testInfo.outputPath('wardrobe-tailoring-closeups.png'), Buffer.from(result, 'base64'))
})

test('wardrobe backup/PNG and skinned VRM/GLB downloads preserve the selected outfit', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.addInitScript(() => localStorage.setItem('chroma-match:lang', 'en'))
  await page.goto('/'); await enterLobby(page)
  await page.locator('#lobby-edit').click()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
  await page.getByRole('tab', { name: 'Wardrobe', exact: true }).click()
  await page.getByRole('button', { name: 'V neck · long sleeves', exact: true }).click()
  await page.getByRole('button', { name: 'Long skirt', exact: true }).click()
  await page.getByRole('button', { name: 'Heels', exact: true }).click()
  await page.getByRole('button', { name: 'Files & exports', exact: true }).click()
  const backupDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Character file (.json)', exact: true }).click()
  const backup = await readFile((await (await backupDownload).path())!, 'utf8')
  const saved = await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))
  expect(decodeSpec(JSON.parse(backup).code)).toMatchObject({ top: 'vLong', bottom: 'skirtLong', shoes: 'heels' })
  await page.getByLabel('Transparent image background', { exact: true }).check()
  const pngDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '4-view sheet PNG', exact: true }).click()
  const png = await pngDownload, pngPath = testInfo.outputPath('wardrobe-four-views.png')
  await png.saveAs(pngPath)
  const pngBytes = await readFile(pngPath)
  expect(pngBytes.readUInt32BE(16)).toBe(1024)
  expect(pngBytes.readUInt32BE(20)).toBe(1572)
  for (const label of ['Avatar (.vrm)', '3D model (.glb)']) {
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: label, exact: true }).click()
    const file = await download, path = testInfo.outputPath(file.suggestedFilename())
    await file.saveAs(path)
    const buffer = await readFile(path)
    const glb = readGlb(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length) as ArrayBuffer)
    expect(glb.json.nodes.filter(node => node.name?.startsWith('wardrobe_') && node.skin === 4).length).toBeGreaterThan(6)
    const reload = await page.evaluate(async (encoded) => {
      const { GLTFLoader } = await import('/node_modules/.vite/deps/three_addons_loaders_GLTFLoader__js.js')
      const { VRMLoaderPlugin, VRMUtils } = await import('/node_modules/.vite/deps/@pixiv_three-vrm.js')
      const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0))
      const loader = new GLTFLoader(); loader.register(parser => new VRMLoaderPlugin(parser))
      const gltf = await loader.parseAsync(bytes.buffer, location.origin + '/')
      const parts: string[] = []; gltf.scene.traverse(node => { if (node.name.startsWith('wardrobe_') && node.isSkinnedMesh) parts.push(node.name) })
      const meta = gltf.userData.vrm?.meta
      VRMUtils.deepDispose(gltf.scene)
      return { parts, name: meta?.name, author: meta?.authors }
    }, buffer.toString('base64'))
    expect(reload.parts.length).toBeGreaterThan(6)
    expect(reload.name).toBe('Seed-san')
    expect(reload.author).toContain('VirtualCast, Inc.')
  }
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Original outfit', exact: true }).click()
  await page.getByLabel('Restore character file', { exact: true }).setInputFiles({ name: 'wardrobe.json', mimeType: 'application/json', buffer: Buffer.from(backup) })
  await expect(page.locator('.studio-status')).toContainText('loaded as a draft')
  for (const name of ['V neck · long sleeves', 'Long skirt', 'Heels']) await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(saved)
  expect(errors).toEqual([])
})

for (const [lang, skin, tab, choice, width, height] of [
  ['en', 'paper', 'Wardrobe', 'V neck · long sleeves', 320, 568],
  ['ko', 'jewel', '의상', 'V넥 · 긴팔', 390, 844],
  ['ja', 'glass', '衣装', 'Vネック・長袖', 720, 720],
  ['zh-Hans', 'paper', '服装', 'V领 · 长袖', 1280, 800],
] as const) test(`wardrobe controls fit ${lang}/${skin} at ${width}px and work with keyboard/reduced motion`, async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.addInitScript(({ lang, skin }) => { localStorage.setItem('chroma-match:lang', lang); localStorage.setItem('chroma.skin', skin) }, { lang, skin })
  await page.setViewportSize({ width, height })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/'); await enterLobby(page)
  await page.locator('#lobby-edit').click()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
  await page.getByRole('tab', { name: tab, exact: true }).click()
  if (width === 320) {
    // Platform fallback fonts have different metrics. A monospace stress case
    // reproduced the Linux CI wrap that the default macOS font did not expose.
    const captions = page.locator('.studio-tab .studio-button-label')
    for (const font of ['inherit', 'Arial, sans-serif', 'Verdana, sans-serif', 'monospace']) {
      const metrics = await captions.evaluateAll((nodes, font) => {
        for (const node of nodes) (node as HTMLElement).style.fontFamily = font
        return nodes.map(node => {
          const range = document.createRange(); range.selectNodeContents(node)
          const ink = range.getBoundingClientRect(), button = node.closest('button')!.getBoundingClientRect()
          return { label: node.textContent, lines: range.getClientRects().length, inkLeft: ink.left, inkRight: ink.right, left: button.left, right: button.right, top: button.top, width: button.width, height: button.height }
        })
      }, font)
      expect(new Set(metrics.map(metric => Math.round(metric.top))).size, font).toBe(2)
      for (const metric of metrics) {
        const label = `${metric.label} (${font})`
        expect(metric.lines, label).toBe(1)
        expect(metric.inkLeft, label).toBeGreaterThanOrEqual(metric.left - .5)
        expect(metric.inkRight, label).toBeLessThanOrEqual(metric.right + .5)
        expect(metric.width, label).toBeGreaterThanOrEqual(44)
        expect(metric.height, label).toBeGreaterThanOrEqual(44)
        expect(metric.left, label).toBeGreaterThanOrEqual(0)
        expect(metric.right, label).toBeLessThanOrEqual(width)
      }
    }
    await captions.evaluateAll(nodes => nodes.forEach(node => (node as HTMLElement).style.removeProperty('font-family')))
  }
  const button = page.getByRole('button', { name: choice, exact: true })
  await button.focus(); await page.keyboard.press('Enter')
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  expect(await button.evaluate(node => getComputedStyle(node).outlineStyle)).toBe('solid')
  const panel = page.locator('.studio-options[data-category="wardrobe"]')
  await expect(panel.locator('fieldset')).toHaveCount(3)
  for (const control of await panel.locator('button, input').all()) {
    await control.scrollIntoViewIfNeeded()
    const box = (await control.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const canvas = page.locator('.studio-stage canvas')
  const before = await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL())
  await page.waitForTimeout(200)
  expect(await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL())).toBe(before)
  await panel.locator('fieldset').first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath(`wardrobe-${lang}-${skin}.png`) })
  expect(errors).toEqual([])
})
