import { expect, test, type Page } from '@playwright/test'
import { Game } from '../../src/game/game.ts'
import { MISSIONS, missionFor } from '../../src/game/campaign.ts'
import { recordOf, verifyRun } from '../../src/game/replay.ts'
import { bestMove } from '../../src/game/autoplay.ts'
import { BOARD } from '../../src/game/types.ts'

async function boot(page: Page) {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com|seed-san\.vrm/, route => route.abort())
  await page.addInitScript(() => {
    localStorage.setItem('chroma-match:lang', 'ko')
    localStorage.setItem('chroma.skin', 'paper')
    localStorage.setItem('chroma-match:granted', '1')
  })
  await page.goto('./')
  await expect(page.locator('#splash')).toBeHidden()
  await expect(page.locator('#screen-map')).toBeVisible()
}
function completedRecord(id: string) {
  const m = missionFor(id)!, g = new Game({}, m.seed, BOARD, 6, m.id)
  for (let step = 0; step < 70 && g.status === 'playing'; step++) {
    if (g.feverCharge === 100) g.activateFever()
    if (step < 3) g.useItem('bomb', BOARD.idx(2, 4))
    else if (step < 6) g.useItem('rocket', BOARD.idx(2, step - 3))
    else { const move = bestMove(g)!; g.drag(move.a, move.b) }
    for (let i = 0; i < 4000 && g.phaseKind !== 'idle'; i++) g.update(1 / 60)
  }
  expect(g.status).toBe('levelComplete')
  const record = recordOf(g)
  expect(verifyRun(record, BOARD).claimMatches).toBe(true)
  return record
}
async function aim(page: Page, cell: number) {
  await page.locator('#board').focus()
  for (let i = 0; i < BOARD.cols; i++) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < BOARD.rows; i++) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < BOARD.colOf(cell); i++) await page.keyboard.press('ArrowRight')
  for (let i = 0; i < BOARD.rowOf(cell); i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
}

test('production map opens without 3D, previews locks and clears a real mission with keyboard items', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  let models = 0; page.on('request', r => { if (r.url().includes('seed-san.vrm')) models++ })
  await page.setViewportSize({ width: 390, height: 844 }); await boot(page)
  expect(models).toBe(0)
  expect(await page.evaluate(() => 'chroma' in window)).toBe(false)
  await expect(page.locator('#world-image')).toBeVisible()
  expect(await page.locator('#world-image').evaluate(e => (e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await page.locator('[data-region="volcano"]').click()
  await expect(page.locator('#world-play')).toBeDisabled()
  await expect(page.locator('#world-start-note')).toContainText('보석숲 1번')
  await page.locator('[data-region="forest"]').click()
  await page.locator('[data-mission-step="2"]').click()
  await expect(page.locator('#world-play')).toBeDisabled()
  await expect(page.locator('#world-start-note')).toContainText('이전 미션')
  await page.locator('[data-mission-step="1"]').click()
  await page.locator('#world-play').focus(); await page.keyboard.press('Enter')
  await page.locator('#loadout-start').click()
  await expect(page.locator('#level')).toHaveText('보석숲 · 1/5')
  await expect(page.locator('#moves')).toHaveText('20')
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  for (let i = 0; i < 3; i++) {
    await page.locator('[data-item="bomb"]').click(); await aim(page, BOARD.idx(2, 4))
    await expect(page.locator('[data-count="bomb"]')).toHaveText(String(2 - i))
    await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  }
  await expect(page.locator('#overlay-title')).toHaveText('미션 클리어!')
  await expect(page.locator('#overlay-flair')).toContainText('+40')
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('chroma-match:campaign-v1')!))
  expect(progress.completed['forest-1']).toBe(1150)
  expect(await page.evaluate(() => Number(localStorage.getItem('chroma-match:coins')))).toBe(40)
  await page.locator('#overlay-home').click()
  await expect(page.locator('#world-progress')).toHaveText('1/20 완료')
  for (const r of ['volcano', 'prism', 'relay']) await expect(page.locator(`[data-region="${r}"]`)).toHaveAttribute('data-state', 'available')
  await page.screenshot({ path: info.outputPath('first-clear-map.png') })
  await page.reload(); await expect(page.locator('#splash')).toBeHidden()
  await expect(page.locator('#world-progress')).toHaveText('1/20 완료')
  expect(errors).toEqual([])
})

