import { test, expect, type Locator, type Page } from '@playwright/test'

async function openGame(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('chroma-royale:preferences:v2', JSON.stringify({
    seed: 2026, randomRetry: false, hints: false, sound: false, calm: false,
  })))
  await page.goto('/?play=1&level=4')
  await expect(page.locator('html')).toHaveAttribute('data-press-feedback', 'ready')
  await expect(page.locator('#board')).toBeVisible()
}

async function hold(page: Page, button: Locator): Promise<void> {
  await button.scrollIntoViewIfNeeded()
  const box = (await button.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(button).toHaveAttribute('data-press-state', 'down')
}

for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }, { width: 430, height: 932 }, { width: 844, height: 390 }]) {
  test(`tool artwork remains circular and contained at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await openGame(page)
    const measurements = await page.locator('.tools .tool').evaluateAll(buttons => buttons.map(button => {
      const frame = button.getBoundingClientRect(), art = button.querySelector('img')!.getBoundingClientRect()
      return { width: frame.width, height: frame.height, contained: art.left >= frame.left && art.right <= frame.right && art.top >= frame.top && art.bottom <= frame.bottom }
    }))
    expect(measurements).toHaveLength(5)
    for (const value of measurements) {
      expect(Math.abs(value.width - value.height)).toBeLessThan(.1)
      expect(value.width).toBeGreaterThanOrEqual(44)
      expect(value.contained).toBe(true)
    }
  })
}

test('tool press has down travel and compression, then selects exactly once on release', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openGame(page)
  const button = page.locator('[data-tool="hammer"]')
  await hold(page, button)
  await expect.poll(async () => button.evaluate(element => getComputedStyle(element).translate)).toBe('0px 5px')
  expect(await button.evaluate(element => getComputedStyle(element).scale)).toBe('0.95 0.93')
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  await page.mouse.up()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(button).not.toHaveAttribute('data-press-state', /.+/)
  expect(await button.evaluate(element => getComputedStyle(element).scale)).toBe('1')
  await expect(page.locator('#moves')).toHaveText('25')
})

test('dynamic dialog controls and booster labels retain native checkbox and keyboard semantics', async ({ page }) => {
  await openGame(page)
  await page.locator('#settings-open').click()
  const booster = page.locator('#settings-boosters .booster-option').first()
  const input = booster.locator('input')
  await hold(page, booster)
  await expect(input).not.toBeChecked()
  await page.mouse.up()
  await expect(input).toBeChecked()
  await input.focus()
  await page.keyboard.down(' ')
  await expect(booster).toHaveAttribute('data-press-state', 'down')
  await page.keyboard.up(' ')
  await expect(input).not.toBeChecked()
  await expect(booster).not.toHaveAttribute('data-press-state', /.+/)
  const close = page.locator('#settings-dialog .close-button')
  await close.focus()
  await page.keyboard.down(' ')
  await expect(close).toHaveAttribute('data-press-state', 'down')
  await expect(page.locator('#settings-dialog')).toBeVisible()
  await page.keyboard.up(' ')
  await expect(page.locator('#settings-dialog')).not.toBeVisible()
  await expect(page.locator('[data-press-state="down"]')).toHaveCount(0)
})

test('cancelled, secondary and disabled presses leave no held visual state', async ({ page }) => {
  await openGame(page)
  const tool = page.locator('[data-tool="hammer"]')
  await hold(page, tool)
  await page.mouse.move(1, 1)
  await expect(tool).not.toHaveAttribute('data-press-state', /.+/)
  await page.mouse.up()
  await expect(tool).toHaveAttribute('aria-pressed', 'false')
  const box = (await tool.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down({ button: 'right' })
  await expect(tool).not.toHaveAttribute('data-press-state', /.+/)
  await page.mouse.up({ button: 'right' })
  await page.locator('#level-picker').click()
  const previous = page.locator('#levels-prev')
  await expect(previous).toBeDisabled()
  await previous.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0 })
  await expect(previous).not.toHaveAttribute('data-press-state', /.+/)
  await expect(page.locator('#board')).toHaveAttribute('data-turn', '0')
})

test('editor repaint transfers contact to the replacement cell without sticking', async ({ page }) => {
  await openGame(page)
  await page.locator('#editor-open').click()
  const cell = page.locator('#editor-grid [data-cell="0"]')
  await hold(page, cell)
  await expect(cell).toHaveAttribute('data-press-state', 'down')
  await expect(page.locator('#editor-feedback')).toHaveText('보드가 변경되었습니다')
  await page.mouse.up()
  await expect(cell).not.toHaveAttribute('data-press-state', /.+/)
  await page.locator('#editor-close').click()
  await expect(page.locator('[data-press-state="down"]')).toHaveCount(0)
})

test('home and late-mounted update controls share press feedback without shifting their anchor', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openGame(page)
  await page.locator('#game-home').click()
  const play = page.locator('#home-play')
  await hold(page, play)
  await expect(page.locator('.royale-home')).toBeVisible()
  await page.mouse.up()
  await expect(page.locator('#board')).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('royal-update-ready')))
  const update = page.locator('.update-button')
  await expect(update).toBeVisible()
  const before = (await update.boundingBox())!
  await hold(page, update)
  await expect.poll(async () => update.evaluate(element => getComputedStyle(element).translate)).toBe('-50% 3px')
  const down = (await update.boundingBox())!
  expect(Math.abs(down.x + down.width / 2 - before.x - before.width / 2)).toBeLessThan(1)
  // Cancel before release so this visual check does not apply/reload a service worker.
  await page.mouse.move(1, 1)
  await page.mouse.up()
  await expect(update).not.toHaveAttribute('data-press-state', /.+/)
  await expect(page.locator('#board')).toHaveAttribute('data-turn', '0')
})

test('reduced motion keeps a clear static press without spring compression', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openGame(page)
  const tool = page.locator('[data-tool="hammer"]')
  const resting = await tool.evaluate(element => getComputedStyle(element).boxShadow)
  await hold(page, tool)
  const pressed = await tool.evaluate(element => {
    const style = getComputedStyle(element)
    return { translate: style.translate, scale: style.scale, shadow: style.boxShadow }
  })
  expect(pressed.translate).toBe('0px 2px')
  expect(pressed.scale).toBe('1')
  expect(pressed.shadow).not.toBe(resting)
  await page.mouse.up()
  await expect(tool).not.toHaveAttribute('data-press-state', /.+/)
})
