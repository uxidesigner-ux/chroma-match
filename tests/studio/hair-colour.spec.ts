import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { enterLobby } from './boot.ts'

test('white-based hair preserves bright pigment, strands and preview/export parity in every cut', async ({ page }, testInfo) => {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await enterLobby(page)
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'ready')
  await expect(page.locator('#start-game')).toBeVisible()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('dev-lobby.png') })
  // Leave the app so its live lobby does not compete with the diagnostic scene.
  await page.goto('/licenses/anime-assets.html')
  const result = await page.evaluate(async () => {
    const base = document.createElement('base'); base.href = new URL('/', location.href).href; document.head.prepend(base)
    const { StudioCharacter } = await import('/src/avatar/character-studio/character.ts')
    const { DEFAULT_ANIME } = await import('/src/avatar/anime-spec.ts')
    const { readGlb } = await import('/src/avatar/studio-export.ts')
    const { Scene, WebGLRenderer, PerspectiveCamera, AmbientLight, DirectionalLight, Color, Vector3, Box3 } = await import('/node_modules/.vite/deps/three.js')
    const character = await StudioCharacter.load(new AbortController().signal)
    const canvas = document.createElement('canvas')
    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setSize(256, 256, false)
    const scene = new Scene()
    scene.add(character.vrm.scene, new AmbientLight(0xffffff, 1.5))
    const key = new DirectionalLight(0xfff5eb, 2); key.position.set(-1, 2, 3); scene.add(key)
    const fill = new DirectionalLight(0xc9e4ff, .8); fill.position.set(2, 1, -2); scene.add(fill)
    const camera = new PerspectiveCamera(30, 1, .01, 30)
    const sheet = document.createElement('canvas'); sheet.width = 768; sheet.height = 4 * 292
    const ctx = sheet.getContext('2d')!
    const materials = () => {
      const out = new Map<string, any>()
      character.vrm.scene.traverse(node => {
        if (!(node as any).isMesh) return
        for (const material of Array.isArray((node as any).material) ? (node as any).material : [(node as any).material])
          if (['hair', 'hair_shape', 'eye', 'huku_bake'].includes(material.name)) out.set(material.name, material)
      })
      return out
    }
    const pixels = (image: CanvasImageSource & { width: number; height: number }) => {
      const sample = document.createElement('canvas'); sample.width = image.width; sample.height = image.height
      const context = sample.getContext('2d')!; context.drawImage(image, 0, 0)
      return context.getImageData(0, 0, sample.width, sample.height).data
    }
    const stats = (data: Uint8ClampedArray) => {
      let min = 255, max = 0, total = 0, count = 0, chroma = 0, bright = 0, detail = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]! < 250) continue
        min = Math.min(min, data[i]!); max = Math.max(max, data[i]!)
        total += data[i]!; count++
        if (data[i]! >= 232) bright++
        if (data[i]! < 220) detail++
        chroma = Math.max(chroma, Math.abs(data[i]! - data[i + 1]!), Math.abs(data[i]! - data[i + 2]!))
      }
      return { min, max, mean: total / count, count, chroma, bright: bright / count, detail: detail / count }
    }
    const hue = (rgb: number[]) => {
      const [r, g, b] = rgb, max = Math.max(...rgb), min = Math.min(...rgb), delta = max - min
      if (!delta) return 0
      const raw = max === r ? (g! - b!) / delta : max === g ? (b! - r!) / delta + 2 : (r! - g!) / delta + 4
      return ((raw * 60) % 360 + 360) % 360
    }
    const textureRows: { style: string; name: string; min: number; max: number; mean: number; count: number; chroma: number; bright: number; detail: number }[] = []
    const rendered: { style: string; colour: string; rgb: number[]; hueError: number; coverage: number; saturation: number }[] = []
    const exports: { style: string; name: string; colour: string; matches: boolean; selectedFactor: string; exportedFactor: string }[] = []
    const unaffected: { name: string; matches: boolean }[] = []
    let referenceOther: Record<string, string> = {}
    try {
      for (const [column, style] of (['tails', 'bob', 'long'] as const).entries()) {
        for (const [row, colour] of ['FFFFFF', 'FFEA00', 'FF00FF', '0066FF'].entries()) {
          const spec = { ...DEFAULT_ANIME, hair: style, hairColour: colour }
          character.apply(spec)
          const paints = materials()
          for (const name of ['eye', 'huku_bake']) {
            const value = (paints.get(name).map.image as HTMLCanvasElement).toDataURL()
            referenceOther[name] ??= value
            unaffected.push({ name, matches: referenceOther[name] === value })
          }
          character.vrm.scene.updateMatrixWorld(true)
          const box = new Box3()
          character.vrm.scene.traverseVisible(node => { if ((node as any).isMesh) box.expandByObject(node, true) })
          const head = character.vrm.humanoid.getRawBoneNode('head')!.getWorldPosition(new Vector3())
          const y = head.y * 1.02, distance = (box.max.y - box.min.y) * .42 / (2 * Math.tan(Math.PI / 12))
          camera.position.set(0, y, distance); camera.lookAt(0, y, 0)
          scene.background = new Color('#202C3D'); renderer.render(scene, camera)
          ctx.drawImage(canvas, column * 256, row * 292)
          ctx.fillStyle = '#202C3D'; ctx.fillRect(column * 256, row * 292 + 256, 256, 36)
          ctx.fillStyle = `#${colour}`; ctx.fillRect(column * 256 + 10, row * 292 + 265, 16, 16)
          ctx.fillStyle = '#FFFFFF'; ctx.font = '14px sans-serif'; ctx.fillText(`${style} · #${colour}`, column * 256 + 34, row * 292 + 279)
          // Render only actual hair, not skin/background pixels which could make
          // a washed-out yellow falsely look bright. Keep the production lights.
          const hidden: { node: any; visible: boolean }[] = []
          character.vrm.scene.traverse(node => {
            if (!(node as any).isMesh) return
            const mats = Array.isArray((node as any).material) ? (node as any).material : [(node as any).material]
            if (!mats.some((mat: any) => ['hair', 'hair_shape'].includes(mat.name))) {
              hidden.push({ node, visible: node.visible }); node.visible = false
            }
          })
          scene.background = null; renderer.render(scene, camera)
          const mask = document.createElement('canvas'); mask.width = mask.height = 256
          const maskCtx = mask.getContext('2d')!; maskCtx.drawImage(canvas, 0, 0)
          const data = maskCtx.getImageData(0, 0, 256, 256).data
          const channels: number[][] = [[], [], []]
          for (let i = 0; i < data.length; i += 4) if (data[i + 3]! >= 250 && Math.max(data[i]!, data[i + 1]!, data[i + 2]!) > 30)
            for (let c = 0; c < 3; c++) channels[c]!.push(data[i + c]!)
          const rgb = channels.map(values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!)
          const selected = [0, 2, 4].map(at => parseInt(colour.slice(at, at + 2), 16))
          const turn = Math.abs(hue(rgb) - hue(selected))
          rendered.push({ style, colour, rgb, hueError: Math.min(turn, 360 - turn), coverage: channels[0]!.length, saturation: (Math.max(...rgb) - Math.min(...rgb)) / Math.max(...rgb) })
          for (const { node, visible } of hidden) node.visible = visible
          if (row > 1) continue
          if (row === 0) for (const name of ['hair', 'hair_shape']) if (paints.has(name)) textureRows.push({ style, name, ...stats(pixels(paints.get(name).map.image)) })
          const { json, binary } = readGlb(character.export(spec))
          for (const name of ['hair', 'hair_shape']) {
            const mat = json.materials.find(item => item.name === name)
            if (!mat?.pbrMetallicRoughness.baseColorTexture || !paints.has(name)) continue
            const imageAt = json.textures[mat.pbrMetallicRoughness.baseColorTexture.index]!.source
            const view = json.bufferViews[json.images[imageAt]!.bufferView]!
            const bytes = binary.slice(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
            const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
            try {
              const image = new Image(); image.src = url; await image.decode()
              const exported = pixels(image), live = pixels(paints.get(name).map.image)
              exports.push({ style, name, colour, matches: exported.length === live.length && exported.every((value, i) => value === live[i]), selectedFactor: paints.get(name).color.getHexString(), exportedFactor: new Color().fromArray(mat.pbrMetallicRoughness.baseColorFactor!).getHexString() })
            } finally { URL.revokeObjectURL(url) }
          }
        }
      }
      return { textureRows, rendered, exports, unaffected, png: sheet.toDataURL('image/png').split(',')[1]! }
    } finally { character.dispose(); renderer.dispose() }
  })
  await writeFile(testInfo.outputPath('hair-colour-grid.png'), Buffer.from(result.png, 'base64'))
  const { png, ...metrics } = result
  await writeFile(testInfo.outputPath('hair-colour-metrics.json'), JSON.stringify(metrics, null, 2))
  expect(errors).toEqual([])
  expect(result.textureRows).toHaveLength(5)
  for (const texture of result.textureRows) {
    expect(texture.chroma).toBe(0)
    if (texture.name === 'hair_shape') {
      expect(texture.min).toBeGreaterThanOrEqual(158)
      expect(texture.mean, 'detail cannot turn the white carrier into a gray filter').toBeGreaterThan(240)
      expect(texture.bright).toBeGreaterThan(.85)
      expect(texture.detail).toBeGreaterThan(.005)
      expect(texture.detail).toBeLessThan(.12)
    } else expect(texture.min, `${texture.style}/${texture.name} must use white, not mid-gray`).toBeGreaterThanOrEqual(232)
    expect(texture.max).toBe(255)
    expect(texture.max - texture.min).toBeGreaterThanOrEqual(8)
  }
  for (const colour of result.rendered) {
    expect(colour.coverage).toBeGreaterThan(500)
    if (colour.colour === 'FFFFFF') {
      expect(Math.min(...colour.rgb)).toBeGreaterThanOrEqual(210)
      expect(Math.max(...colour.rgb) - Math.min(...colour.rgb)).toBeLessThanOrEqual(12)
    } else {
      expect(colour.hueError).toBeLessThanOrEqual(4)
      expect(colour.saturation).toBeGreaterThanOrEqual(.95)
      expect(Math.max(...colour.rgb)).toBeGreaterThanOrEqual(210)
    }
  }
  for (const colour of ['FFFFFF', 'FFEA00', 'FF00FF', '0066FF']) {
    const peaks = result.rendered.filter(row => row.colour === colour).map(row => Math.max(...row.rgb))
    expect(Math.max(...peaks) - Math.min(...peaks)).toBeLessThanOrEqual(10)
  }
  expect(result.exports).toHaveLength(10)
  expect(result.exports.every(row => row.matches && row.selectedFactor === row.colour.toLowerCase() && row.exportedFactor === row.selectedFactor)).toBe(true)
  expect(result.unaffected.every(row => row.matches)).toBe(true)
})

