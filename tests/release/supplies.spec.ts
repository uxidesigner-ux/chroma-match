import { expect, test, type Page } from '@playwright/test'

// This suite explicitly exercises the preserved Character/free-play destination.
// Fresh-map entry and regional campaign flows are covered in world-map.spec.ts.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('chroma-match:destination', 'character'))
})
import { Game } from '../../src/game/game.ts'
import { BOOSTER_LIMIT, recordOf, verifyRun } from '../../src/game/replay.ts'
import { BOARD } from '../../src/game/types.ts'
import { readPlayer } from './player-helper.ts'

async function prepare(page: Page, stash = { hammer: 0, rocket: 0, bomb: 0 }) {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com|seed-san\.vrm/, route => route.abort())
  await page.addInitScript(stash => {
    if (sessionStorage.getItem('supplies-fixture')) return
    sessionStorage.setItem('supplies-fixture', '1')
    localStorage.setItem('chroma-match:granted', '1')
    localStorage.setItem('chroma-match:stash', JSON.stringify(stash))
    localStorage.setItem('chroma-match:lang', 'en')
    localStorage.setItem('chroma.skin', 'paper')
  }, stash)
  await page.goto('./?seed=i')
  await expect(page.locator('#splash')).toBeHidden({ timeout: 60000 })
  if (await page.locator('#overlay-action').isVisible()) await page.locator('#overlay-action').click()
}
async function checkStock(page: Page, counts: number[]) {
  for (const [index, item] of ['hammer', 'rocket', 'bomb'].entries()) {
    await expect(page.locator(`[data-count="${item}"]`)).toHaveText(String(counts[index]))
    if (counts[index]! > 0) await expect(page.locator(`[data-item="${item}"]`)).toBeEnabled()
    else await expect(page.locator(`[data-item="${item}"]`)).toBeDisabled()
  }
}

test('production v9 five-tool empty stash starts fully supplied; keyboard use and reload never refill a spent item', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await prepare(page)
  await page.locator('#start-game').click()
  await expect(page.locator('#loadout-supply')).toContainText('3 hammers, 3 rockets, 3 bombs, 3 bows and 3 shuffles')
  await expect(page.locator('#loadout-empty')).toBeVisible()
  await expect(page.locator('#loadout-start')).toBeFocused()
  await page.keyboard.press('Enter')
  expect(await page.evaluate(() => 'chroma' in window)).toBe(false)
  await checkStock(page, [3, 3, 3])
  await page.screenshot({ path: info.outputPath('all-items-ready.png') })
  const before = await page.locator('#board').boundingBox()
  await page.locator('[data-item="hammer"]').focus(); await page.keyboard.press('Enter')
  await expect(page.locator('[data-item="hammer"]')).toHaveAttribute('aria-pressed', 'true')
  await page.locator('#board').focus(); await page.keyboard.press('Enter')
  await checkStock(page, [2, 3, 3]); await expect(page.locator('#moves')).toHaveText('25')
  expect(await page.locator('#board').boundingBox()).toEqual(before)
  await expect(page.locator('#board')).toHaveAttribute('aria-busy','false')
  await page.locator('[data-item="shuffle"]').click()
  await expect(page.locator('[data-count="shuffle"]')).toHaveText('2')
  await expect(page.locator('#board')).toHaveAttribute('aria-busy','false')
  await page.locator('[data-item="bow"]').click()
  await page.locator('#board').focus(); await page.keyboard.press('Enter')
  await expect(page.locator('[data-count="bow"]')).toHaveText('2')
  await expect(page.locator('#board')).toHaveAttribute('aria-busy','false')
  await expect(page.locator('#moves')).toHaveText('25')
  await page.locator('#pause').click(); await page.locator('#paused-keep').click()
  const record = await page.evaluate(() => JSON.parse(localStorage.getItem('chroma-match:suspended')!).record)
  expect(record.moves.startsWith('zr')).toBe(true)
  expect(verifyRun(record, BOARD).claimMatches).toBe(true)
  await page.reload(); await expect(page.locator('#splash')).toBeHidden({ timeout: 60000 })
  await page.locator('#continue-run').click(); await checkStock(page, [2, 3, 3])
  await expect(page.locator('[data-count="bow"]')).toHaveText('2')
  await expect(page.locator('[data-count="shuffle"]')).toHaveText('2')
  await page.locator('#pause').click(); await page.locator('#paused-keep').click()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('chroma-match:suspended')!).record)).toEqual(record)
  expect(errors).toEqual([])
})

