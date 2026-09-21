import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.goto('/?seed=3')
  if (await page.locator('#overlay-action').isVisible()) await page.locator('#overlay-action').click()
  await page.locator('#start-game').click()
  await page.locator('#loadout-start').click()
  await page.waitForFunction(() => window.chroma.game.phaseKind === 'idle')
})

test('fold, unfold, rotate and split-window preserve the exact run and touch targets', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const state = () => page.evaluate(() => {
    const g = window.chroma.game
    return JSON.stringify({ grid: g.grid, moves: g.moves, score: g.score, goal: g.goal })
  })
  const before = await state()
  for (const [width, height] of [[390, 844], [720, 720], [900, 720], [844, 390], [320, 568], [1280, 800], [480, 800]]) {
    await page.setViewportSize({ width: width!, height: height! })
    await expect.poll(() => page.locator('html').evaluate(e => e.style.getPropertyValue('--play-width'))).toBe(`${width}px`)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect.poll(() => page.evaluate(() => window.chroma.renderer.cellSize)).toBeGreaterThanOrEqual(44)
    expect(await state()).toBe(before)
    await expect(page.locator('#rotate')).not.toBeVisible()
    const columns = await page.locator('.game-hud > div').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().width))
    expect(Math.max(...columns) - Math.min(...columns)).toBeLessThan(1)
    await page.locator('#pause').scrollIntoViewIfNeeded()
    await expect(page.locator('#pause')).toBeInViewport()
    for (const button of await page.locator('#items button').all()) {
      const box = (await button.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
  }
  await page.locator('#board').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('#board-status')).not.toBeEmpty()
  expect(errors).toEqual([])
})

test('resize during pointer gesture cancels old coordinates; subsequent swap works', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const move = await page.evaluate(() => window.chroma.best()!)
  const point = await page.evaluate(i => window.chroma.renderer.centreOf(i), move.a)
  const box = (await page.locator('#board').boundingBox())!
  await page.mouse.move(box.x + point.x, box.y + point.y)
  await page.mouse.down()
  await page.setViewportSize({ width: 900, height: 720 })
  await page.mouse.move(600, 300)
  await page.mouse.up()
  expect(await page.evaluate(() => window.chroma.game.moves)).toBe(25)
  for (const cell of [move.a, move.b]) {
    const pos = await page.evaluate(i => window.chroma.renderer.centreOf(i), cell)
    const current = (await page.locator('#board').boundingBox())!
    await page.mouse.click(current.x + pos.x, current.y + pos.y)
  }
  await page.waitForFunction(() => window.chroma.game.phaseKind === 'idle')
  expect(await page.evaluate(() => window.chroma.game.moves)).toBe(24)
  // Replay recreates render identities and transient flash timers. Compare
  // the persistent puzzle state, not those deliberately ephemeral fields.
  const puzzle = () => page.evaluate(() => {
    const g = window.chroma.game
    return { grid: g.grid.map(gem => gem && [gem.kind, gem.power]),
      moves: g.moves, score: g.score, goal: g.goal, level: g.level }
  })
  const after = await puzzle()
  await page.locator('#pause').click()
  await page.locator('#paused-keep').click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('#continue-run').click()
  await expect(page.locator('#screen-game')).toBeVisible()
  expect(await page.evaluate(() => window.chroma.game.moves)).toBe(24)
  expect(await puzzle()).toEqual(after)
})

test('reported dual-screen hinge confines gameplay to one usable pane', async ({ page }) => {
  await page.setViewportSize({ width: 840, height: 720 })
  await page.evaluate(() => {
    Object.defineProperty(window, 'viewport', { configurable: true, value: { segments: [
      { left: 0, top: 0, width: 400, height: 720 },
      { left: 440, top: 0, width: 400, height: 720 },
    ] } })
    window.dispatchEvent(new Event('resize'))
  })
  await expect(page.locator('html')).toHaveAttribute('data-play-layout', 'stack')
  const app = (await page.locator('.app').boundingBox())!
  expect(app.x).toBe(0)
  expect(app.width).toBe(400)
  const board = (await page.locator('#board').boundingBox())!
  expect(board.x + board.width).toBeLessThanOrEqual(400)
})
