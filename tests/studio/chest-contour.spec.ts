import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

test('front torso contour has no sharp apex or long angular upper facet', async ({ page }, testInfo) => {
  test.setTimeout(180000)
  await page.route('**/src/main.ts', route => route.fulfill({ contentType: 'application/javascript', body: '' }))
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { StudioCharacter } = await import('/src/avatar/character-studio/character.ts')
    const { DEFAULT_ANIME, wear } = await import('/src/avatar/anime-spec.ts')
    const { SkinnedMesh, Vector3, Scene, Color, WebGLRenderer, OrthographicCamera, HemisphereLight, DirectionalLight } = await import('/node_modules/.vite/deps/three.js')
    const character = await StudioCharacter.load(new AbortController().signal)
    const scene = new Scene(); scene.background = new Color('#263245')
    scene.add(character.vrm.scene, new HemisphereLight(0xffffff, 0x718095, 2))
    const light = new DirectionalLight(0xffffff, 2); light.position.set(-1, 2, 3); scene.add(light)
    const canvas = document.createElement('canvas'), renderer = new WebGLRenderer({ canvas, antialias: true })
    renderer.setSize(720, 720, false)
    const sheet = document.createElement('canvas'); sheet.width = 1440; sheet.height = 720
    const context = sheet.getContext('2d')!
    const samples: { top: string; bust: number; profile: { y: number; z: number }[]; worstTurn: number; apexTurn: number; upperFacet: number }[] = []
    try {
      for (const bust of [0, 3, 6] as const) for (const top of ['body', 'roundShort', 'vShort', 'roundLong', 'vLong', 'seed'] as const) {
        const base = { ...DEFAULT_ANIME, sex: 'female' as const, bust, hair: 'bob' as const, outfitColour: 'D47777', pack: false, arms: false, visor: false }
        character.apply(top === 'body' || top === 'seed' ? base : wear(base, { top, bottom: 'skirtShort', shoes: 'dress' }))
        character.tick(0, false); character.vrm.scene.updateMatrixWorld(true)
        const mesh = character.vrm.scene.getObjectByName(top === 'body' ? 'wear_1' : top === 'seed' ? 'wear_4' : 'wardrobe_top') as SkinnedMesh
        mesh.skeleton.update()
        const attrs = mesh.geometry.attributes, index = mesh.geometry.index!, faces: Vector3[][] = []
        const points = Array.from({ length: attrs.position!.count }, (_, i) => mesh.localToWorld(mesh.getVertexPosition(i, new Vector3())))
        const arm = (i: number) => [0, 1, 2, 3].some(j => attrs.skinWeight!.getComponent(i, j) > .1 && attrs.skinIndex!.getComponent(i, j) >= 30 && attrs.skinIndex!.getComponent(i, j) <= 78 && attrs.skinIndex!.getComponent(i, j) !== 37)
        for (let i = 0; i < index.count; i += 3) {
          const at = [0, 1, 2].map(j => index.getX(i + j))
          if (at.every(arm) || !at.every(i => attrs.position!.getZ(i) > .005)) continue
          if (at.some(i => attrs.position!.getY(i) > 1.03 && attrs.position!.getY(i) < 1.29)) faces.push(at.map(i => points[i]!))
        }
        const profile: { y: number; z: number }[] = []
        for (let row = 0; row <= 270; row++) {
          const y = 1.02 + row * .001
          let z = -Infinity
          for (const tri of faces) {
            const intersections: { x: number; z: number }[] = []
            for (let i = 0; i < 3; i++) {
              const a = tri[i]!, b = tri[(i + 1) % 3]!
              if ((y - a.y) * (y - b.y) > 0 || a.y === b.y) continue
              const t = (y - a.y) / (b.y - a.y)
              intersections.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
            }
            if (intersections.length < 2) continue
            const [a, b] = intersections as [{ x: number; z: number }, { x: number; z: number }]
            for (const p of intersections) if (Math.abs(p.x) <= .14) z = Math.max(z, p.z)
            for (const x of [-.14, .14]) {
              if ((x - a.x) * (x - b.x) > 0 || a.x === b.x) continue
              z = Math.max(z, a.z + (b.z - a.z) * (x - a.x) / (b.x - a.x))
            }
          }
          if (Number.isFinite(z)) profile.push({ y, z })
        }
        const apex = profile.reduce((best, p, i) => p.z > profile[best]!.z ? i : best, 0)
        const turns = profile.slice(2, -2).map((p, i) => {
          const before = profile[i]!, after = profile[i + 4]!
          return Math.abs(Math.atan2(after.z - p.z, after.y - p.y) - Math.atan2(p.z - before.z, p.y - before.y)) * 180 / Math.PI
        })
        const apexTurn = Math.max(...turns.slice(Math.max(0, apex - 12), apex + 9))
        const worstTurn = Math.max(...turns.slice(20, -20))
        let first = 0, angle = Infinity, upperFacet = 0
        for (let i = 1; i < profile.length; i++) {
          const a = profile[i - 1]!, b = profile[i]!
          if (a.y < profile[apex]!.y + .004 || b.y > profile[apex]!.y + .065) continue
          const next = Math.atan2(b.z - a.z, b.y - a.y)
          if (Math.abs(next - angle) > Math.PI / 180 * .1) { first = a.y; angle = next }
          upperFacet = Math.max(upperFacet, b.y - first)
        }
        samples.push({ top, bust, profile, apexTurn, worstTurn, upperFacet })
        if (top === 'roundShort' && bust !== 0) {
          const target = new Vector3(0, 1.14, .015), size = .42
          const camera = new OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, .01, 20)
          camera.position.copy(target).add(new Vector3(3, 0, 0)); camera.lookAt(target)
          renderer.render(scene, camera)
          const column = bust === 3 ? 0 : 1
          context.drawImage(canvas, column * 720, 0)
          context.fillStyle = '#fff'; context.font = '28px sans-serif'; context.fillText(`Chest ${bust} / 6 · side`, column * 720 + 16, 695)
        }
      }
      return { samples, png: sheet.toDataURL('image/png').split(',')[1]! }
    } finally { character.dispose(); renderer.dispose() }
  })
  await writeFile(testInfo.outputPath('chest-side-closeups.png'), Buffer.from(result.png, 'base64'))
  await writeFile(testInfo.outputPath('chest-contour.json'), JSON.stringify({ samples: result.samples }, null, 2))
  expect(result.samples).toHaveLength(18)
  for (const sample of result.samples) {
    expect(sample.profile.length).toBeGreaterThan(180)
    // Step 0 has no local mound maximum: the global frontmost point is the
    // lower torso outside this brief. Its full surface still renders in the
    // closeups and participates in the fitted-top clearance regression.
    if (sample.bust === 0) continue
    expect(sample.apexTurn, `${sample.top}/${sample.bust}: angular apex`).toBeLessThan(8)
    expect(sample.upperFacet, `${sample.top}/${sample.bust}: long upper facet`).toBeLessThan(.008)
  }
})