test('production regional entry, spent-stock continue and cancelled replacement preserve exact mission context', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await boot(page)
  await page.evaluate(() => localStorage.setItem('chroma-match:campaign-v1', JSON.stringify({ version: 1, completed: { 'forest-1': 1150 } })))
  await page.reload(); await expect(page.locator('#splash')).toBeHidden()
  await page.locator('[data-region="prism"]').click()
  await expect(page.locator('#world-rule')).toContainText('3색')
  await page.locator('#world-play').click(); await page.locator('#loadout-start').click()
  await expect(page.locator('#level')).toHaveText('프리즘해변 · 1/5')
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  await page.locator('[data-item="hammer"]').click(); await aim(page, 0)
  await expect(page.locator('[data-count="hammer"]')).toHaveText('2')
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  await page.locator('#pause').click(); await page.locator('#paused-keep').click()
  await expect(page.locator('#screen-map')).toBeVisible()
  await expect(page.locator('#map-continue')).toContainText('프리즘해변')
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('chroma-match:suspended')!).record)
  expect(kept.moves.startsWith('zu0a')).toBe(true)
  expect(verifyRun(kept, BOARD).claimMatches).toBe(true)
  await page.locator('[data-region="volcano"]').click(); await page.locator('#world-play').click()
  await page.locator('#overlay-action').click(); await page.locator('#loadout-cancel').click()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('chroma-match:suspended')!).record)).toEqual(kept)
  await page.reload(); await expect(page.locator('#splash')).toBeHidden()
  await page.locator('#map-continue').click()
  await expect(page.locator('#level')).toHaveText('프리즘해변 · 1/5')
  await expect(page.locator('[data-count="hammer"]')).toHaveText('2')
  await page.locator('#pause').click(); await page.locator('#paused-keep').click()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('chroma-match:suspended')!).record)).toEqual(kept)
  expect(errors).toEqual([])
})

test('production verified result reload never duplicates reward; mission scores do not enter endless rankings', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await boot(page)
  const record = completedRecord('forest-1')
  await page.evaluate(record => localStorage.setItem('chroma-match:suspended', JSON.stringify({ record, level: record.level, score: record.score, at: Date.now() })), record)
  await page.reload(); await expect(page.locator('#splash')).toBeHidden()
  await page.locator('#map-continue').click()
  await expect(page.locator('#overlay-title')).toHaveText('미션 클리어!')
  await expect(page.locator('#post-run')).toBeHidden()
  expect(await page.evaluate(() => Number(localStorage.getItem('chroma-match:coins')))).toBe(40)
  await page.locator('#overlay-home').click()
  await page.evaluate(record => localStorage.setItem('chroma-match:suspended', JSON.stringify({ record, level: record.level, score: record.score, at: Date.now() })), record)
  await page.reload(); await expect(page.locator('#splash')).toBeHidden()
  await page.locator('#map-continue').click()
  await expect(page.locator('#overlay-body')).toContainText('한 번만')
  expect(await page.evaluate(() => Number(localStorage.getItem('chroma-match:coins')))).toBe(40)
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:best'))).toBeNull()
  expect(errors).toEqual([])
})

test('production map controls, native list and fixed mission preview reflow across locales/themes/folds', async ({ page }, info) => {
  await boot(page)
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [720, 720], [1280, 800]]) {
    await page.setViewportSize({ width: width!, height: height! })
    for (const skin of ['paper', 'jewel', 'glass']) for (const lang of ['ko', 'en', 'ja', 'zh-Hans']) {
      await page.locator('#map-settings').click()
      await page.locator(`button[data-lang="${lang}"]`).click(); await page.locator(`button[data-skin-id="${skin}"]`).click()
      await page.keyboard.press('Escape')
      await expect(page.locator('#map-settings')).toBeFocused()
      await expect(page.locator('#world-play')).toBeInViewport()
      for (const id of ['map-character', 'map-shop']) await expect(page.locator(`#${id}`)).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect(await page.locator('.world-nav button').evaluateAll(nodes => nodes.every(e => {
        const r = e.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && r.bottom <= innerHeight + .5
      }))).toBe(true)
      if (skin === 'paper' && lang === 'ko') await page.screenshot({ path: info.outputPath(`map-${width}x${height}.png`) })
    }
  }
  await page.setViewportSize({ width: 320, height: 568 })
  await page.locator('#world-list-label').click()
  await page.locator('[data-list-region="relay"]').focus(); await page.keyboard.press('Enter')
  await expect(page.locator('[data-region="relay"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#world-play')).toBeDisabled()
  await page.locator('[data-list-region="forest"]').click()
  await page.addStyleTag({ content: ':root { --text-xs:24px; --text-sm:28px; --text-lg:30px; --text-xl:36px; --text-2xl:44px; }' })
  await page.locator('#world-play').focus()
  await expect(page.locator('#world-play')).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('map-enlarged-text.png') })
})

test('production map and campaign progress survive offline reload; utilities and shop return to the map', async ({ page, context }) => {
  await boot(page)
  await page.locator('#map-today').click(); await expect(page.locator('#sheet-today')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.locator('#map-ranks').click(); await expect(page.locator('#sheet-ranks')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.locator('#map-shop').click(); await expect(page.locator('#screen-shop')).toBeVisible()
  await page.locator('#shop-back').click(); await expect(page.locator('#screen-map')).toBeVisible()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await page.reload(); await expect(page.locator('#splash')).toBeHidden()
  await expect.poll(() => page.evaluate(async () => Boolean(await caches.match(location.href)))).toBe(true)
  await context.setOffline(true)
  try {
    await page.reload(); await expect(page.locator('#splash')).toBeHidden()
    await expect(page.locator('#screen-map')).toBeVisible()
    expect(await page.locator('#world-image').evaluate(e => (e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    await page.locator('#world-play').click(); await page.locator('#loadout-start').click()
    await expect(page.locator('#moves')).toHaveText(String(MISSIONS[0]!.moves))
  } finally { await context.setOffline(false) }
})
