import { expect, test } from '@playwright/test'

// This suite explicitly exercises the preserved Character/free-play destination.
// Fresh-map entry and regional campaign flows are covered in world-map.spec.ts.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('chroma-match:destination', 'character'))
})

test.use({ reducedMotion: 'no-preference', deviceScaleFactor: 3 })

for (const [width, height] of [[320, 568], [568, 320]]) test(`production scrolled contact and live score ink stay stable at ${width}×${height}/DPR3`, async ({ page, context }, info) => {
  await page.setViewportSize({ width: width!, height: height! })
  await context.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com|seed-san\.vrm/, route => route.abort())
  await page.addInitScript(() => localStorage.setItem('chroma-match:lang', 'en'))
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.goto('./?seed=i')
  await expect(page.locator('#splash')).toBeHidden({ timeout: 60000 })
  if (await page.locator('#overlay-action').isVisible()) await page.locator('#overlay-action').click()
  await page.locator('#start-game').click(); await page.locator('[data-load="hammer"]').click()
  await page.locator('#loadout-start').click(); await expect(page.locator('#board')).toBeVisible()
  expect(await page.evaluate(() => 'chroma' in window)).toBe(false)
  await page.evaluate(() => {
    const canvas = document.getElementById('board') as HTMLCanvasElement, ctx = canvas.getContext('2d')!
    const stage = document.querySelector<HTMLElement>('.game .stage')!
    stage.scrollTop = 80
    const ink: { visible: boolean; text: string }[] = []
    Object.assign(window, { releaseInk: ink })
    const stroke = ctx.strokeText
    ctx.strokeText = function(text, x, y, ...args) {
      const m = this.getTransform(), t = this.measureText(text)
      const b = canvas.getBoundingClientRect(), s = stage.getBoundingClientRect()
      // Use the actual backing/CSS ratio: renderer deliberately caps DPR at 2.5.
      const sx = canvas.width / b.width, sy = canvas.height / b.height
      const left = b.left + (m.e + (x - t.actualBoundingBoxLeft - this.lineWidth / 2) * m.a) / sx
      const right = b.left + (m.e + (x + t.actualBoundingBoxRight + this.lineWidth / 2) * m.a) / sx
      const top = b.top + (m.f + (y - t.actualBoundingBoxAscent - this.lineWidth / 2) * m.d) / sy
      const bottom = b.top + (m.f + (y + t.actualBoundingBoxDescent + this.lineWidth / 2) * m.d) / sy
      ink.push({ text, visible: left >= Math.max(b.left, s.left) && right <= Math.min(b.right, s.right)
        && top >= Math.max(b.top, s.top) && bottom <= Math.min(b.bottom, s.bottom) })
      return stroke.call(this, text, x, y, ...args)
    }
  })
  await page.locator('[data-item="hammer"]').click()
  const before = (await page.locator('#board').boundingBox())!, stage = (await page.locator('.game .stage').boundingBox())!
  await page.mouse.move(before.x + before.width / 2, stage.y + 6); await page.mouse.down()
  expect(await page.locator('#board').boundingBox()).toEqual(before)
  await page.mouse.up()
  await expect(page.locator('[data-count="hammer"]')).toHaveText('3')
  await expect.poll(() => page.evaluate(() => (window as unknown as { releaseInk: unknown[] }).releaseInk.length)).toBeGreaterThan(0)
  const ink = await page.evaluate(() => (window as unknown as { releaseInk: { visible: boolean; text: string }[] }).releaseInk)
  expect(ink.every(t => t.visible), JSON.stringify(ink)).toBe(true)
  expect(await page.locator('#board').boundingBox()).toEqual(before)
  await expect(page.locator('#moves')).toHaveText('25')
  await page.screenshot({ path: info.outputPath('scrolled-item-feedback.png') })
  await page.locator('#pause').click(); await expect(page.locator('#paused-resume')).toBeFocused()
  await page.keyboard.press('Escape'); await expect(page.locator('#pause')).toBeFocused()
  await page.locator('#pause').click(); await page.locator('#paused-end').click()
  await page.locator('#overlay-action').click()
  await expect(page.locator('#moves')).toHaveText('25')
  expect(await page.locator('.game .stage').evaluate(e => e.scrollTop)).toBe(0)
  await page.locator('#board').focus(); await page.keyboard.press('ArrowRight')
  await expect(page.locator('#board-status')).toContainText('Row 1, column 2')
  expect(errors).toEqual([])
})
