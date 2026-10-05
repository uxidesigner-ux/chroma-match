import { expect, test } from '@playwright/test'
import { Game } from '../../src/game/game.ts'
import { bestMove } from '../../src/game/autoplay.ts'
import { recordOf, verifyRun } from '../../src/game/replay.ts'
import { makeGeom } from '../../src/game/types.ts'

function boundaryFixture() {
  const game = new Game({}, 7)
  for (let turn = 0; turn < 180; turn++) {
    if (game.level === 3 && game.status === 'levelComplete') {
      const record = recordOf(game)
      if (!verifyRun(record, game.geom).claimMatches) throw new Error('fixture must verify')
      return record
    }
    if (game.status === 'levelComplete') game.nextLevel()
    if (game.status !== 'playing') throw new Error('fixture did not reach stage 3')
    if (game.moves < 5 && game.items.bomb) game.useItem('bomb', 20)
    else { const move = bestMove(game)!; game.drag(move.a, move.b) }
    for (let i = 0; i < 4000 && game.phaseKind !== 'idle'; i++) game.update(1 / 60)
  }
  throw new Error('fixture never completed')
}

test('production v4 restores a pending choice, confirms an upgrade and saves active fever without debug APIs', async ({ page }, info) => {
  const record = boundaryFixture(), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com|seed-san\.vrm/, route => route.abort())
  await page.addInitScript(record => {
    localStorage.setItem('chroma-match:lang', 'ko')
    localStorage.setItem('chroma.skin', 'paper')
    if (!sessionStorage.getItem('variety-fixture-loaded')) {
      localStorage.setItem('chroma-match:suspended', JSON.stringify({ record, level: record.level, score: record.score, at: Date.now() }))
      sessionStorage.setItem('variety-fixture-loaded', '1')
    }
  }, record)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await expect(page.locator('#splash')).toBeHidden({ timeout: 60000 })
  if (await page.locator('#overlay-action').isVisible()) await page.locator('#overlay-action').click()
  await page.locator('#continue-run').click()
  await expect(page.locator('#upgrade-choices')).toBeVisible()
  await expect(page.locator('#overlay-action')).toBeDisabled()
  await page.locator('#upgrade-options input').first().check()
  await page.locator('#overlay-action').click()
  await expect(page.locator('#level')).toHaveText('4단계')
  await expect(page.locator('#hud-character')).toHaveAttribute('aria-disabled', 'false')
  await page.locator('#hud-character').click()
  await expect(page.locator('#hud-reaction')).toHaveText('피버 · 3회')
  await page.locator('#pause').click(); await expect(page.locator('#run-upgrades')).toContainText('대형 폭탄')
  await page.locator('#paused-keep').click()
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('chroma-match:suspended')!).record)
  expect(verifyRun(kept, gameBoard(record)).claimMatches).toBe(true)
  await page.reload(); await expect(page.locator('#splash')).toBeHidden({ timeout: 60000 })
  await page.locator('#continue-run').click()
  await expect(page.locator('#hud-reaction')).toHaveText('피버 · 3회')
  await expect(page.locator('#level')).toHaveText('4단계')
  expect(await page.evaluate(() => 'chroma' in window)).toBe(false)
  await page.screenshot({ path: info.outputPath('production-variety.png') })
  expect(errors).toEqual([])
})

// Keep the fixture's declared geometry rather than infer one from viewport size.
function gameBoard(record: ReturnType<typeof recordOf>) {
  return makeGeom(record.board.cols, record.board.rows, record.board.kinds)
}
