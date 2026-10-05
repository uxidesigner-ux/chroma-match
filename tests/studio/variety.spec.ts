import { expect, test, type Page } from '@playwright/test'
import { enterLobby } from './boot.ts'

async function start(page: Page, lang = 'ko', skin = 'paper') {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com|seed-san\.vrm/, route => route.abort())
  await page.addInitScript(({ lang }) => localStorage.setItem('chroma-match:lang', lang), { lang })
  await page.goto(`/?seed=7&skin=${skin}`); await enterLobby(page)
  await page.locator('#start-game').click(); await page.locator('#loadout-start').click()
  await expect(page.locator('#board')).toBeVisible()
}
async function step(page: Page) {
  return page.evaluate(() => {
    const { game, best } = window.chroma
    if (game.status !== 'playing') return game.status
    if (game.moves < 5 && game.items.bomb) game.useItem('bomb', 20)
    else { const move = best()!; game.drag(move.a, move.b) }
    for (let i = 0; i < 4000 && game.phaseKind !== 'idle'; i++) game.update(1 / 60)
    return game.status
  })
}
async function advance(page: Page) {
  await expect(page.locator('#overlay')).toBeVisible()
  if (await page.locator('#upgrade-choices').isVisible()) await page.locator('#upgrade-options input').first().check()
  await page.locator('#overlay-action').click()
}
async function until(page: Page, target: 'ready' | number) {
  for (let i = 0; i < 180; i++) {
    const state = await page.evaluate(() => ({ level: window.chroma.game.level, status: window.chroma.game.status,
      charge: window.chroma.game.feverCharge, busy: window.chroma.game.busy }))
    if (target === 'ready' ? state.charge === 100 && !state.busy : state.level === target && state.status === 'levelComplete') return
    expect(state.status).not.toBe('gameOver')
    if (state.status === 'levelComplete') await advance(page)
    else await step(page)
  }
  throw new Error('fixture did not reach the requested game state')
}

test('earned fever activates by keyboard, costs no move, lasts accepted swaps and survives keep/reload', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 390, height: 844 }); await start(page)
  await expect(page.locator('#hud-character')).toHaveAttribute('aria-disabled', 'true')
  await until(page, 'ready')
  await expect(page.locator('#hud-character')).toHaveAttribute('data-fever', 'ready')
  const board = await page.locator('#board').boundingBox()
  const moves = await page.evaluate(() => window.chroma.game.moves)
  await page.locator('#hud-character').focus(); await page.keyboard.press('Enter')
  await expect(page.locator('#hud-character')).toHaveAttribute('data-fever', 'active')
  expect(await page.evaluate(() => [window.chroma.game.moves, window.chroma.game.feverTurns])).toEqual([moves, 3])
  expect(await page.locator('#board').boundingBox()).toEqual(board)
  await page.screenshot({ path: info.outputPath('fever-mobile.png') })
  await page.locator('#pause').click()
  const paused = await page.evaluate(() => [window.chroma.game.score, window.chroma.game.feverTurns, window.chroma.game.log.length])
  await page.waitForTimeout(180)
  expect(await page.evaluate(() => [window.chroma.game.score, window.chroma.game.feverTurns, window.chroma.game.log.length])).toEqual(paused)
  await page.locator('#paused-keep').click(); await page.reload(); await enterLobby(page)
  await page.locator('#continue-run').click()
  await expect(page.locator('#hud-character')).toHaveAttribute('data-fever', 'active')
  expect(await page.evaluate(() => [window.chroma.game.score, window.chroma.game.feverTurns, window.chroma.game.log.length])).toEqual(paused)
  await step(page)
  expect(await page.evaluate(() => window.chroma.game.feverTurns)).toBe(2)
  expect(errors).toEqual([])
})

