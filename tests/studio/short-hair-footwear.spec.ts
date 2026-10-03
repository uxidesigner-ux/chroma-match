import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { enterLobby } from './boot.ts'
import { decodeSpec } from '../../src/avatar/spec.ts'

test('short hair fits the real head, restores old styles, follows gestures, and footwear stays grounded', async ({ page }, testInfo) => {
  test.setTimeout(240000)
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.route('**/src/main.ts', route => route.fulfill({ contentType: 'application/javascript', body: '' }))
  await page.goto('/')
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const result = await page.evaluate(async () => {
    const { StudioCharacter } = await import('/src/avatar/character-studio/character.ts')
    const { DEFAULT_ANIME, wear } = await import('/src/avatar/anime-spec.ts')
    const { readGlb } = await import('/src/avatar/studio-export.ts')
    const { Scene, WebGLRenderer, PerspectiveCamera, HemisphereLight, DirectionalLight, Color, Vector3, Box3, Raycaster, Mesh } = await import('/node_modules/.vite/deps/three.js')
    const character = await StudioCharacter.load(new AbortController().signal)
    const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(360, 480, false)
    const scene = new Scene(); scene.background = new Color('#202C3D')
    scene.add(character.vrm.scene, new HemisphereLight(0xffffff, 0x718095, 2))
    const key = new DirectionalLight(0xffffff, 2); key.position.set(-1, 2, 3); scene.add(key)
    const camera = new PerspectiveCamera(30, .75, .01, 30)
    const sheet = document.createElement('canvas'); sheet.width = 1440; sheet.height = 1020
    const ctx = sheet.getContext('2d')!, metrics: any[] = [], shoes: any[] = [], views: any[] = []
    try {
      for (const hair of ['fade', 'pomade'] as const) for (const headSize of [0, 3, 6] as const) for (const sex of ['male', 'female'] as const) {
        const spec = { ...DEFAULT_ANIME, hair, head: headSize, sex, pack: false, arms: false, visor: false, hairColour: 'A899E8' }
        character.apply(spec); character.tick(0, false); character.vrm.scene.updateMatrixWorld(true)
        const head = character.vrm.humanoid.getRawBoneNode('head')!
        const shell = character.vrm.scene.getObjectByName('hair_shape') as Mesh
        const originals: any[] = [], eyes: any[] = [], heads: any[] = [], hands: any[] = []
        character.vrm.scene.traverse((node: any) => {
          if (!node.isMesh || node === shell) return
          const mats = Array.isArray(node.material) ? node.material : [node.material]
          if (/^hair(?:_|$)/.test(node.name)) originals.push(node)
          if (mats.some((m: any) => m.name === 'eye')) eyes.push(node)
          if (node.morphTargetInfluences?.length && mats.some((m: any) => m.name === 'body_bake')) heads.push(node)
          if (mats.some((m: any) => m.name === 'body_nm' || m.name === 'body_bake')) hands.push(...mats.filter((m: any) => m.name === 'body_nm' || m.name === 'body_bake'))
        })
        const world = (mesh: any, i: number) => {
          const p = new Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i)
          if (mesh.isSkinnedMesh) mesh.applyBoneTransform(i, p)
          return mesh.localToWorld(p)
        }
        const origin = head.getWorldPosition(new Vector3()); origin.z += 1
        const eyePoints: any[][] = [[], []]
        for (const mesh of eyes) for (const i of new Set<number>(mesh.geometry.index.array)) {
          const p = world(mesh, i)
          eyePoints[head.worldToLocal(p.clone()).x > 0 ? 1 : 0]!.push(p)
        }
        const visibleEyes = eyePoints.map(points => {
          if (!points.length) return false
          const centre = points.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(points.length)
          return !new Raycaster(origin, centre.clone().sub(origin).normalize()).intersectObject(shell).some(hit => hit.distance < origin.distanceTo(centre) - .001)
        })
        let covered = 0, sampled = 0; const holes: number[][] = []
        for (const mesh of heads) for (const i of [...new Set<number>(mesh.geometry.index.array)].filter((_, n) => n % 8 === 0)) {
          const p = world(mesh, i), local = head.worldToLocal(p.clone())
          if (local.y < .175 || Math.hypot(local.x, local.z) < .015) continue
          const start = head.localToWorld(new Vector3(local.x * 5, local.y, local.z * 5))
          const hits = new Raycaster(start, p.clone().sub(start).normalize()).intersectObject(shell)
          sampled++; if (hits.some(hit => hit.distance < start.distanceTo(p) - .0002)) covered++
          else holes.push(local.toArray())
        }
        const parentMatches = shell.parent === head
        const cleanHands = hands.every(material => {
          const canvas = material.map.image, pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
          for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 2] > pixels[i] * 1.2 + 10 && pixels[i + 1] > pixels[i] * 1.1 + 5) return false
          return true
        })
        character.perform('wave'); character.tick(.8, true); character.vrm.scene.updateMatrixWorld(true)
        const attached = shell.parent === head && shell.position.length() === 0
        character.tick(10, true); character.tick(0, false)
        if (headSize === 3 && sex === 'male') {
          const row = hair === 'fade' ? 0 : 1, centre = head.getWorldPosition(new Vector3()); centre.y += .025
          for (const [column, angle] of [0, Math.PI / 2, Math.PI, -.55].entries()) {
            camera.position.set(Math.sin(angle) * .95, centre.y + .04, Math.cos(angle) * .95); camera.lookAt(0, centre.y, 0)
            renderer.render(scene, camera); ctx.drawImage(renderer.domElement, column * 360, row * 510)
            ctx.fillStyle = '#FFFFFF'; ctx.font = '18px sans-serif'; ctx.fillText(`${hair} · ${column}`, column * 360 + 12, row * 510 + 502)
            views.push({ hair, view: column, png: renderer.domElement.toDataURL().split(',')[1] })
          }
          const exported = readGlb(character.export(spec))
          metrics.push({ hair, head: headSize, sex, visibleEyes, parentMatches, attached, originalVisible: originals.filter(n => n.visible).length, covered, sampled, holes,
            cleanHands,
            cleanExport: ['body_bake', 'body_nm'].every(name => {
              const mat = exported.json.materials.find(m => m.name === name)!, tex = exported.json.textures[mat.pbrMetallicRoughness.baseColorTexture!.index]!
              const img = exported.json.images[tex.source]!, view = exported.json.bufferViews[img.bufferView]!
              return (view.byteOffset ?? 0) > 1000000 && mat.pbrMetallicRoughness.baseColorFactor![0] === hands.find(m => m.name === name).color.r
            }) })
        } else metrics.push({ hair, head: headSize, sex, visibleEyes, parentMatches, attached, originalVisible: originals.filter(n => n.visible).length, covered, sampled, holes,
          cleanHands })
      }
      character.apply({ ...DEFAULT_ANIME, hair: 'bob', pack: false, arms: false, visor: false })
      const restored = (character.vrm.scene.getObjectByName('hair') as Mesh).visible
      for (const kind of ['basketball', 'dress', 'heels'] as const) for (const size of [0, 3, 6] as const) {
        const spec = wear({ ...DEFAULT_ANIME, hip: size, shoulder: size, bust: size, head: size, sex: 'female', pack: false, arms: false, visor: false }, { shoes: kind })
        character.apply(spec); character.tick(0, false); character.vrm.scene.updateMatrixWorld(true)
        const sole = character.vrm.scene.getObjectByName('wardrobe_soles')!, upper = character.vrm.scene.getObjectByName('wardrobe_shoes')!
        const soleBox = new Box3().setFromObject(sole, true), upperBox = new Box3().setFromObject(upper, true)
        shoes.push({ kind, size, floor: soleBox.min.y, upperFloor: upperBox.min.y })
      }
      return { metrics, shoes, restored, views, png: sheet.toDataURL().split(',')[1] }
    } finally { character.dispose(); renderer.dispose() }
  })
  await writeFile(testInfo.outputPath('short-hair-contact-sheet.png'), Buffer.from(result.png, 'base64'))
  for (const view of result.views) await writeFile(testInfo.outputPath(`${view.hair}-${view.view}.png`), Buffer.from(view.png, 'base64'))
  await writeFile(testInfo.outputPath('fit-metrics.json'), JSON.stringify({ metrics: result.metrics, shoes: result.shoes }, null, 2))
  expect(errors).toEqual([]); expect(result.restored).toBe(true)
  for (const row of result.metrics) {
    expect(row.originalVisible).toBe(0); expect(row.parentMatches && row.attached && row.cleanHands).toBe(true)
    expect(row.visibleEyes).toEqual([true, true])
    expect(row.sampled).toBeGreaterThan(20)
    expect(row.covered / row.sampled, `${row.hair}/${row.head}/${row.sex}: fitted scalp`).toBeGreaterThan(.98)
    if (row.cleanExport !== undefined) expect(row.cleanExport).toBe(true)
  }
  for (const shoe of result.shoes) { expect(shoe.floor).toBeGreaterThanOrEqual(.0018); expect(shoe.floor).toBeLessThan(.003); expect(shoe.upperFloor).toBeGreaterThan(.007) }
})

