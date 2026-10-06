import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { enterLobby } from './boot.ts'

test.use({ reducedMotion: 'reduce', viewport: { width: 430, height: 852 } })

test.beforeEach(async ({ page }) => {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.addInitScript(() => {
    if (!localStorage.getItem('chroma-match:lang')) localStorage.setItem('chroma-match:lang', 'ko')
    localStorage.setItem('chroma.skin', 'paper')
  })
  await page.goto('/?seed=3')
  await enterLobby(page)
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'ready')
})

test('pointer rotation has no frame, but keyboard entry and rotation keep visible focus in both previews', async ({ page }) => {
  const avatar = await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))
  for (const selector of ['#lobby-canvas', '.studio-stage canvas']) {
    if (selector !== '#lobby-canvas') {
      // The mobile editor sheet covers the lower half of its underlying
      // canvas; drag the desktop preview, not the sheet's resize handle.
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.locator('#lobby-edit').click()
      await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
    }
    const canvas = page.locator(selector)
    const outline = () => canvas.evaluate(node => getComputedStyle(node).outlineStyle)
    const read = async () => createHash('sha256').update(await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL())).digest('hex')
    await canvas.focus()
    await page.keyboard.press('Home')
    expect(await outline()).toBe('solid')
    const before = await read()
    const box = (await canvas.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 50, { steps: 4 })
    expect(await outline()).toBe('none')
    await page.mouse.up()
    expect(await read()).not.toBe(before)
    expect(await outline()).toBe('none')
    await page.keyboard.press('ArrowRight')
    expect(await outline()).toBe('solid')
    await page.keyboard.press('Tab')
    await expect(canvas).not.toHaveAttribute('data-pointer-focus', '')
    await page.keyboard.press('Shift+Tab')
    await expect(canvas).toBeFocused()
    expect(await outline()).toBe('solid')
  }
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(avatar)
  await page.locator('#creator-back').click()
  await expect(page.locator('#screen-home')).toBeVisible()
})

test('portrait decoration is unclipped, customization is labeled, gestures grouped and utilities quiet on every skin', async ({ page }) => {
  for (const skin of ['paper', 'jewel', 'glass']) {
    if (skin !== 'paper') {
      await page.goto(`/?seed=3&skin=${skin}`)
      await enterLobby(page)
    }
    await page.locator('#map-name').evaluate(node => { node.textContent = '캐릭터를 꾸미는 아주 긴 플레이어 이름' })
    await page.locator('#map-profile').focus()
    for (const [width, height] of [[320, 568], [430, 852], [844, 390], [1280, 800]]) {
      await page.setViewportSize({ width: width!, height: height! })
      const fit = await page.evaluate(() => {
        const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().toJSON()
        const profile = document.querySelector('.hub-header .world-identity')!
        const face = document.querySelector('#map-profile')!
        const style = getComputedStyle(face)
        return {
          profile: rect('.hub-header .world-identity'), face: rect('#map-profile'), pen: rect('.level-badge'),
          home: {left:0,top:0,bottom:innerHeight}, utilities: rect('.world-utilities'), tools: rect('#lobby-tools'), edit: rect('#lobby-edit'),
          overflow: getComputedStyle(profile).overflow, focus: parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset),
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        }
      })
      expect(fit.overflow).toBe('visible')
      expect(fit.face.left - fit.focus).toBeGreaterThanOrEqual(fit.home.left)
      expect(fit.face.top - fit.focus).toBeGreaterThanOrEqual(fit.home.top)
      expect(fit.pen.bottom + 2).toBeLessThan(fit.home.bottom)
      expect(fit.profile.right).toBeLessThanOrEqual(fit.utilities.left)
      expect(fit.tools.right + 8).toBeLessThanOrEqual(fit.edit.left)
      expect(fit.horizontalOverflow).toBe(false)
      await expect(page.locator('#start-game')).toBeInViewport()
      for (const button of await page.locator('#lobby-edit, #lobby-tools button, .world-utilities button').all()) {
        const box = (await button.boundingBox())!
        expect(box.width).toBeGreaterThanOrEqual(44)
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
    }
    await expect(page.locator('#lobby-edit .lobby-edit-label')).toHaveText('꾸미기')
    const hierarchy = await page.evaluate(() => {
      const style = (selector: string) => getComputedStyle(document.querySelector(selector)!)
      return {
        utilityShadow: style('.world-utilities button').boxShadow,
        utilityBorder: style('.world-utilities button').borderTopColor,
        gestureShadow: style('.lobby-gesture').boxShadow,
        gestureBorder: style('.lobby-gesture').borderTopWidth,
        editBorder: style('#lobby-edit').borderTopWidth,
      }
    })
    expect(hierarchy.utilityShadow).not.toBe('none')
    expect(hierarchy.utilityBorder).not.toBe('rgba(0, 0, 0, 0)')
    expect(hierarchy.gestureShadow).toBe('none')
    expect(hierarchy.gestureBorder).toBe('0px')
    expect(parseFloat(hierarchy.editBorder)).toBeGreaterThanOrEqual(1)
    await page.setViewportSize({ width: 430, height: 852 })
    await page.screenshot({ path: test.info().outputPath(`lobby-${skin}.png`) })
  }
})

test('localized customization captions fit beside the gesture group on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  for (const [lang, caption] of [['en', 'Customize'], ['ko', '꾸미기'], ['ja', '着せ替え'], ['zh-Hans', '装扮']]) {
    for (const skin of ['paper', 'jewel', 'glass']) {
      await page.evaluate(value => localStorage.setItem('chroma-match:lang', value), lang!)
      await page.goto(`/?seed=3&skin=${skin}`)
      await enterLobby(page)
      await expect(page.locator('#lobby-edit')).toHaveText(caption!)
      const boxes = await page.evaluate(() => ({
        tools: document.getElementById('lobby-tools')!.getBoundingClientRect().toJSON(),
        edit: document.getElementById('lobby-edit')!.getBoundingClientRect().toJSON(),
        stage: document.getElementById('lobby-stage')!.getBoundingClientRect().toJSON(),
      }))
      expect(boxes.tools.right + 8).toBeLessThanOrEqual(boxes.edit.left)
      expect(boxes.edit.right).toBeLessThanOrEqual(boxes.stage.right)
      expect(boxes.edit.height).toBeGreaterThanOrEqual(44)
      expect(boxes.edit.width).toBeGreaterThanOrEqual(44)
      await expect(page.locator('#start-game')).toBeInViewport()
    }
  }
})