test('stage three offers accessible upgrades; selecting and confirming preserves a just-entered stage on resume', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 650 }); await start(page)
  await until(page, 3)
  await expect(page.locator('#upgrade-choices')).toBeVisible()
  expect(await page.locator('#overlay').evaluate(e => getComputedStyle(e).animationName)).toBe('none')
  await expect(page.locator('#overlay-action')).toBeDisabled()
  const options = page.locator('#upgrade-options input')
  await expect(options).toHaveCount(3); await expect(options.first()).toBeFocused()
  await page.keyboard.press('Space'); await page.keyboard.press('ArrowDown')
  await expect(options.nth(1)).toBeChecked(); await expect(page.locator('#overlay-action')).toBeEnabled()
  await page.screenshot({ path: info.outputPath('upgrade-mobile.png') })
  await page.locator('#overlay-action').click()
  expect(await page.evaluate(() => [window.chroma.game.level, window.chroma.game.upgrades.stripe])).toEqual([4, 1])
  const before = await page.evaluate(async () => {
    const { recordOf, verifyRun } = await import('/src/game/replay.ts')
    const record = recordOf(window.chroma.game)
    return { record, verify: verifyRun(record, window.chroma.game.geom).claimMatches,
      missions: localStorage.getItem('chroma-match:missions') }
  })
  expect(before.verify).toBe(true)
  await page.locator('#pause').click(); await page.locator('#paused-keep').click(); await page.locator('#continue-run').click()
  expect(await page.evaluate(async () => {
    const { recordOf } = await import('/src/game/replay.ts')
    return recordOf(window.chroma.game)
  })).toEqual(before.record)
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:missions'))).toBe(before.missions)
})

test('stage five announces and enters a genuinely different bomb factory without changing board size', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await start(page)
  await until(page, 4)
  await expect(page.locator('#overlay-body')).toContainText('폭탄 공장')
  await expect(page.locator('#overlay-body')).toContainText('이동 +5회')
  await page.locator('#overlay-action').click()
  const state = await page.evaluate(() => {
    const g = window.chroma.game
    return { level: g.level, bonus: g.bonusRound, bombs: g.grid.filter(gem => gem?.power === 'bomb').length,
      moves: g.moves, need: g.need, cols: g.geom.cols, rows: g.geom.rows }
  })
  expect(state).toEqual({ level: 5, bonus: 'factory', bombs: 3, moves: 32, need: 2080, cols: 6, rows: 9 })
  await expect(page.locator('#level')).toContainText('폭탄 공장')
  await page.screenshot({ path: info.outputPath('bonus-mobile.png') })
  const before = await page.locator('#board').boundingBox(); await step(page)
  expect(await page.locator('#board').boundingBox()).toEqual(before)
})

test('pending upgrade choice survives reload and cannot be skipped', async ({ page }) => {
  await start(page); await until(page, 3)
  const before = await page.evaluate(() => window.chroma.game.score)
  await page.evaluate(async () => {
    const { recordOf } = await import('/src/game/replay.ts'), { suspendRun } = await import('/src/suspend.ts')
    suspendRun(recordOf(window.chroma.game))
  })
  await page.reload(); await enterLobby(page); await page.locator('#continue-run').click()
  await expect(page.locator('#upgrade-choices')).toBeVisible()
  await expect(page.locator('#overlay-action')).toBeDisabled()
  expect(await page.evaluate(() => [window.chroma.game.level, window.chroma.game.score, window.chroma.game.upgradeDue])).toEqual([3, before, true])
})

