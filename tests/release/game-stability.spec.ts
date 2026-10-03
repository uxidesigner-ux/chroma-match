import { expect, test } from '@playwright/test'

test('production game keeps a real top-row chain, fixed targets and reachable tools across folds', async ({ page, context }, info) => {
  await context.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com|seed-san\.vrm/, route => route.abort())
  await page.addInitScript(() => localStorage.setItem('chroma-match:lang', 'en'))
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.goto('./?seed=i')
  await expect(page.locator('#splash')).toBeHidden({ timeout: 60000 })
  if (await page.locator('#overlay-action').isVisible()) await page.locator('#overlay-action').click()
  await page.locator('#start-game').click(); await page.locator('#loadout-start').click()
  // A naturally legal v3 move for seed 18, independently replayed in the unit
  // engine: 16 → 22 earns a two-chain and 210 points. No production debug hook.
  await page.locator('#board').focus()
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowDown')
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter')
  await expect(page.locator('#combo')).toBeVisible()
  const badge = (await page.locator('#combo').boundingBox())!, lane = (await page.locator('.game-feedback').boundingBox())!
  expect(badge.y).toBeGreaterThanOrEqual(lane.y)
  expect(badge.y + badge.height).toBeLessThanOrEqual(lane.y + lane.height)
  await page.screenshot({ path: info.outputPath('real-chain.png') })
  await expect(page.locator('#moves')).toHaveText('24')
  await expect(page.locator('#goal-remaining')).toHaveText('1,590')
  await expect(page.locator('#combo')).toBeHidden()
  for (const [width, height] of [[320, 568], [390, 844], [568, 320], [844, 390], [720, 720], [1280, 800]]) {
    await page.setViewportSize({ width: width!, height: height! })
    await expect.poll(() => page.locator('html').evaluate(e => e.style.getPropertyValue('--play-width'))).toBe(`${width}px`)
    await expect(page.locator('#pause')).toBeInViewport()
    await expect(page.locator('#moves')).toHaveText('24')
    await expect(page.locator('#goal-remaining')).toHaveText('1,590')
    expect(await page.locator('#items button:visible').evaluateAll(nodes => nodes.every(e => {
      const r = e.getBoundingClientRect()
      return r.width >= 44 && r.height >= 44 && r.x >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
    }))).toBe(true)
    await page.screenshot({ path: info.outputPath(`game-${width}x${height}.png`) })
  }
  await page.locator('#pause').click()
  await expect(page.locator('#paused-resume')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('#pause')).toBeFocused()
  expect(errors).toEqual([])
})
