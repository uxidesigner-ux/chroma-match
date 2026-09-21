import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { Power } from '../../src/game/types.ts'
import { enterLobby } from './boot.ts'

async function clickCell(page: Page, cell: number) {
  const point = await page.evaluate(cell => window.chroma.renderer.centreOf(cell), cell)
  const box = (await page.locator('#board').boundingBox())!
  await page.mouse.click(box.x + point.x, box.y + point.y)
}

async function settle(page: Page) {
  await page.waitForFunction(() => window.chroma.game.phaseKind === 'idle')
}

test.beforeEach(async ({ page }) => {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.addInitScript(() => localStorage.setItem('chroma-match:lang', 'en'))
  await page.goto('/?seed=3')
  await enterLobby(page)
  await page.locator('#start-game').click()
  await page.locator('#loadout-start').click()
  // Preserve the released v2 seeded fixture. New v3 squares have their own suite.
  await page.evaluate(() => window.chroma.game.restart(3, 2))
})

test('earned prism + bomb: pointer selection previews without layout shift, fires once and verifies', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  // This seeded first move naturally earns the two powers; no board injection.
  await clickCell(page, 34)
  await clickCell(page, 35)
  await settle(page)
  expect(await page.evaluate(() => window.chroma.game.score)).toBe(1150)
  const before = await page.locator('#board').boundingBox()
  await clickCell(page, 45)
  await expect(page.locator('#combo-word')).toHaveText('Dotted partner → fuse · 1 move')
  expect(await page.evaluate(() => window.chroma.game.fusionPartners)).toContain(46)
  expect(await page.locator('#board').boundingBox()).toEqual(before)
  await clickCell(page, 46)
  await expect(page.locator('#combo')).toHaveAttribute('data-fusion', 'prismBomb')
  await expect(page.locator('#combo-word')).toHaveText('Prism blast!')
  await settle(page)
  await expect(page.locator('#overlay-victory')).toBeVisible()
  const result = await page.evaluate(async () => {
    const { recordOf, verifyRun } = await import('/src/game/replay.ts')
    const game = window.chroma.game
    const record = recordOf(game)
    return { moves: game.moves, actions: game.log.length, score: game.score, record, verdict: verifyRun(record, game.geom) }
  })
  expect(result.moves).toBe(23)
  expect(result.actions).toBe(2)
  expect(result.score).toBe(2290)
  expect(result.record.moves).toBe('zy3s50')
  expect(result.verdict.claimMatches).toBe(true)
  expect(errors).toEqual([])
})

const recipes: [Power, Power, string][] = [
  ['rowClear', 'colClear', 'cross'], ['rowClear', 'bomb', 'wideCross'], ['bomb', 'bomb', 'megaBomb'],
  ['rainbow', 'rowClear', 'prismStripe'], ['rainbow', 'bomb', 'prismBomb'], ['rainbow', 'rainbow', 'prismPair'],
]

for (const [a, b, name] of recipes) {
  test(`${name} is reachable with keyboard and reduced motion on a small screen`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    // Controlled renderer fixture; real earned/replayed gameplay is covered above.
    await page.evaluate(({ a, b }) => {
      const g = window.chroma.game
      g.grid.forEach((gem, i) => {
        if (gem) { gem.kind = (g.geom.colOf(i) + g.geom.rowOf(i) * 2) % 5; gem.power = 'none' }
      })
      g.grid[0]!.power = a
      g.grid[1]!.power = b
    }, { a, b })
    const board = page.locator('#board')
    await board.focus()
    await page.keyboard.press('ArrowLeft') // Clamp at the edge without wrapping.
    await page.keyboard.press('Enter')
    await expect(page.locator('#board-status')).toContainText('Selected')
    await expect(page.locator('#combo-word')).toContainText('Dotted partner')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await expect(page.locator('#combo')).toHaveAttribute('data-fusion', name)
    expect(await page.locator('#combo').evaluate(e => getComputedStyle(e).animationName)).toBe('none')
    await settle(page)
    expect(await page.evaluate(() => window.chroma.game.moves)).toBe(24)
    expect(await page.evaluate(() => window.chroma.effects.counts.particles)).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    // The board must not trap keyboard users.
    await page.keyboard.press('Tab')
    await expect(board).not.toBeFocused()
  })
}

test('fusion run survives the real keep/reload/continue UI', async ({ page }) => {
  await clickCell(page, 34)
  await clickCell(page, 35)
  await settle(page)
  await page.locator('#pause').click()
  await page.locator('#paused-keep').click()
  const saved = await page.evaluate(() => localStorage.getItem('chroma-match:suspended'))
  expect(JSON.parse(saved!).record.moves).toBe('zy3s')
  await page.reload()
  await enterLobby(page)
  await page.locator('#continue-run').click()
  await expect(page.locator('#board')).toBeVisible()
  expect(await page.evaluate(() => window.chroma.game.rules)).toBe(2)
  expect(await page.evaluate(() => window.chroma.game.score)).toBe(1150)
  await clickCell(page, 45)
  await clickCell(page, 46)
  await expect(page.locator('#combo')).toHaveAttribute('data-fusion', 'prismBomb')
  await settle(page)
  expect(await page.evaluate(() => window.chroma.game.score)).toBe(2290)
})

test('legacy saved runs keep original rules and the next new run opts into fusion', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('chroma-match:suspended', JSON.stringify({
      record: { seed: 3, moves: '3s', score: 1150, level: 1, board: { cols: 6, rows: 9, kinds: 5 } },
      score: 1150, level: 1, at: Date.now(),
    }))
  })
  await page.reload()
  await enterLobby(page)
  await page.locator('#continue-run').click()
  await expect(page.locator('#board')).toBeVisible()
  expect(await page.evaluate(() => window.chroma.game.rules)).toBe(1)
  await clickCell(page, 45)
  expect(await page.evaluate(() => window.chroma.game.fusionPartners)).toEqual([])
  await page.locator('#pause').click()
  await expect(page.locator('#seed')).toContainText('Original rules')
  await page.locator('#paused-keep').click()
  await page.locator('#start-game').click()
  await page.locator('#overlay-action').click() // Explicitly replace the saved run.
  await page.locator('#loadout-start').click()
  expect(await page.evaluate(() => window.chroma.game.rules)).toBe(3)
})
