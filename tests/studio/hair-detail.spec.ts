import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { enterLobby } from './boot.ts'
import { DEFAULT_ANIME } from '../../src/avatar/anime-spec.ts'
import { encodeSpec } from '../../src/avatar/spec.ts'

const staticTest = test.extend({ reducedMotion: 'reduce' as const })

test('bob and long hair show tapered strand separations on the actual lit back and keep head attachment', async ({ page }, testInfo) => {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/'); await enterLobby(page)
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'ready')
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('lobby-check.png') })
  await page.goto('/licenses/anime-assets.html')
  const result = await page.evaluate(async () => {
    const base = document.createElement('base'); base.href = new URL('/', location.href).href; document.head.prepend(base)
    const { StudioCharacter } = await import('/src/avatar/character-studio/character.ts')
    const { DEFAULT_ANIME } = await import('/src/avatar/anime-spec.ts')
    const { Scene, WebGLRenderer, PerspectiveCamera, AmbientLight, DirectionalLight, Color, Vector3, Box3 } = await import('/node_modules/.vite/deps/three.js')
    const character = await StudioCharacter.load(new AbortController().signal)
    const canvas = document.createElement('canvas')
    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setSize(320, 400, false)
    const scene = new Scene(); scene.background = new Color('#202C3D')
    scene.add(character.vrm.scene, new AmbientLight(0xffffff, 1.5))
    const key = new DirectionalLight(0xfff5eb, 2); key.position.set(-1, 2, 3); scene.add(key)
    const fill = new DirectionalLight(0xc9e4ff, .8); fill.position.set(2, 1, -2); scene.add(fill)
    const camera = new PerspectiveCamera(30, 320 / 400, .01, 30)
    const sheet = document.createElement('canvas'); sheet.width = 960; sheet.height = 856
    const ctx = sheet.getContext('2d')!
    const rows: { style: string; contrast: number; narrowDetails: number; bright: number; attached: boolean }[] = []
    try {
      for (const [row, style] of (['bob', 'long'] as const).entries()) {
        character.apply({ ...DEFAULT_ANIME, hair: style, hairColour: 'FFFFFF', pack: false, arms: false, visor: false })
        character.tick(0, false); character.vrm.scene.updateMatrixWorld(true)
        const shell = character.vrm.scene.getObjectByName('hair_shape') as any
        const paint = shell.material
        const map = paint.map.image as HTMLCanvasElement
        const texels = map.getContext('2d')!.getImageData(0, 0, map.width, map.height).data
        let narrowDetails = 0, bright = 0
        for (let i = 0; i < texels.length; i += 4) {
          if (texels[i]! < 220) narrowDetails++
          if (texels[i]! >= 232) bright++
        }
        const head = character.vrm.humanoid.getRawBoneNode('head')!
        const uv = Array.from(shell.geometry.attributes.uv.array)
        const headAt = head.getWorldPosition(new Vector3())
        const box = new Box3().setFromObject(character.vrm.scene)
        const y = headAt.y - .09, distance = (box.max.y - box.min.y) * .58 / (2 * Math.tan(Math.PI / 12))
        for (const [column, angle] of [0, Math.PI / 2, Math.PI].entries()) {
          camera.position.set(Math.sin(angle) * distance, y, Math.cos(angle) * distance); camera.lookAt(0, y, 0)
          renderer.render(scene, camera)
          ctx.drawImage(canvas, column * 320, row * 428)
          ctx.fillStyle = '#FFFFFF'; ctx.font = '15px sans-serif'
          ctx.fillText(`${style} · ${['front', 'side', 'back'][column]} · white`, column * 320 + 12, row * 428 + 420)
        }
        // Hair-only pixels in the back curtain, inset away from silhouette ink.
        const hidden: { node: any; visible: boolean }[] = []
        character.vrm.scene.traverse(node => {
          if ((node as any).isMesh && node !== shell) { hidden.push({ node, visible: node.visible }); node.visible = false }
        })
        scene.background = null; renderer.render(scene, camera)
        const sample = document.createElement('canvas'); sample.width = 320; sample.height = 400
        const sampleCtx = sample.getContext('2d')!; sampleCtx.drawImage(canvas, 0, 0)
        const data = sampleCtx.getImageData(0, 0, 320, 400).data
        const bands: number[] = []
        for (let sy = 100; sy < 270; sy++) {
          const xs: number[] = []
          for (let sx = 0; sx < 320; sx++) if (data[(sy * 320 + sx) * 4 + 3]! > 250) xs.push(sx)
          if (xs.length < 40) continue
          const left = xs[0]! + 12, right = xs.at(-1)! - 12
          for (let sx = left; sx <= right; sx++) {
            const at = (sy * 320 + sx) * 4
            if (data[at + 3]! > 250 && data[at]! > 150) bands.push(data[at]!)
          }
        }
        bands.sort((a, b) => a - b)
        const contrast = bands[Math.floor(bands.length * .95)]! - bands[Math.floor(bands.length * .02)]!
        for (const { node, visible } of hidden) node.visible = visible
        scene.background = new Color('#202C3D')
        let attached = true
        for (const gesture of ['wave', 'cheer', 'pose'] as const) {
          character.perform(gesture)
          let previous = 0
          for (const time of [.1, .75, 1.2, 2.8]) {
            character.tick(time - previous, true); previous = time
            character.vrm.scene.updateMatrixWorld(true)
            attached &&= shell.parent === head &&
              shell.matrixWorld.elements.every((value: number, i: number) => Math.abs(value - head.matrixWorld.elements[i]!) < 1e-7) &&
              shell.geometry.attributes.uv.array.every((value: number, i: number) => value === uv[i]) && shell.material.map.image === map
          }
          character.tick(0, false)
        }
        rows.push({ style, contrast, narrowDetails: narrowDetails / (texels.length / 4), bright: bright / (texels.length / 4), attached })
      }
      return { rows, png: sheet.toDataURL('image/png').split(',')[1]! }
    } finally { character.dispose(); renderer.dispose() }
  })
  await writeFile(testInfo.outputPath('white-hair-front-side-back.png'), Buffer.from(result.png, 'base64'))
  await writeFile(testInfo.outputPath('strand-metrics.json'), JSON.stringify(result.rows, null, 2))
  expect(errors).toEqual([])
  for (const row of result.rows) {
    expect(row.narrowDetails, `${row.style}: a few visible separation lines, not all-over gray`).toBeGreaterThan(.005)
    expect(row.narrowDetails).toBeLessThan(.12)
    expect(row.bright).toBeGreaterThan(.85)
    expect(row.contrast, `${row.style}: white back strands survive real lobby lighting`).toBeGreaterThan(15)
    expect(row.attached, `${row.style}: surface texture follows the actual head through all gesture phases`).toBe(true)
  }
})

