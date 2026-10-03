import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

test('chest closeups preserve the actual rig, size order and preview/export surfaces', async ({ page }, testInfo) => {
  test.setTimeout(180000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
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
    renderer.setSize(360, 360, false)
    const sheets: { top: string; png: string }[] = [], samples: { top: string; bust: number; depth: number }[] = [], failures: string[] = []
    let compared = 0
    try {
      for (const top of ['seed', 'roundShort', 'vShort', 'roundLong', 'vLong'] as const) {
        const sheet = document.createElement('canvas'); sheet.width = 1080; sheet.height = 1080
        const ctx = sheet.getContext('2d')!
        for (const [row, bust] of ([0, 3, 6] as const).entries()) {
          const base = { ...DEFAULT_ANIME, sex: 'female' as const, bust, hair: 'bob' as const, pack: false, arms: false, visor: false, outfitColour: 'D47777' }
          const spec = top === 'seed' ? base : wear(base, { top, bottom: 'skirtShort', shoes: 'dress' })
          character.apply(spec); character.tick(0, false); character.vrm.scene.updateMatrixWorld(true); body.skeleton.update()
          const positions = body.geometry.attributes.position!
          let depth = 0
          for (let i = 0; i < positions.count; i++) {
            const x = rest[i * 3]!, y = rest[i * 3 + 1]!, z = rest[i * 3 + 2]!
            if (Math.abs(x) > .1 || y < 1.07 || y > 1.24 || z <= .03) continue
            depth = Math.max(depth, body.localToWorld(body.getVertexPosition(i, new Vector3())).z)
          }
          samples.push({ top, bust, depth })
          const exported = readGlb(character.export(spec))
          const meshes: SkinnedMesh[] = []
          if (top === 'seed') meshes.push(body, character.vrm.scene.getObjectByName('wear_4') as SkinnedMesh)
          else character.vrm.scene.traverse(node => { if (node instanceof SkinnedMesh && ['wardrobe_top', 'wardrobe_top_binding', 'wardrobe_skin'].includes(node.name)) meshes.push(node) })
          for (const mesh of meshes) {
            if (mesh.skeleton !== body.skeleton) failures.push(`${mesh.name}: separate skeleton`)
            for (const group of mesh.geometry.groups) if (group.start !== 0 || group.count !== mesh.geometry.index!.count) failures.push(`${mesh.name}: truncated base/outline draw group`)
            if (mesh.geometry.drawRange.count < mesh.geometry.index!.count) failures.push(`${mesh.name}: truncated draw range`)
            const node = exported.json.nodes.find(n => n.name === (top === 'seed' ? 'wear' : mesh.name))!
            const paint = (Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material).name
            const primitive = exported.json.meshes[node.mesh!]!.primitives.find(p => top !== 'seed' || exported.json.materials[p.material]!.name === paint)!
            for (const [semantic, attribute, width] of [['POSITION', 'position', 3], ['NORMAL', 'normal', 3], ['TEXCOORD_0', 'uv', 2], ['JOINTS_0', 'skinIndex', 4], ['WEIGHTS_0', 'skinWeight', 4]] as const) {
              const actual = mesh.geometry.attributes[attribute]!, accessor = exported.json.accessors[primitive.attributes[semantic]!]!, view = exported.json.bufferViews[accessor.bufferView]!
              const data = new DataView(exported.binary.buffer, exported.binary.byteOffset), start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
              if (accessor.count !== actual.count) failures.push(`${mesh.name}/${semantic}: count mismatch`)
              const size = accessor.componentType === 5126 ? 4 : accessor.componentType === 5123 ? 2 : 1
              for (let i = 0; i < accessor.count; i++) for (let j = 0; j < width; j++) {
                const at = start + i * (view.byteStride ?? width * size) + j * size
                let value = size === 4 ? data.getFloat32(at, true) : size === 2 ? data.getUint16(at, true) : data.getUint8(at)
                if (accessor.normalized && size !== 4) value /= size === 2 ? 65535 : 255
                if (Math.abs(value - actual.getComponent(i, j)) > 1e-7) failures.push(`${mesh.name}/${semantic}: export mismatch`)
                compared++
              }
            }
            const actualIndex = mesh.geometry.index!, indexAccessor = exported.json.accessors[primitive.indices!]!, indexView = exported.json.bufferViews[indexAccessor.bufferView]!
            const indexData = new DataView(exported.binary.buffer, exported.binary.byteOffset), indexStart = (indexView.byteOffset ?? 0) + (indexAccessor.byteOffset ?? 0)
            const indexSize = indexAccessor.componentType === 5125 ? 4 : indexAccessor.componentType === 5123 ? 2 : 1
            if (indexAccessor.count !== actualIndex.count) failures.push(`${mesh.name}/indices: count mismatch`)
            for (let i = 0; i < indexAccessor.count; i++) {
              const at = indexStart + i * (indexView.byteStride ?? indexSize)
              const value = indexSize === 4 ? indexData.getUint32(at, true) : indexSize === 2 ? indexData.getUint16(at, true) : indexData.getUint8(at)
              if (value !== actualIndex.getX(i)) failures.push(`${mesh.name}/indices: export mismatch`)
              compared++
            }
          }
          for (const [column, angle] of [0, Math.PI / 4, Math.PI / 2].entries()) {
            const target = new Vector3(0, 1.14, .015), size = .42
            const camera = new OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, .01, 20)
            camera.position.copy(target).add(new Vector3(Math.sin(angle) * 3, 0, Math.cos(angle) * 3)); camera.lookAt(target)
            renderer.render(scene, camera); ctx.drawImage(canvas, column * 360, row * 360)
            ctx.fillStyle = '#fff'; ctx.font = '16px sans-serif'; ctx.fillText(`${top} · ${bust} · ${['front', '3/4', 'side'][column]}`, column * 360 + 8, row * 360 + 345)
          }
        }
        sheets.push({ top, png: sheet.toDataURL('image/png').split(',')[1]! })
      }
      return { failures, samples, compared, sheets }
    } finally { character.dispose(); renderer.dispose() }
  })
  for (const sheet of result.sheets) await writeFile(testInfo.outputPath(`chest-${sheet.top}.png`), Buffer.from(sheet.png, 'base64'))
  await writeFile(testInfo.outputPath('chest-results.json'), JSON.stringify({ ...result, sheets: undefined }, null, 2))
  expect(errors).toEqual([])
  expect(result.failures).toEqual([])
  expect(result.compared).toBeGreaterThan(100000)
  for (const top of ['seed', 'roundShort', 'vShort', 'roundLong', 'vLong']) {
    const sizes = result.samples.filter(s => s.top === top)
    expect(sizes[1]!.depth).toBeGreaterThan(sizes[0]!.depth)
    expect(sizes[2]!.depth).toBeGreaterThan(sizes[1]!.depth)
  }
})

