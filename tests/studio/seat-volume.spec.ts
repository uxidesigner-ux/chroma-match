import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

test('minimum hips retain rounded rear volume in the actual rig, outfits and original export', async ({ page }, testInfo) => {
  test.setTimeout(180000)
  await page.route('**/src/main.ts', route => route.fulfill({ contentType: 'application/javascript', body: '' }))
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { StudioCharacter } = await import('/src/avatar/character-studio/character.ts')
    const { DEFAULT_ANIME, wear } = await import('/src/avatar/anime-spec.ts')
    const { readGlb } = await import('/src/avatar/studio-export.ts')
    const { Scene, SkinnedMesh, WebGLRenderer, OrthographicCamera, HemisphereLight, DirectionalLight, Color, Vector3 } = await import('/node_modules/.vite/deps/three.js')
    const character = await StudioCharacter.load(new AbortController().signal)
    const body = character.vrm.scene.getObjectByName('wear_1') as SkinnedMesh
    const rest = Float32Array.from(body.geometry.attributes.position!.array)
    const scene = new Scene(); scene.background = new Color('#263245')
    scene.add(character.vrm.scene, new HemisphereLight(0xffffff, 0x718095, 2))
    const light = new DirectionalLight(0xffffff, 2); light.position.set(-1, 2, 3); scene.add(light)
    const canvas = document.createElement('canvas'), renderer = new WebGLRenderer({ canvas, antialias: true })
    renderer.setSize(360, 380, false)
    const sheet = document.createElement('canvas'); sheet.width = 1080; sheet.height = 2280
    const ctx = sheet.getContext('2d')!, samples: { sex: string; hip: number; bottom: string; baseline: number; rounded: number; added: number }[] = [], failures: string[] = []
    let exportVertices = 0
    try {
      for (const sex of ['male', 'female'] as const) for (const hip of [0, 3, 6] as const) for (const bottom of ['seed', 'skirtShort', 'skirtLong', 'shorts', 'trousers'] as const) {
        const base = { ...DEFAULT_ANIME, sex, hip, hair: 'bob' as const, pack: false, arms: false, visor: false, outfitColour: 'D47777' }
        const spec = bottom === 'seed' ? base : wear(base, { top: 'vShort', bottom, shoes: 'heels' })
        character.apply(spec); character.tick(0, false); character.vrm.scene.updateMatrixWorld(true); body.skeleton.update()
        let baseline = 0, rounded = 0
        const positions = body.geometry.attributes.position!
        for (let i = 0; i < positions.count; i++) {
          const x = rest[i * 3]!, y = rest[i * 3 + 1]!, z = rest[i * 3 + 2]!
          if (Math.abs(x) > .09 || y < .79 || y > .87 || z > -.05) continue
          const before = body.localToWorld(body.applyBoneTransform(i, new Vector3(x, y, z)))
          const after = body.localToWorld(body.getVertexPosition(i, new Vector3()))
          baseline = Math.max(baseline, -before.z); rounded = Math.max(rounded, -after.z)
          if (positions.getX(i) !== x || positions.getY(i) !== y) failures.push('seat changed body width/height')
        }
        samples.push({ sex, hip, bottom, baseline, rounded, added: rounded - baseline })
        if (rounded - baseline < .018 || rounded - baseline > .045 || (hip === 0 && rounded < .075)) failures.push(`${sex}/${hip}/${bottom}: rear volume ${baseline}/${rounded}`)
        if (bottom === 'seed' && hip === 0) {
          const file = readGlb(character.export(spec)), wearNode = file.json.nodes.find(n => n.name === 'wear')!
          const primitive = file.json.meshes[wearNode.mesh!]!.primitives.find(p => file.json.materials[p.material]!.name === 'body_bake')!
          const accessor = file.json.accessors[primitive.attributes.POSITION!]!, view = file.json.bufferViews[accessor.bufferView]!
          const data = new DataView(file.binary.buffer, file.binary.byteOffset), start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
          if (accessor.count !== positions.count) failures.push('export body vertex count differs')
          for (let i = 0; i < accessor.count; i++) for (let j = 0; j < 3; j++) {
            if (Math.abs(data.getFloat32(start + i * (view.byteStride ?? 12) + j * 4, true) - positions.getComponent(i, j)) > 1e-7) failures.push(`${sex}: original outfit export/body mismatch`)
          }
          exportVertices += accessor.count
        }
        if (sex !== 'female') continue
        const row = hip === 0 ? ['skirtShort', 'skirtLong', 'shorts', 'trousers'].indexOf(bottom) : bottom === 'skirtShort' ? hip === 3 ? 4 : 5 : -1
        if (row < 0) continue
        for (const [column, angle] of [Math.PI / 2, Math.PI, Math.PI * .75].entries()) {
          const target = new Vector3(0, .85, 0), size = .51
          const camera = new OrthographicCamera(-size / 2 * 360 / 380, size / 2 * 360 / 380, size / 2, -size / 2, .01, 20)
          camera.position.copy(target).add(new Vector3(Math.sin(angle) * 3, .08, Math.cos(angle) * 3)); camera.lookAt(target)
          renderer.render(scene, camera); ctx.drawImage(canvas, column * 360, row * 380)
          ctx.fillStyle = '#fff'; ctx.font = '16px sans-serif'; ctx.fillText(`hip ${hip} · ${bottom} · ${['side', 'rear', '3/4'][column]}`, column * 360 + 8, row * 380 + 365)
        }
      }
      return { failures, samples, exportVertices, png: sheet.toDataURL('image/png').split(',')[1]! }
    } finally { character.dispose(); renderer.dispose() }
  })
  await writeFile(testInfo.outputPath('seat-volume-views.png'), Buffer.from(result.png, 'base64'))
  await writeFile(testInfo.outputPath('seat-volume-results.json'), JSON.stringify({ ...result, png: undefined }, null, 2))
  expect(result.failures).toEqual([])
  expect(result.samples).toHaveLength(30)
  expect(result.exportVertices).toBeGreaterThan(2000)
  for (const sex of ['male', 'female']) for (const bottom of ['seed', 'skirtShort', 'skirtLong', 'shorts', 'trousers']) {
    const values = result.samples.filter(s => s.sex === sex && s.bottom === bottom)
    expect(values[1]!.rounded).toBeGreaterThan(values[0]!.rounded)
    expect(values[2]!.rounded).toBeGreaterThan(values[1]!.rounded)
  }
})