for (const hair of ['bob', 'long'] as const) {
  staticTest(`white ${hair} hair can be inspected from the back in the mobile Paper lobby`, async ({ page }, testInfo) => {
    await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
    await page.setViewportSize({ width: 390, height: 844 })
    const code = encodeSpec({ ...DEFAULT_ANIME, hair, hairColour: 'FFFFFF', pack: false, arms: false, visor: false })
    await page.addInitScript(code => {
      localStorage.setItem('chroma-match:lang', 'en')
      localStorage.setItem('chroma.skin', 'paper')
      localStorage.setItem('chroma-match:avatar', code)
    }, code)
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
    await page.goto('/'); await enterLobby(page)
    await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'ready')
    await expect(page.locator('#profile-avatar')).toHaveAttribute('data-avatar-state', 'ready')
    const canvas = page.locator('#lobby-canvas'), box = (await canvas.boundingBox())!
    await page.screenshot({ path: testInfo.outputPath('paper-white-front.png') })
    const before = await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL())
    const x = box.x + 40, y = box.y + box.height * .5
    await page.mouse.move(x, y); await page.mouse.down()
    await page.mouse.move(x + Math.PI / .012, y, { steps: 12 }); await page.mouse.up()
    expect(await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL())).not.toBe(before)
    await page.screenshot({ path: testInfo.outputPath('paper-white-back-after-drag.png') })
    expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(code)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && scrollY === 0)).toBe(true)
    await expect(page.locator('#start-game')).toBeVisible()
    expect(errors).toEqual([])
  })
}