test('fitted tops keep chest clearance through size extremes and gestures', async ({ page }, testInfo) => {
  test.setTimeout(180000)
  await page.route('**/src/main.ts', route => route.fulfill({ contentType: 'application/javascript', body: '' }))
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { StudioCharacter } = await import('/src/avatar/character-studio/character.ts')
    const { DEFAULT_ANIME, wear } = await import('/src/avatar/anime-spec.ts')
    const { SkinnedMesh, Vector3, Ray } = await import('/node_modules/.vite/deps/three.js')
    const character = await StudioCharacter.load(new AbortController().signal)
    const body = character.vrm.scene.getObjectByName('wear_1') as SkinnedMesh
    const rest = body.geometry.attributes.position!, index = body.geometry.index!, faces: number[][] = []
    for (let i = 0; i < index.count; i += 3) {
      const at = [0, 1, 2].map(j => index.getX(i + j))
      if (at.every(v => rest.getZ(v) > .01 && Math.abs(rest.getX(v)) < .18) && at.some(v => rest.getY(v) > .99 && rest.getY(v) < 1.28)) faces.push(at)
    }
    const failures: string[] = []
    let cases = 0, samples = 0, minimum = Infinity, maximum = 0
    try {
      for (const sex of ['male', 'female'] as const) for (const bust of [0, 3, 6] as const) for (const top of ['roundShort', 'roundLong', 'vShort', 'vLong'] as const) {
        const base = { ...DEFAULT_ANIME, sex, bust, pack: false, arms: false, visor: false }
        character.apply(wear(base, { top, bottom: 'skirtShort', shoes: 'dress' }))
        const shirt = character.vrm.scene.getObjectByName('wardrobe_top') as SkinnedMesh, position = shirt.geometry.attributes.position!
        const vertices = Array.from({ length: position.count }, (_, i) => i).filter(i => i % 12 === 0 && position.getY(i) > 1.02 && position.getY(i) < 1.24 && Math.abs(position.getX(i)) < .12 && position.getZ(i) > .04)
        for (const gesture of ['wave', 'cheer', 'pose'] as const) {
          character.perform(gesture); let previous = 0
          for (const phase of [0, .2, .75, 1.4, 2.8]) {
            character.tick(phase - previous, true); previous = phase
            character.vrm.scene.updateMatrixWorld(true); body.skeleton.update()
            const skin = Array.from({ length: rest.count }, (_, i) => body.localToWorld(body.getVertexPosition(i, new Vector3())))
            const centre = character.vrm.humanoid.getRawBoneNode('chest')!.getWorldPosition(new Vector3())
            for (const at of vertices) {
              const p = shirt.localToWorld(shirt.getVertexPosition(at, new Vector3())), origin = new Vector3(centre.x, p.y, centre.z)
              const ray = new Ray(origin, p.clone().sub(origin).normalize())
              let radius = 0
              for (const face of faces) {
                const [a, b, c] = face.map(i => skin[i]!) as [Vector3, Vector3, Vector3]
                if ([a, b, c].every(v => v.y < p.y) || [a, b, c].every(v => v.y > p.y)) continue
                const hit = ray.intersectTriangle(a, b, c, false, new Vector3())
                if (hit) radius = Math.max(radius, hit.distanceTo(origin))
              }
              if (!radius) continue
              const gap = p.distanceTo(origin) - radius
              samples++; minimum = Math.min(minimum, gap); maximum = Math.max(maximum, gap)
              if (gap < .002 || gap > .025) failures.push(`${sex}/${bust}/${top}/${gesture}/${phase}: chest gap ${gap.toFixed(5)} at y=${position.getY(at).toFixed(4)}`)
            }
          }
          cases++
        }
      }
      return { failures, cases, samples, minimum, maximum }
    } finally { character.dispose() }
  })
  await writeFile(testInfo.outputPath('chest-fit-results.json'), JSON.stringify(result, null, 2))
  expect(result.failures).toEqual([])
  expect(result.cases).toBe(72)
  expect(result.samples).toBeGreaterThan(3000)
})
