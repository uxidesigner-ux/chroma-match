import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

test('bob and long crown join covers the rear seam without obscuring the eyes', async ({ page }, testInfo) => {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.goto('/licenses/anime-assets.html')
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const result = await page.evaluate(async () => {
    const base = document.createElement('base'); base.href = new URL('/', location.href).href; document.head.prepend(base)
    const { StudioCharacter } = await import('/src/avatar/character-studio/character.ts')
    const { DEFAULT_ANIME } = await import('/src/avatar/anime-spec.ts')
    const { hairGeometry } = await import('/src/avatar/hair-strands.ts')
    const { Scene, WebGLRenderer, PerspectiveCamera, AmbientLight, DirectionalLight, Color, Vector3, Raycaster } = await import('/node_modules/.vite/deps/three.js')
    const character = await StudioCharacter.load(new AbortController().signal)
    const canvas = document.createElement('canvas')
    const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
    renderer.setSize(384, 512, false)
    const scene = new Scene(); scene.background = new Color('#202C3D')
    scene.add(character.vrm.scene, new AmbientLight(0xffffff, 1.5))
    const key = new DirectionalLight(0xfff5eb, 2); key.position.set(-1, 2, 3); scene.add(key)
    const fill = new DirectionalLight(0xc9e4ff, .8); fill.position.set(2, 1, -2); scene.add(fill)
    const camera = new PerspectiveCamera(30, 384 / 512, .01, 30)
    const sheet = document.createElement('canvas'); sheet.width = 1152; sheet.height = 1080
    const ctx = sheet.getContext('2d')!
    const metrics: { hair: string; head: number; eyesVisible: boolean[]; rearCovered: number; sampled: number; exportMatches: boolean; eyePixels?: number[] }[] = []
    const views: { hair: string; view: string; png: string }[] = []
    try {
      for (const hair of ['bob', 'long'] as const) for (const headSize of [0, 2, 4]) {
        const spec = { ...DEFAULT_ANIME, hair, head: headSize, hairColour: 'FFFFFF', pack: false, arms: false, visor: false }
        character.apply(spec); character.tick(0, false); character.vrm.scene.updateMatrixWorld(true)
        const head = character.vrm.humanoid.getRawBoneNode('head')!
        const shell = character.vrm.scene.getObjectByName('hair_shape') as any
        const sourceHair: any[] = [], eyes: any[] = []
        character.vrm.scene.traverse(node => {
          if (!(node as any).isMesh || node === shell || node.name.startsWith('hair_tail')) return
          const mats = Array.isArray((node as any).material) ? (node as any).material : [(node as any).material]
          if (mats.some((mat: any) => mat.name === 'hair')) sourceHair.push(node)
          if (mats.some((mat: any) => mat.name === 'eye')) eyes.push(node)
        })
        const world = (mesh: any, index: number) => {
          const p = new Vector3().fromBufferAttribute(mesh.geometry.attributes.position, index)
          if (mesh.isSkinnedMesh) mesh.applyBoneTransform(index, p)
          return mesh.localToWorld(p)
        }
        const origin = head.getWorldPosition(new Vector3()); origin.z += 1.1
        const eyePoints: any[][] = [[], []]
        // glTF primitives can share a position accessor. Only vertices used by
        // the iris primitive describe an eye; the unused head vertices do not.
        for (const mesh of eyes) for (const i of new Set<number>(mesh.geometry.index.array)) {
          const p = world(mesh, i), local = head.worldToLocal(p.clone())
          eyePoints[local.x > 0 ? 1 : 0]!.push(p)
        }
        const eyesVisible = eyePoints.map(points => {
          if (!points.length) return false
          const centre = points.reduce((sum, point) => sum.add(point), new Vector3()).divideScalar(points.length)
          const distance = centre.distanceTo(origin), ray = new Raycaster(origin, centre.clone().sub(origin).normalize())
          return !ray.intersectObject(shell).some(hit => hit.distance < distance - .001)
        })
        let rearCovered = 0, sampled = 0
        for (const mesh of sourceHair) for (let i = 0; i < mesh.geometry.attributes.position.count; i += 8) {
          const p = world(mesh, i), local = head.worldToLocal(p.clone())
          if (local.z > -.025 || local.y < .07) continue
          // Outward radial view: the new continuous shell must hide the old
          // crown/curtain overlap, including the old material's outline rim.
          const start = head.localToWorld(new Vector3(local.x * 5, local.y, local.z * 5))
          const distance = start.distanceTo(p), ray = new Raycaster(start, p.clone().sub(start).normalize())
          sampled++
          if (ray.intersectObject(shell).some(hit => hit.distance < distance - .001)) rearCovered++
        }
        const shape = hairGeometry(hair)!
        const exported = character.export(spec)
        const { readGlb } = await import('/src/avatar/studio-export.ts')
        const { json, binary } = readGlb(exported)
        const mesh = json.meshes.find(mesh => mesh.name === 'hair_shape')!
        const primitive = mesh.primitives[0]!
        let exportMatches = true
        for (const [name, values] of [['POSITION', shape.positions], ['NORMAL', shape.normals], ['TEXCOORD_0', shape.uv]] as const) {
          const accessor = json.accessors[primitive.attributes[name]!]!, view = json.bufferViews[accessor.bufferView]!
          const bytes = new Float32Array(binary.buffer, binary.byteOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0), values.length)
          exportMatches &&= bytes.every((value, i) => value === values[i])
        }
        let eyePixels: number[] | undefined
        if (headSize === 2) {
          const row = hair === 'bob' ? 0 : 1, centre = head.getWorldPosition(new Vector3()); centre.y += .02
          for (const [column, angle] of [0, Math.PI / 2, Math.PI].entries()) {
            camera.position.set(Math.sin(angle) * 1.03, centre.y, Math.cos(angle) * 1.03); camera.lookAt(0, centre.y, 0)
            renderer.render(scene, camera); ctx.drawImage(canvas, column * 384, row * 540)
            views.push({ hair, view: ['front', 'side', 'back'][column]!, png: canvas.toDataURL('image/png').split(',')[1]! })
            ctx.fillStyle = '#FFFFFF'; ctx.font = '18px sans-serif'; ctx.fillText(`${hair} · ${['front', 'side', 'back'][column]}`, column * 384 + 12, row * 540 + 532)
            if (column === 0) {
              const sample = document.createElement('canvas'); sample.width = 384; sample.height = 512
              const sampleCtx = sample.getContext('2d')!; sampleCtx.drawImage(canvas, 0, 0)
              const joined = sampleCtx.getImageData(0, 0, 384, 512).data
              shell.visible = false; renderer.render(scene, camera); sampleCtx.drawImage(canvas, 0, 0)
              const original = sampleCtx.getImageData(0, 0, 384, 512).data
              shell.visible = true
              const eyeBounds = eyePoints.map(points => {
                const projected = points.map(point => point.clone().project(camera))
                return {
                  left: Math.min(...projected.map(point => (point.x + 1) * 192)),
                  right: Math.max(...projected.map(point => (point.x + 1) * 192)),
                  top: Math.min(...projected.map(point => (1 - point.y) * 256)),
                  bottom: Math.max(...projected.map(point => (1 - point.y) * 256)),
                }
              })
              const total = [0, 0], retained = [0, 0]
              for (let y = 0; y < 512; y++) for (let x = 0; x < 384; x++) {
                const at = (y * 384 + x) * 4
                const side = eyeBounds.findIndex(box => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom)
                if (side < 0) continue
                // Purple iris pixels, not white hair/skin/background. No ticks
                // between renders: compare the same eye pose with/without cap.
                if (original[at + 2]! < 100 || original[at + 2]! <= original[at]! + 15 || original[at + 2]! <= original[at + 1]! + 15) continue
                total[side] = total[side]! + 1
                if ([0, 1, 2].every(channel => Math.abs(joined[at + channel]! - original[at + channel]!) < 10)) retained[side] = retained[side]! + 1
              }
              eyePixels = total.map((count, side) => count > 20 ? retained[side]! / count : 0)
            }
          }
        }
        metrics.push({ hair, head: headSize, eyesVisible, rearCovered, sampled, exportMatches, eyePixels })
      }
      return { metrics, views, png: sheet.toDataURL('image/png').split(',')[1]! }
    } finally { character.dispose(); renderer.dispose() }
  })
  await writeFile(testInfo.outputPath('crown-join-front-side-back.png'), Buffer.from(result.png, 'base64'))
  await writeFile(testInfo.outputPath('crown-join-metrics.json'), JSON.stringify(result.metrics, null, 2))
  for (const view of result.views) await writeFile(testInfo.outputPath(`${view.hair}-${view.view}.png`), Buffer.from(view.png, 'base64'))
  expect(errors).toEqual([])
  for (const row of result.metrics) {
    expect(row.eyesVisible, `${row.hair}/${row.head}: do not cover either eye`).toEqual([true, true])
    expect(row.sampled).toBeGreaterThan(20)
    expect(row.rearCovered / row.sampled, `${row.hair}/${row.head}: old rear-crown outline is inside the new shell`).toBeGreaterThan(.98)
    expect(row.exportMatches, `${row.hair}/${row.head}: exact preview/export geometry`).toBe(true)
    if (row.eyePixels) for (const fraction of row.eyePixels) expect(fraction, `${row.hair}: original visible iris pixels stay uncovered`).toBeGreaterThan(.99)
  }
})