for (const variant of [
  { width: 1280, height: 800, style: 'Short bob', hair: 'bob' },
  { width: 390, height: 844, style: 'Long hair', hair: 'long' },
] as const) test(`hair picker saves the exact yellow and refreshes previous-render portraits at ${variant.width}px`, async ({ page }, testInfo) => {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.addInitScript(() => localStorage.setItem('chroma-match:lang', 'en'))
  await page.setViewportSize({ width: variant.width, height: variant.height })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('/'); await enterLobby(page)
  const initial = await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))
  await page.locator('#lobby-edit').click()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
  await page.getByRole('tab', { name: 'Hair', exact: true }).click()
  await page.getByRole('button', { name: variant.style, exact: true }).click()
  await page.getByRole('tab', { name: 'Colours', exact: true }).click()
  const picker = page.locator('input[type=color][aria-label="Hair"]')
  await picker.fill('#ffea00')
  const yellow = await page.locator('.studio-stage canvas').evaluate(node => (node as HTMLCanvasElement).toDataURL())
  await picker.fill('#ffffff')
  const white = await page.locator('.studio-stage canvas').evaluate(node => (node as HTMLCanvasElement).toDataURL())
  expect(white).not.toBe(yellow)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(picker).toHaveValue('#ffea00')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(picker).toHaveValue('#ffffff')
  await picker.fill('#ffea00')
  await picker.focus(); await expect(picker).toBeFocused()
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(initial)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('yellow-editor.png') })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('.studio-status')).toHaveText('Saved on this device.')
  const saved = await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))
  const spec = await page.evaluate(async saved => {
    const { decodeSpec } = await import('/src/avatar/spec.ts'); return decodeSpec(saved!)
  }, saved)
  expect(spec.hairColour).toBe('FFEA00'); expect(spec.hair).toBe(variant.hair)
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('chroma-match:anime-portrait-v1')!)
    const gray = document.createElement('canvas'); gray.width = gray.height = 1
    const ctx = gray.getContext('2d')!; ctx.fillStyle = '#a0a0a0'; ctx.fillRect(0, 0, 1, 1)
    localStorage.setItem('chroma-match:anime-portrait-v1', JSON.stringify({ ...saved, frame: 5, png: gray.toDataURL() }))
  })
  await page.reload(); await enterLobby(page)
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'ready')
  await expect(page.locator('#profile-avatar')).toHaveAttribute('data-avatar-state', 'ready')
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(saved)
  const portrait = await page.evaluate(() => JSON.parse(localStorage.getItem('chroma-match:anime-portrait-v1')!))
  expect(portrait.frame).toBe(7); expect(portrait.png.length).toBeGreaterThan(1000)
  await page.screenshot({ path: testInfo.outputPath('yellow-lobby-reloaded.png') })
  await page.locator('#lobby-edit').click()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
  await page.getByRole('tab', { name: 'Colours', exact: true }).click()
  await expect(picker).toHaveValue('#ffea00')
  expect(errors).toEqual([])
})