test('all themes/locales keep fever feedback and bonus labels within fixed space on phone/fold/desktop', async ({ page }, info) => {
  await start(page); await page.emulateMedia({ reducedMotion: 'reduce' })
  const failures: unknown[] = []
  for (const [width, height] of [[320, 568], [390, 650], [390, 844], [720, 720], [1280, 800]]) {
    await page.setViewportSize({ width: width!, height: height! })
    const result = await page.evaluate(async () => {
      const { setLanguage } = await import('/src/i18n/index.ts'), { setSkin, SKINS } = await import('/src/render/skins/index.ts')
      const issues: unknown[] = []
      for (const skin of SKINS) for (const lang of ['en', 'ko', 'ja', 'zh-Hans'] as const) {
        setSkin(skin, false); setLanguage(lang)
        const { game, combo } = window.chroma
        // Presentation fixture only: actual earned/round-entry flows are tested above.
        game.feverCharge = 100; game.level = 10
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const board = document.getElementById('board')!.getBoundingClientRect().toJSON()
        const copy = (await import('/src/ui/variety-copy.ts')).varietyCopy()
        for (const message of [copy.charged, copy.started, copy.chainFinish, ...Object.values(copy.bonusCue)]) {
          combo.reportEvent(message)
          await new Promise(resolve => requestAnimationFrame(resolve))
          const badge = document.getElementById('combo')!.getBoundingClientRect(), lane = document.querySelector('.game-feedback')!.getBoundingClientRect()
          if (badge.top < lane.top - 1 || badge.bottom > lane.bottom + 1 || badge.left < lane.left || badge.right > lane.right)
            issues.push({ message, skin: skin.id, lang, badge: badge.toJSON(), lane: lane.toJSON() })
        }
        const after = document.getElementById('board')!.getBoundingClientRect().toJSON()
        const face = document.getElementById('hud-character')!.getBoundingClientRect()
        if (JSON.stringify(board) !== JSON.stringify(after) || face.width < 44
          || document.documentElement.scrollWidth > innerWidth) issues.push({ skin: skin.id, lang, board, after, face: face.toJSON() })
        const fill = document.querySelector('.fever-fill')!
        if (getComputedStyle(fill).transitionDuration !== '0s') issues.push({ motion: true, skin: skin.id, lang })
      }
      return issues
    })
    failures.push(...result)
  }
  expect(failures).toEqual([])
  await page.screenshot({ path: info.outputPath('fever-desktop.png') })
})

test('legacy saved game still displays old rules and has no fever action', async ({ page }) => {
  await start(page)
  await page.evaluate(async () => {
    const { Game } = await import('/src/game/game.ts'), { BOARD } = await import('/src/game/types.ts')
    const { recordOf } = await import('/src/game/replay.ts'), { suspendRun } = await import('/src/suspend.ts')
    const { bestMove } = await import('/src/game/autoplay.ts')
    const game = new Game({}, 18, BOARD, 3), move = bestMove(game)!
    game.drag(move.a, move.b)
    for (let i = 0; i < 4000 && game.phaseKind !== 'idle'; i++) game.update(1 / 60)
    suspendRun(recordOf(game))
  })
  await page.reload(); await enterLobby(page); await page.locator('#continue-run').click()
  await expect(page.locator('#hud-character')).toHaveAttribute('data-fever', 'legacy')
  await expect(page.locator('.fever-ring')).toBeHidden()
  expect(await page.evaluate(() => window.chroma.game.rules)).toBe(3)
})

test('bonus cascade finish is visible, bounded and never moves the board', async ({ page }) => {
  await start(page); await page.emulateMedia({ reducedMotion: 'reduce' })
  const result = await page.evaluate(async () => {
    const { game, best } = window.chroma
    // Controlled stability fixture: normal replayed bonus entry is covered separately.
    game.level = 9; game.status = 'levelComplete'; game.chooseUpgrade('blast'); game.nextLevel()
    game.goal = { kind: 'score', need: Infinity }; game.moves = 200
    let capped = false, maxFrames = 0
    const before = document.getElementById('board')!.getBoundingClientRect().toJSON()
    for (let turn = 0; turn < 60 && !capped; turn++) {
      if (game.feverCharge === 100) game.activateFever()
      const move = best()!; game.drag(move.a, move.b)
      let frames = 0
      for (; frames < 540 && game.phaseKind !== 'idle'; frames++) {
        game.update(1 / 60)
        capped ||= document.getElementById('combo-word')!.textContent === '8연쇄 완성! 다음 수 준비'
      }
      maxFrames = Math.max(maxFrames, frames)
      if (game.phaseKind !== 'idle') throw new Error('cascade exceeded the interaction budget')
    }
    return { capped, maxFrames, before, after: document.getElementById('board')!.getBoundingClientRect().toJSON() }
  })
  expect(result.capped).toBe(true); expect(result.maxFrames).toBeLessThan(540)
  expect(result.after).toEqual(result.before)
})