test('mobile keyboard selection, undo, save and reload preserve both new hairstyle codes', async ({ page }, testInfo) => {
  test.setTimeout(180000)
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.addInitScript(() => localStorage.setItem('chroma-match:lang', 'ko'))
  await page.goto('/'); await enterLobby(page)
  for (const [label, hair] of [['짧은 상고', 'fade'], ['포마드', 'pomade']] as const) {
    await page.locator('#lobby-edit').click(); await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
    await page.getByRole('tab', { name: '헤어', exact: true }).click()
    const choice = page.getByRole('button', { name: label, exact: true })
    await choice.focus(); await page.keyboard.press('Enter'); await expect(choice).toHaveAttribute('aria-pressed', 'true')
    const body = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }))
    expect(body.content).toBeLessThanOrEqual(body.width)
    const before = await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))
    await page.getByRole('button', { name: '단발', exact: true }).click()
    await page.getByRole('button', { name: '되돌리기', exact: true }).click(); await expect(choice).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(before)
    await page.screenshot({ path: testInfo.outputPath(`${hair}-mobile-editor.png`) })
    await page.getByRole('button', { name: '저장', exact: true }).click(); await expect(page.locator('.studio-status')).toHaveText('이 기기에 저장했어요.')
    const code = await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))
    expect(decodeSpec(code!).hair).toBe(hair)
    await page.reload(); await enterLobby(page); await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'ready')
    expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(code)
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('chroma-match:anime-portrait-v1')!).frame)).toBe(7)
    await page.screenshot({ path: testInfo.outputPath(`${hair}-mobile-lobby.png`) })
  }
})
