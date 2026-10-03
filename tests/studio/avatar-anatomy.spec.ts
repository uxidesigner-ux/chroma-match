import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { enterLobby } from './boot.ts'

test('real character gestures keep anatomical hinges at every phase and reset without drift', async ({ page }, testInfo) => {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.goto('/')
  await enterLobby(page)
  const result = await page.evaluate(async () => {
    const { StudioCharacter } = await import('/src/avatar/character-studio/character.ts')
    const { DEFAULT_ANIME } = await import('/src/avatar/anime-spec.ts')
    const { Scene, WebGLRenderer, PerspectiveCamera, HemisphereLight, DirectionalLight, Color, Vector3 } = await import('/node_modules/.vite/deps/three.js')
    const character = await StudioCharacter.load(new AbortController().signal)
    const canvas = document.createElement('canvas')
    const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
    renderer.setSize(320, 480, false)
    const scene = new Scene(); scene.background = new Color('#202C3D')
    scene.add(character.vrm.scene, new HemisphereLight(0xffffff, 0x718095, 2))
    const light = new DirectionalLight(0xffffff, 2.5); light.position.set(-1, 2, 3); scene.add(light)
    const camera = new PerspectiveCamera(30, 320 / 480, .1, 100)
    const sheet = document.createElement('canvas'); sheet.width = 960; sheet.height = 1000
    const ctx = sheet.getContext('2d')!
    const failures: string[] = []
    try {
      for (const [column, gesture] of (['wave', 'cheer', 'pose'] as const).entries()) {
        character.apply(DEFAULT_ANIME)
        character.perform(gesture)
        let previous = 0
        for (const time of [0, .1, .2, .35, .75, 1.2, 2.3, 2.6, 2.8]) {
          character.tick(time - previous, true); previous = time
          for (const side of ['left', 'right'] as const) {
            const bone = character.vrm.humanoid.getNormalizedBoneNode(`${side}LowerArm`)!
            if (Math.abs(bone.quaternion.x) > 1e-7 || Math.abs(bone.quaternion.z) > 1e-7)
              failures.push(`${gesture}/${time}/${side}: twist or sideways elbow`)
            if (bone.quaternion.y * (side === 'left' ? -1 : 1) <= 0)
              failures.push(`${gesture}/${time}/${side}: elbow reversed`)
          }
          if (time !== .75) continue
          const side = gesture === 'pose' ? 'left' : 'right'
          const elbow = character.vrm.humanoid.getRawBoneNode(`${side}LowerArm`)!.getWorldPosition(new Vector3())
          const hand = character.vrm.humanoid.getRawBoneNode(`${side}Hand`)!.getWorldPosition(new Vector3())
          if (gesture === 'pose' ? hand.z < elbow.z + .12 : hand.y < elbow.y + .12)
            failures.push(`${gesture}: hand is on the wrong side of the hinge`)
          for (let view = 0; view < 2; view++) {
            camera.position.set(view ? 4.2 : 0, .94, view ? 0 : 4.2); camera.lookAt(0, .94, 0)
            renderer.render(scene, camera)
            ctx.drawImage(canvas, column * 320, view * 500, 320, 480)
            ctx.fillStyle = '#ffffff'; ctx.font = '16px sans-serif'
            ctx.fillText(`${gesture} · ${view ? 'side' : 'front'} · 0.75s`, column * 320 + 12, view * 500 + 480)
          }
        }
        character.tick(0, false)
        const rest = character.vrm.humanoid.getNormalizedBoneNode('rightLowerArm')!.quaternion.toArray()
        character.perform(gesture); character.tick(.75, true); character.tick(0, false)
        if (rest.some((value, i) => Math.abs(value - character.vrm.humanoid.getNormalizedBoneNode('rightLowerArm')!.quaternion.toArray()[i]!) > 1e-7))
          failures.push(`${gesture}: accumulated rest drift`)
      }
      return { failures, png: sheet.toDataURL('image/png').split(',')[1]! }
    } finally { character.dispose(); renderer.dispose() }
  })
  await writeFile(testInfo.outputPath('gestures-front-side.png'), Buffer.from(result.png, 'base64'))
  expect(result.failures).toEqual([])
})

test('bob and long hair save their geometry/texture without changing the appearance format', async ({ page }, testInfo) => {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.addInitScript(() => localStorage.setItem('chroma-match:lang', 'ko'))
  await page.goto('/')
  await enterLobby(page)
  await page.locator('#lobby-edit').click()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
  await page.getByRole('button', { name: '동작 멈춤', exact: true }).click()
  await page.getByRole('tab', { name: '헤어', exact: true }).click()
  for (const [style, mark] of [['단발', 'B'], ['긴 머리', 'L']] as const) {
    await page.getByRole('button', { name: style, exact: true }).click()
    for (const view of ['정면', '측면', '후면']) {
      await page.getByRole('button', { name: view, exact: true }).click()
      await page.screenshot({ path: testInfo.outputPath(`${mark}-${view}.png`) })
    }
    await page.getByRole('button', { name: '저장', exact: true }).click()
    await expect(page.locator('.studio-status')).toHaveText('이 기기에 저장했어요.')
    const saved = await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))
    expect(saved).toMatch(new RegExp(`^[456]S${mark}`))
    await page.reload(); await enterLobby(page)
    await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'ready')
    expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(saved)
    const portrait = await page.evaluate(() => JSON.parse(localStorage.getItem('chroma-match:anime-portrait-v1')!))
    expect(portrait.frame).toBe(4)
    await page.locator('#lobby-edit').click()
    await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
    await page.getByRole('button', { name: '동작 멈춤', exact: true }).click()
    await page.getByRole('tab', { name: '헤어', exact: true }).click()
    await expect(page.getByRole('button', { name: style, exact: true })).toHaveAttribute('aria-pressed', 'true')
  }
})
