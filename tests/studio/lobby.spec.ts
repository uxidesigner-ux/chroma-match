import { expect, test } from '@playwright/test'
import { enterLobby } from './boot.ts'

test.beforeEach(async ({ page }) => {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.addInitScript(() => localStorage.setItem('chroma-match:lang', 'ko'))
  await page.goto('/?seed=3')
  await enterLobby(page)
})

test('lobby rotates with keys and gestures, releases 3D on play and returns safely', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'ready')
  const canvas = page.locator('#lobby-canvas')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const before = await canvas.evaluate(e => (e as HTMLCanvasElement).toDataURL())
  await canvas.focus(); await page.keyboard.press('ArrowRight')
  const after = await canvas.evaluate(e => (e as HTMLCanvasElement).toDataURL())
  expect(before).not.toBe(after)
  await page.keyboard.press('Home')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  for (const [label, key] of [['손인사', 'wave'], ['응원', 'cheer'], ['포즈', 'pose']]) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await expect(page.locator('#lobby-stage')).toHaveAttribute('data-gesture', key!)
  }
  await expect(page.getByRole('button', { name: '설정', exact: true })).toHaveText('⚙')
  await expect(page.getByRole('button', { name: '게임 방법', exact: true })).toHaveText('?')
  await expect(page.locator('#start-game')).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.locator('#start-game').click(); await page.locator('#loadout-start').click()
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'idle')
  await expect(page.locator('#hud-avatar')).toHaveAttribute('data-avatar-state', 'ready')
  await expect(page.locator('#score, #best')).toHaveCount(0)
  const widths = await page.locator('.game-hud > div').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().width))
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1)
  for (const button of await page.locator('#items button').all()) {
    const size = (await button.boundingBox())!
    expect(size.width).toBe(size.height)
    expect(size.width).toBeGreaterThanOrEqual(44)
  }
  await page.evaluate(() => {
    const g = window.chroma.game
    const move = window.chroma.best()!
    g.drag(move.a, move.b)
  })
  await expect(page.locator('#hud-character')).toHaveAttribute('data-sequence', /[1-9]/)
  await page.waitForFunction(() => window.chroma.game.phaseKind === 'idle')
  await page.locator('#pause').click(); await page.locator('#paused-keep').click()
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'ready')
  await page.locator('#continue-run').click()
  expect(await page.evaluate(() => window.chroma.game.rules)).toBe(3)
  expect(errors).toEqual([])
})

test('square-only pointer swap, goal countdown and reduced-motion avatar feedback', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.locator('#start-game').click(); await page.locator('#loadout-start').click()
  await page.evaluate(() => {
    const g = window.chroma.game
    g.grid.forEach((gem, i) => { if (gem) { gem.kind = (g.geom.colOf(i) + g.geom.rowOf(i) * 2) % 4; gem.power = 'none' } })
    ;[7, 8, 13, 15].forEach(i => { g.grid[i]!.kind = 4 })
    g.goal = { kind: 'colour', colour: 4, need: 33 }
  })
  await expect(page.locator('#goal-remaining')).toHaveText('33')
  for (const cell of [14, 15]) {
    const point = await page.evaluate(i => window.chroma.renderer.centreOf(i), cell)
    const box = (await page.locator('#board').boundingBox())!
    await page.mouse.click(box.x + point.x, box.y + point.y)
  }
  await expect(page.locator('#hud-character')).toHaveAttribute('data-sequence', /[1-9]/)
  await page.waitForFunction(() => window.chroma.game.phaseKind === 'idle')
  expect(await page.evaluate(() => window.chroma.game.moves)).toBe(24)
  expect(Number(await page.locator('#goal-remaining').textContent())).toBeLessThan(33)
  expect(await page.locator('.hud-face').evaluate(e => e.getAnimations().length)).toBe(0)
  expect(await page.evaluate(() => window.chroma.game.grid.some(g => g?.power === 'bomb'))).toBe(true)
})

test('failed lobby remains playable and retry recovers without resetting profile', async ({ page }) => {
  await page.route('**/seed-san.vrm', route => route.abort())
  await page.reload()
  await expect(page.locator('#splash')).toBeHidden({ timeout: 60000 })
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'error')
  await expect(page.locator('#start-game')).toBeEnabled()
  await page.unroute('**/seed-san.vrm')
  await page.getByRole('button', { name: '3D 다시 시도' }).click()
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'ready')
  await page.locator('#lobby-edit').click()
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'idle')
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
})

test('lobby chrome puts equal nav on top, coins under the name, and play actions in one row', async ({ page }) => {
  await expect(page.locator('#splash')).toBeHidden()
  await expect(page.locator('#splash-title')).toHaveText('Chroma Match')
  await expect(page.locator('#screen-home h1')).toHaveCount(0)
  const nav = await page.locator('.home .quick-btn').evaluateAll(nodes =>
    nodes.map(node => {
      const box = node.getBoundingClientRect()
      return { width: box.width, height: box.height, top: box.top }
    }),
  )
  expect(nav).toHaveLength(3)
  expect(Math.max(...nav.map(b => b.width)) - Math.min(...nav.map(b => b.width))).toBeLessThan(1)
  expect(Math.max(...nav.map(b => b.height)) - Math.min(...nav.map(b => b.height))).toBeLessThan(1)
  const stage = (await page.locator('#lobby-stage').boundingBox())!
  const navBox = (await page.locator('.home .quick').boundingBox())!
  const play = (await page.locator('.lobby-play').boundingBox())!
  expect(navBox.y).toBeLessThan(stage.y)
  expect(play.y).toBeGreaterThan(stage.y + stage.height - 8)
  const name = (await page.locator('#profile-name').boundingBox())!
  const coins = (await page.locator('.profile-wallet').boundingBox())!
  expect(coins.y).toBeGreaterThan(name.y)
  await page.locator('#start-game').click()
  await page.locator('#loadout-start').click()
  await expect(page.locator('#screen-game')).toBeVisible()
  await page.waitForFunction(() => window.chroma.game.phaseKind === 'idle')
  await page.evaluate(() => {
    const g = window.chroma.game
    const move = window.chroma.best()!
    g.drag(move.a, move.b)
  })
  await page.waitForFunction(() => window.chroma.game.phaseKind === 'idle')
  await page.locator('#pause').click()
  await page.locator('#paused-keep').click()
  await expect(page.locator('#continue-run')).toBeVisible()
  const continueBox = (await page.locator('#continue-run').boundingBox())!
  const startBox = (await page.locator('#start-game').boundingBox())!
  expect(Math.abs(continueBox.y - startBox.y)).toBeLessThan(2)
  expect(Math.abs(continueBox.height - startBox.height)).toBeLessThan(2)
  expect(startBox.x).toBeGreaterThan(continueBox.x + continueBox.width - 1)
})
