import { expect, test, type Page } from '@playwright/test'
import { enterLobby } from './boot.ts'

async function start(page: Page, width = 320, height = 568) {
  await page.setViewportSize({ width, height })
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com|seed-san\.vrm/, route => route.abort())
  await page.addInitScript(() => localStorage.setItem('chroma-match:lang', 'en'))
  await page.goto('/?seed=i'); await enterLobby(page)
  await page.locator('#start-game').click(); await page.locator('#loadout-start').click()
  await expect(page.locator('#board')).toBeVisible()
}

test('touching a partially visible row never focus-scrolls or discards the tap', async ({ page }) => {
  // Keep a genuinely clipped board: the optimized 568px shell now reveals
  // row nine at scrollTop 80, so keyboard scrolling is not needed there.
  await start(page, 320, 500)
  await page.evaluate(() => {
    document.querySelector('.game .stage')!.scrollTop = 80
    document.getElementById('pause')!.focus()
  })
  const before = (await page.locator('#board').boundingBox())!
  const stage = (await page.locator('.game .stage').boundingBox())!
  const target = { x: before.x + before.width / 2, y: stage.y + 6 }
  const cell = await page.evaluate(({ x, y }) => {
    const b = document.getElementById('board')!.getBoundingClientRect()
    return window.chroma.renderer.cellAtPoint(x - b.x, y - b.y)
  }, target)
  await page.mouse.move(target.x, target.y); await page.mouse.down()
  expect(await page.locator('#board').boundingBox()).toEqual(before)
  await page.mouse.up()
  expect(await page.evaluate(() => window.chroma.game.selected)).toBe(cell)
  await expect(page.locator('#board-status')).toContainText('Row 2, column 4')
  await expect(page.locator('#board-status')).toContainText('Selected')
  expect(await page.evaluate(() => window.chroma.game.moves)).toBe(25)
  // Keyboard navigation still explicitly reveals the chosen row.
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowDown')
  expect(await page.locator('.game .stage').evaluate(e => e.scrollTop)).toBeGreaterThan(80)
})