test('production optional extras add to supplies; cancellation and an unselected stash cost nothing', async ({ page }) => {
  await prepare(page, { hammer: 2, rocket: 2, bomb: 2 })
  await page.locator('#start-game').click(); await page.locator('[data-load="hammer"]').click()
  await expect(page.locator('#loadout-supply')).toBeVisible()
  await page.locator('#loadout-cancel').click()
  expect((await readPlayer(page)).stash).toEqual({ hammer: 2, rocket: 2, bomb: 2 })
  await page.locator('#start-game').click()
  await page.locator('[data-load="hammer"]').click(); await page.locator('[data-load="bomb"]').click()
  await page.locator('#loadout-start').click(); await checkStock(page, [4, 3, 4])
  expect((await readPlayer(page)).stash).toEqual({ hammer: 1, rocket: 2, bomb: 1 })
})

test('production v4 continue retains its original inventory before a genuinely new supplied game', async ({ page }) => {
  const game = new Game({}, 18, BOARD, 4)
  game.addBooster('hammer', BOOSTER_LIMIT)
  const record = recordOf(game)
  expect(verifyRun(record, BOARD).claimMatches).toBe(true)
  await prepare(page)
  await page.evaluate(record => localStorage.setItem('chroma-match:suspended', JSON.stringify({ record, level: record.level, score: record.score, at: Date.now() })), record)
  await page.reload(); await expect(page.locator('#splash')).toBeHidden({ timeout: 60000 })
  await page.locator('#continue-run').click(); await checkStock(page, [1, 0, 0])
  await page.locator('#pause').click(); await page.locator('#paused-keep').click()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('chroma-match:suspended')!).record)).toEqual(record)
  await page.locator('#start-game').click(); await page.locator('#overlay-action').click()
  await page.locator('#loadout-start').click(); await checkStock(page, [3, 3, 3])
})

test('production supplied-item guidance reflows on short phones and folds in all locales', async ({ page }, info) => {
  await prepare(page, { hammer: 1, rocket: 1, bomb: 1 })
  await page.locator('#start-game').click()
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [720, 720]]) {
    await page.setViewportSize({ width: width!, height: height! })
    for (const skin of ['paper', 'jewel', 'glass']) for (const lang of ['ko', 'en', 'ja', 'zh-Hans']) {
      // Existing native locale controls, not a development API.
      await page.locator('#loadout-cancel').click(); await page.locator('#map-settings').click()
      await page.locator(`button[data-lang="${lang}"]`).click()
      await page.locator(`button[data-skin-id="${skin}"]`).click()
      await page.keyboard.press('Escape'); await page.locator('#start-game').click()
      await expect(page.locator('#loadout-supply')).toContainText('3')
      await expect(page.locator('#loadout-title')).toBeInViewport()
      await page.locator('#loadout-start').focus()
      await expect(page.locator('#loadout-start')).toBeInViewport()
      const fits = await page.locator('#loadout .card').evaluate(node => {
        const r = node.getBoundingClientRect()
        return r.left >= 0 && r.right <= innerWidth + .5 && r.top >= 0 && r.bottom <= innerHeight + .5 && node.scrollWidth <= node.clientWidth + 1
      })
      if (!fits) await page.screenshot({ path: info.outputPath(`overflow-${width}x${height}-${skin}-${lang}.png`) })
      expect(fits, `${width}x${height}/${skin}/${lang}`).toBe(true)
      if (width === 844 && skin === 'paper' && lang === 'ko') await page.screenshot({ path: info.outputPath('short-landscape-loadout.png') })
    }
  }
  await page.setViewportSize({ width: 320, height: 568 })
  await page.addStyleTag({ content: ':root { --text-xs:24px; --text-sm:28px; --text-md:28px; --text-lg:30px; --text-xl:36px; --text-2xl:44px; }' })
  await expect(page.locator('#loadout-title')).toBeInViewport()
  await expect(page.locator('#loadout-start')).toBeInViewport()
  await page.locator('#loadout-content').focus(); await page.keyboard.press('End')
  await expect.poll(() => page.locator('#loadout-content').evaluate(e => e.scrollTop)).toBeGreaterThan(0)
  expect(await page.locator('#loadout-content').evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true)
  await page.screenshot({ path: info.outputPath('supplied-loadout.png') })
})
