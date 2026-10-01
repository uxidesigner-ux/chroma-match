import { expect, test } from '@playwright/test'
import { enterLobby } from './boot.ts'

test.beforeEach(async ({ page }) => {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.addInitScript(() => localStorage.setItem('chroma-match:lang', 'ko'))
})

test('3D loading never blocks a player who chooses to enter now', async ({ page }) => {
  let release!: () => void
  const loading = new Promise<void>(resolve => { release = resolve })
  await page.route('**/seed-san.vrm', async route => { await loading; await route.abort() })
  await page.goto('/')
  await page.locator('#splash-skip').click()
  await enterLobby(page)
  await page.locator('#start-game').click()
  await expect(page.locator('#loadout-body')).toContainText('이동 횟수를 쓰지 않아요')
  await page.locator('#loadout-start').click()
  await expect(page.locator('#screen-game')).toBeVisible()
  await expect(page.locator('#goal-text')).toHaveText('목표까지')
  await expect(page.locator('#goal-unit')).toHaveText('점 남음')
  expect(await page.evaluate(() => window.chroma.game.moves)).toBe(25)
  release()
})

test('settings and nested rules own focus, Escape closes only the top layer', async ({ page }) => {
  await page.goto('/')
  await enterLobby(page)
  await page.locator('#open-settings').click()
  await expect(page.getByRole('radio', { name: '한국어', exact: true })).toBeFocused()
  await expect(page.locator('main')).toHaveAttribute('inert', '')
  for (let i = 0; i < 22; i++) {
    await page.keyboard.press(i % 3 ? 'Tab' : 'Shift+Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('#sheet-settings'))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(page.locator('#sheet-settings')).toBeHidden()
  await expect(page.locator('#open-settings')).toBeFocused()
  await page.locator('#start-game').click()
  await page.locator('#loadout-start').click()
  await page.locator('#pause').click()
  await page.locator('#paused [data-action="how-to"]').click()
  await expect(page.locator('#help')).toBeVisible()
  await expect(page.locator('#help')).not.toHaveAttribute('inert', '')
  await expect(page.locator('#help-title')).toBeFocused()
  await page.locator('#help-details-title').click()
  await expect(page.locator('#help details')).toHaveAttribute('open', '')
  await expect(page.locator('.rule-example')).toHaveCount(3)
  await page.keyboard.press('Escape')
  await expect(page.locator('#help')).toBeHidden()
  await expect(page.locator('#paused')).toBeVisible()
  await expect(page.locator('#paused [data-action="how-to"]')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('#paused')).toBeHidden()
  await expect(page.locator('#pause')).toBeFocused()
})

test('short screens keep tools visible and expose every row without shrinking gems', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/?seed=3')
  await enterLobby(page)
  await page.locator('#start-game').click()
  await page.locator('#loadout-start').click()
  await expect(page.locator('#pause')).toBeInViewport()
  await expect(page.locator('#board-scroll-down')).toBeVisible()
  const state = await page.evaluate(() => JSON.stringify(window.chroma.game.grid))
  await page.locator('#board-scroll-down').click()
  await expect.poll(() => page.locator('.game .stage').evaluate(e => e.scrollTop)).toBeGreaterThan(0)
  await page.locator('#board').focus()
  for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowDown')
  await expect.poll(() => page.evaluate(() => {
    const stage = document.querySelector('.game .stage')!.getBoundingClientRect()
    const board = document.getElementById('board')!.getBoundingClientRect()
    const point = window.chroma.renderer.centreOf(48)
    const half = window.chroma.renderer.cellSize / 2
    return board.top + point.y - half >= stage.top && board.top + point.y + half <= stage.bottom
  })).toBe(true)
  await expect(page.locator('#pause')).toBeInViewport()
  expect(await page.evaluate(() => JSON.stringify(window.chroma.game.grid))).toBe(state)
  expect(await page.evaluate(() => window.chroma.renderer.cellSize)).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: test.info().outputPath('short-game.png') })
})

test('editor exposes every category, real thumbnails and persistent save confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await enterLobby(page)
  await page.locator('#lobby-edit').click()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
  const boxes = await page.locator('.studio-tab').evaluateAll(nodes => nodes.map(node => {
    const r = node.getBoundingClientRect()
    return { x: r.x, right: r.right, height: r.height }
  }))
  expect(boxes).toHaveLength(7)
  for (const box of boxes) { expect(box.x).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(390); expect(box.height).toBeGreaterThanOrEqual(44) }
  await page.locator('.studio-look .studio-thumbnail').first().waitFor({ state: 'visible' })
  await expect(page.locator('.studio-look .studio-thumbnail').first()).toHaveAttribute('data-avatar-state', 'ready')
  await page.getByRole('tab', { name: '헤어', exact: true }).click()
  await page.getByRole('button', { name: '긴 머리', exact: true }).click()
  await page.locator('.studio-apply').click()
  await expect(page.locator('.studio-status')).toHaveText('이 기기에 저장했어요.')
  await expect(page.locator('.studio-status')).toBeInViewport()
  await expect(page.locator('.studio-status')).toHaveAttribute('data-tone', 'success')
  await page.screenshot({ path: test.info().outputPath('editor-saved.png') })
  await page.getByRole('tab', { name: '표정', exact: true }).click()
  await page.getByRole('button', { name: '밝게', exact: true }).click()
  await expect(page.locator('.studio-status')).toHaveAttribute('data-tone', 'info')
})

test('game reactions swap cached expressions and remain still with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?seed=3')
  await enterLobby(page)
  await page.locator('#start-game').click()
  await page.locator('#loadout-start').click()
  await page.waitForFunction(() => window.chroma.game.phaseKind === 'idle')
  const requests: string[] = []
  page.on('request', request => { if (request.url().includes('seed-san.vrm')) requests.push(request.url()) })
  await page.evaluate(() => { const move = window.chroma.best()!; window.chroma.game.drag(move.a, move.b) })
  await expect(page.locator('#hud-character')).toHaveAttribute('data-expression', /happy|surprised|relaxed/)
  await expect(page.locator('#hud-avatar')).toHaveAttribute('data-avatar-state', 'ready')
  expect(await page.locator('.hud-face').evaluate(e => e.getAnimations().length)).toBe(0)
  await expect(page.locator('#hud-character')).toHaveAttribute('data-reaction', 'ready')
  expect(requests).toEqual([])
})

test('settings have touch-sized choices and keyboard theme selection keeps visible focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await enterLobby(page)
  await page.locator('#open-settings').click()
  const sizes = await page.getByRole('radio').evaluateAll(nodes => nodes.map(node => {
    const r = node.getBoundingClientRect()
    return { width: r.width, height: r.height }
  }))
  for (const size of sizes) {
    expect(size.width).toBeGreaterThanOrEqual(44)
    expect(size.height).toBeGreaterThanOrEqual(44)
  }
  await page.getByRole('radio', { name: 'Jewel', exact: true }).press('End')
  await expect(page.getByRole('radio', { name: 'Paper', exact: true })).toBeFocused()
  await expect(page.getByRole('radio', { name: 'Paper', exact: true })).toHaveAttribute('aria-checked', 'true')
  expect(await page.getByRole('radio', { name: 'Paper', exact: true }).evaluate(node => {
    const css = getComputedStyle(node)
    return { outline: css.outlineColor, ink: getComputedStyle(document.body).getPropertyValue('--text').trim() }
  })).toEqual({ outline: 'rgb(36, 30, 22)', ink: '#241e16' })
  await expect(page.locator('#settings-done')).toBeInViewport()
})