test('score ink stays inside the visible scroller at every edge, after scrolling and drift', async ({ page }, info) => {
  await start(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const failures = await page.evaluate(() => {
    const { renderer, effects, game } = window.chroma
    const canvas = document.getElementById('board') as HTMLCanvasElement, ctx = canvas.getContext('2d')!
    const stage = document.querySelector<HTMLElement>('.game .stage')!
    const stroke = ctx.strokeText, failures: unknown[] = []
    try {
      for (const offset of [0, 80, 999]) {
        stage.scrollTop = offset; renderer.resize()
        const b = canvas.getBoundingClientRect(), s = stage.getBoundingClientRect()
        ctx.strokeText = function(text, x, y, ...args) {
          const m = this.getTransform(), ink = this.measureText(text), dpr = devicePixelRatio
          const bounds = {
            left: b.left + (m.e + (x - ink.actualBoundingBoxLeft - this.lineWidth / 2) * m.a) / dpr,
            right: b.left + (m.e + (x + ink.actualBoundingBoxRight + this.lineWidth / 2) * m.a) / dpr,
            top: b.top + (m.f + (y - ink.actualBoundingBoxAscent - this.lineWidth / 2) * m.d) / dpr,
            bottom: b.top + (m.f + (y + ink.actualBoundingBoxDescent + this.lineWidth / 2) * m.d) / dpr,
          }
          if (bounds.left < Math.max(b.left, s.left) || bounds.right > Math.min(b.right, s.right)
            || bounds.top < Math.max(b.top, s.top) || bounds.bottom > Math.min(b.bottom, s.bottom)) failures.push({ offset, bounds, board: b.toJSON(), stage: s.toJSON() })
          return stroke.call(this, text, x, y, ...args)
        }
        effects.clear()
        for (const [x, y] of [[0, 0], [canvas.clientWidth, 0], [0, canvas.clientHeight], [canvas.clientWidth, canvas.clientHeight]]) effects.float(x!, y!, '+999999', '#fff', 1.35)
        effects.update(.4); renderer.draw(game, effects, 0)
      }
    } finally { ctx.strokeText = stroke }
    return failures
  })
  expect(failures).toEqual([])
  await page.screenshot({ path: info.outputPath('scrolled-score.png') })
})

test('a fusion hint cannot replace an active chain or fusion announcement', async ({ page }) => {
  await start(page)
  const result = await page.evaluate(() => {
    const { combo } = window.chroma, word = document.getElementById('combo-word')!
    combo.report(6); const chain = word.textContent
    combo.fusionHint(true); const afterChain = word.textContent
    combo.reportFusion('megaBomb'); const fusion = word.textContent
    combo.fusionHint(true); const afterFusion = word.textContent
    combo.update(1.5); combo.fusionHint(true); const hint = word.textContent
    combo.fusionHint(false)
    return { chain, afterChain, fusion, afterFusion, hint, hidden: document.getElementById('combo')!.hidden }
  })
  expect(result.afterChain).toBe(result.chain); expect(result.afterFusion).toBe(result.fusion)
  expect(result.hint).toContain('fuse'); expect(result.hidden).toBe(true)
})

test('normal-motion badge, portrait and wave fit their lane throughout every animation', async ({ page }, info) => {
  await start(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const failures: unknown[] = []
  for (const [width, height] of [[320, 568], [390, 844], [568, 320], [844, 390], [720, 720]]) {
    await page.setViewportSize({ width: width!, height: height! })
    const result = await page.evaluate(async () => {
      const { setLanguage } = await import('/src/i18n/index.ts')
      const { setSkin, SKINS } = await import('/src/render/skins/index.ts')
      const root = document.getElementById('combo')!, lane = document.querySelector('.game-feedback')!
      const failures: unknown[] = []
      const fits = (a: { left: number; top: number; right: number; bottom: number }, b: DOMRect) =>
        a.left >= b.left - .1 && a.right <= b.right + .1 && a.top >= b.top - .1 && a.bottom <= b.bottom + .1
      for (const skin of SKINS) for (const lang of ['en', 'ko', 'ja', 'zh-Hans'] as const) {
        setSkin(skin, false); setLanguage(lang)
        for (const report of [() => window.chroma.combo.report(6), () => window.chroma.combo.reportFusion('prismBomb')]) {
          window.chroma.combo.hide(); report()
          const animations = root.getAnimations({ subtree: true }); animations.forEach(a => a.pause())
          for (const time of [0, 80, 160, 240, 320, 400, 479]) {
            animations.forEach(a => { a.currentTime = time })
            const b = root.getBoundingClientRect(), l = lane.getBoundingClientRect()
            const avatar = document.getElementById('combo-avatar')!.getBoundingClientRect()
            const wave = getComputedStyle(root, '::after'), transform = new DOMMatrix(wave.transform)
            const w = (parseFloat(wave.width) || 0), h = (parseFloat(wave.height) || 0)
            const halo = { left: (b.left + b.right - w * transform.a) / 2, right: (b.left + b.right + w * transform.a) / 2,
              top: (b.top + b.bottom - h * transform.d) / 2, bottom: (b.top + b.bottom + h * transform.d) / 2 }
            if (!fits(b, l) || !fits(avatar, l) || Number(wave.opacity) > .1 && !fits(halo, l)) failures.push({ skin: skin.id, lang, time, badge: b.toJSON(), avatar: avatar.toJSON(), halo, lane: l.toJSON() })
          }
        }
      }
      window.chroma.combo.hide()
      return failures
    })
    failures.push(...result.map(failure => ({ width, height, failure })))
  }
  expect(failures).toEqual([])
  await page.evaluate(() => window.chroma.combo.report(6))
  await page.screenshot({ path: info.outputPath('normal-feedback.png') })
})

test('browser viewport resize and scroll offsets move the shell without changing a run', async ({ page }) => {
  // Controlled browser geometry, not a claim of physical Safari testing.
  await page.addInitScript(() => {
    const viewport = Object.assign(new EventTarget(), { offsetTop: 0, offsetLeft: 0, width: 390, height: 844, scale: 1 })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
  })
  await start(page, 390, 844)
  const before = await page.evaluate(() => JSON.stringify({ grid: window.chroma.game.grid, moves: window.chroma.game.moves }))
  await page.evaluate(() => {
    Object.assign(window.visualViewport!, { offsetTop: 70, height: 650 })
    window.visualViewport!.dispatchEvent(new Event('scroll'))
    window.visualViewport!.dispatchEvent(new Event('resize'))
  })
  await expect.poll(() => page.locator('html').evaluate(e => e.style.getPropertyValue('--play-top'))).toBe('70px')
  const screen = (await page.locator('.app').boundingBox())!
  expect(screen.y).toBe(70); expect(screen.height).toBe(650)
  const tools = (await page.locator('#pause').boundingBox())!
  expect(tools.y + tools.height).toBeLessThanOrEqual(720)
  expect(await page.evaluate(() => JSON.stringify({ grid: window.chroma.game.grid, moves: window.chroma.game.moves }))).toBe(before)
  await page.evaluate(() => {
    Object.assign(window.visualViewport!, { scale: 2, width: 195, height: 325 })
    window.visualViewport!.dispatchEvent(new Event('resize'))
  })
  await expect.poll(() => page.locator('html').evaluate(e => e.style.getPropertyValue('--play-height'))).toBe('844px')
  expect(await page.evaluate(() => JSON.stringify({ grid: window.chroma.game.grid, moves: window.chroma.game.moves }))).toBe(before)
})

test('hidden documents freeze a live cascade, then resume the accepted move', async ({ page }) => {
  await start(page, 390, 844)
  const snapshots = await page.evaluate(async () => {
    const game = window.chroma.game, { a, b } = window.chroma.best()!
    game.drag(a, b)
    const snapshot = () => JSON.stringify({ grid: game.grid, phase: game.phaseProgress, moves: game.moves, score: game.score })
    const before = snapshot()
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
    for (let i = 0; i < 20; i++) await new Promise(resolve => requestAnimationFrame(resolve))
    const hidden = snapshot()
    delete (document as unknown as { hidden?: boolean }).hidden
    document.dispatchEvent(new Event('visibilitychange'))
    return { before, hidden }
  })
  expect(snapshots.hidden).toBe(snapshots.before)
  await page.waitForFunction(() => !window.chroma.game.busy)
  expect(await page.evaluate(() => window.chroma.game.log.length)).toBe(1)
  expect(await page.evaluate(() => window.chroma.game.moves)).toBe(24)
})

test('exceptionally short split windows retain a playable slice and reachable controls', async ({ page }, info) => {
  await start(page, 320, 260)
  expect(await page.locator('.game .stage').evaluate(e => e.clientHeight)).toBeGreaterThanOrEqual(84)
  expect(await page.evaluate(() => window.chroma.renderer.cellSize)).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: info.outputPath('short-split-board.png') })
  await page.locator('#pause').scrollIntoViewIfNeeded()
  await expect(page.locator('#pause')).toBeInViewport()
  await page.locator('#pause').click(); await expect(page.locator('#paused-resume')).toBeFocused()
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => scrollY)).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('Play again resets scroll and keyboard row instead of inheriting the previous run', async ({ page }) => {
  await start(page)
  await page.locator('#board').focus()
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowDown')
  expect(await page.locator('.game .stage').evaluate(e => e.scrollTop)).toBeGreaterThan(0)
  await page.locator('#pause').click(); await page.locator('#paused-end').click()
  await page.locator('#overlay-action').click()
  await expect(page.locator('#moves')).toHaveText('25')
  expect(await page.locator('.game .stage').evaluate(e => e.scrollTop)).toBe(0)
  await page.locator('#board').focus(); await page.keyboard.press('ArrowRight')
  expect(await page.evaluate(() => window.chroma.game.held)).toBe(1)
  expect(await page.evaluate(() => window.chroma.game.log.length)).toBe(0)
})

test('mobile touch contact on a clipped row selects once without moving the board', async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 })
  try {
    const page = await context.newPage(); await start(page)
    await page.evaluate(() => { document.querySelector('.game .stage')!.scrollTop = 80; document.getElementById('pause')!.focus() })
    const before = (await page.locator('#board').boundingBox())!, stage = (await page.locator('.game .stage').boundingBox())!
    const target = { x: before.x + before.width / 2, y: stage.y + 6, id: 1 }
    const cdp = await context.newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [target] })
    expect(await page.locator('#board').boundingBox()).toEqual(before)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    expect(await page.evaluate(() => window.chroma.game.selected)).toBe(9)
    expect(await page.evaluate(() => window.chroma.game.moves)).toBe(25)
    await expect(page.locator('#board-status')).toContainText('Row 2, column 4')
    expect(await page.evaluate(() => scrollY)).toBe(0)
    await page.screenshot({ path: info.outputPath('partial-row-touch.png') })
  } finally { await context.close() }
})