test('enlarged variety labels and upgrade choices remain readable on a narrow phone', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 }); await start(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addStyleTag({ content: ':root { --text-xs:24px; --text-sm:28px; --text-md:28px; --text-lg:30px; --text-xl:36px; --text-2xl:44px; --text-3xl:60px; --text-4xl:92px; }' })
  const failures = await page.evaluate(async () => {
    const { setLanguage } = await import('/src/i18n/index.ts'), { setSkin, SKINS } = await import('/src/render/skins/index.ts')
    const { varietyCopy } = await import('/src/ui/variety-copy.ts')
    const { game, combo } = window.chroma, issues: unknown[] = []
    const fits = (a: DOMRect, b: DOMRect) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1
    // Only labels are set here; earned activation and real bonus entry are covered above.
    game.level = 10; game.feverCharge = 100
    const puzzle = JSON.stringify(game.grid)
    for (const skin of SKINS) for (const lang of ['en', 'ko', 'ja', 'zh-Hans'] as const) {
      setSkin(skin, false); setLanguage(lang)
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const level = document.getElementById('level')!, range = document.createRange()
      range.selectNodeContents(level)
      // Display glyph bounds can exceed an inline line box even when they are
      // not clipped. Check the actual free space between HUD and feedback.
      const label = level.getBoundingClientRect(), hud = document.querySelector('.game-hud')!.getBoundingClientRect()
      const feedback = document.querySelector('.game-feedback')!.getBoundingClientRect()
      if (!Array.from(range.getClientRects()).every(r => r.left >= label.left - 1 && r.right <= label.right + 1
        && r.top >= hud.bottom - 1 && r.bottom <= feedback.top + 1) || label.right > innerWidth)
        issues.push({ skin: skin.id, lang, label: level.textContent, rect: level.getBoundingClientRect().toJSON(), text: Array.from(range.getClientRects()).map(r => r.toJSON()) })
      const before = document.getElementById('board')!.getBoundingClientRect().toJSON(), copy = varietyCopy()
      for (const message of [copy.charged, copy.started, copy.chainFinish, ...Object.values(copy.bonusCue)]) {
        combo.reportEvent(message)
        await new Promise(resolve => requestAnimationFrame(resolve))
        const badge = document.getElementById('combo')!.getBoundingClientRect(), lane = document.querySelector('.game-feedback')!.getBoundingClientRect()
        if (!fits(badge, lane)) issues.push({ skin: skin.id, lang, message, badge: badge.toJSON(), lane: lane.toJSON() })
      }
      if (JSON.stringify(before) !== JSON.stringify(document.getElementById('board')!.getBoundingClientRect().toJSON()) || JSON.stringify(game.grid) !== puzzle
        || document.documentElement.scrollWidth > innerWidth) issues.push({ skin: skin.id, lang, unstable: true })
    }
    return issues
  })
  await page.screenshot({ path: info.outputPath('variety-text-200.png') })
  expect(failures).toEqual([])
  // Choice text is scrollable rather than shrunk or hidden at enlarged sizes.
  await page.evaluate(async () => {
    const { setLanguage } = await import('/src/i18n/index.ts')
    setLanguage('ko'); window.chroma.game.level = 1; window.chroma.game.feverCharge = 0
  })
  await until(page, 3)
  const options = page.locator('#upgrade-options input')
  await options.last().check(); await page.locator('#overlay-action').scrollIntoViewIfNeeded()
  await expect(page.locator('#overlay-action')).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('upgrade-text-200.png') })
  await page.locator('#overlay-action').click()
  expect(await page.evaluate(() => [window.chroma.game.level, window.chroma.game.upgrades.echo])).toEqual([4, 1])
})
