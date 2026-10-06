import { expect, test } from '@playwright/test'
import { enterLobby } from './boot.ts'

test.use({ hasTouch: true, viewport: { width: 430, height: 852 }, reducedMotion: 'reduce' })

test.beforeEach(async ({ page }) => {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.addInitScript(() => localStorage.setItem('chroma-match:lang', 'ko'))
  await page.goto('/?seed=3')
  await enterLobby(page)
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'ready')
})

test('phone profile owns the top row and destinations stay below the unobstructed character', async ({ page }) => {
  await page.locator('#map-name').evaluate(node => { node.textContent = '캐릭터를 꾸미는 아주 긴 플레이어 이름' })
  for (const [width, height] of [[320, 568], [390, 844], [430, 852], [720, 720], [844, 390], [1280, 800]]) {
    await page.setViewportSize({ width: width!, height: height! })
    await expect(page.locator('#start-game')).toBeInViewport()
    const boxes = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().toJSON()
      return { profile: rect('.hub-header .world-identity'), utilities: rect('.world-utilities'), stage: rect('.lobby-stage'), nav: rect('.lobby-nav'), play: rect('.lobby-play'), overflow: document.documentElement.scrollWidth > innerWidth }
    })
    expect(boxes.profile.right).toBeLessThanOrEqual(boxes.utilities.left)
    expect(boxes.stage.bottom).toBeLessThanOrEqual(boxes.nav.top)
    expect(boxes.nav.bottom).toBeLessThanOrEqual(boxes.play.top)
    expect(boxes.overflow).toBe(false)
    for (const button of await page.locator('.lobby-nav button, .world-utilities button').filter({visible:true}).all()) {
      const box = (await button.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
  }
  await expect(page.locator('#lobby-hint')).toHaveClass('sr-only')
  await expect(page.locator('#lobby-canvas')).toHaveAttribute('aria-describedby', 'lobby-hint')
  await page.setViewportSize({ width: 430, height: 852 })
  await page.screenshot({ path: test.info().outputPath('lobby-mobile.png') })
})

test('a diagonal touch rotates without scrolling or reload, matches right-arrow direction and releases cancellation', async ({ page }) => {
  const canvas = page.locator('#lobby-canvas')
  const css = await page.evaluate(() => ({
    root: getComputedStyle(document.documentElement).overscrollBehaviorY,
    rootOverflow: getComputedStyle(document.documentElement).overflowY,
    home: getComputedStyle(document.querySelector('.home')!).overscrollBehaviorY,
    touch: getComputedStyle(document.getElementById('lobby-canvas')!).touchAction,
  }))
  expect(css).toEqual({ root: 'none', rootOverflow: 'hidden', home: 'none', touch: 'none' })
  const read = () => canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL())
  await canvas.focus()
  await page.keyboard.press('Home')
  const front = await read()
  const box = (await canvas.boundingBox())!
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  const session = await page.context().newCDPSession(page)
  const initial = await page.evaluate(() => ({ time: performance.timeOrigin, scroll: document.querySelector('.home')!.scrollTop, avatar: localStorage.getItem('chroma-match:avatar') }))
  const point = (px: number, py: number) => [{ x: px, y: py, id: 1 }]
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(x, y) })
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(x + 50, y + 80) })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const right = await read()
  expect(await canvas.evaluate(node => getComputedStyle(node).outlineStyle)).toBe('none')
  expect(right).not.toBe(front)
  await page.keyboard.press('Home')
  expect(await canvas.evaluate(node => getComputedStyle(node).outlineStyle)).toBe('solid')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  expect(await read()).toBe(right)
  await page.keyboard.press('Home')
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(x, y) })
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(x - 50, y + 100) })
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  const left = await read()
  expect(left).not.toBe(front)
  expect(left).not.toBe(right)
  await page.keyboard.press('Home')
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(x, y) })
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(x + 50, y + 80) })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  expect(await read()).toBe(right)
  expect(await page.evaluate(() => ({ time: performance.timeOrigin, scroll: document.querySelector('.home')!.scrollTop, avatar: localStorage.getItem('chroma-match:avatar') }))).toEqual(initial)
  await session.detach()
  // Only the model consumes touch panning; other screens keep their scroll owners.
  await page.locator('#map-settings').click()
  await expect(page.locator('#sheet-settings')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#map-settings')).toBeFocused()
  await page.setViewportSize({ width: 844, height: 390 })
  await page.locator('#map-shop').click()
  await expect(page.locator('html')).not.toHaveClass(/lobby-open/)
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).not.toBe('hidden')
  await page.keyboard.press('End')
  await expect.poll(() => page.evaluate(() => document.scrollingElement!.scrollTop)).toBeGreaterThan(0)
  await page.keyboard.press('Home')
  await page.locator('#shop-back').click()
  await expect(page.locator('html')).toHaveClass(/lobby-open/)
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0)
})
