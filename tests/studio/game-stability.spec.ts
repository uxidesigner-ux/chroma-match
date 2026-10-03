import { expect, test, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { enterLobby } from './boot.ts'

async function start(page: Page, booster = false) {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com|seed-san\.vrm/, route => route.abort())
  await page.addInitScript(() => localStorage.setItem('chroma-match:lang', 'en'))
  await page.goto('/?seed=i')
  await enterLobby(page)
  await page.locator('#start-game').click()
  if (booster) await page.locator('[data-load="hammer"]').click()
  await page.locator('#loadout-start').click()
  await expect(page.locator('#board')).toBeVisible()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

for (const [width, height] of [
  [320, 568], [360, 640], [390, 844], [430, 932], [480, 320], [568, 320],
  [740, 360], [844, 390], [720, 720], [900, 720], [1280, 800], [1440, 900],
]) test(`game stability matrix: ${width}×${height}, all themes/locales/messages`, async ({ page }, info) => {
  await page.setViewportSize({ width: width!, height: height! })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await start(page)
  const result = await page.evaluate(async () => {
    const { setLanguage } = await import('/src/i18n/index.ts')
    const { setSkin, SKINS } = await import('/src/render/skins/index.ts')
    const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const rect = (id: string) => {
      const r = document.querySelector(id)!.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }
    }
    const fits = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>, allowance = .05) =>
      a.x >= b.x - allowance && a.y >= b.y - allowance && a.right <= b.right + allowance && a.bottom <= b.bottom + allowance
    const stable = JSON.stringify(window.chroma.game.grid)
    const rows = []
    for (const skin of SKINS) for (const lang of ['en', 'ko', 'ja', 'zh-Hans'] as const) {
      setSkin(skin, false); setLanguage(lang); await settle()
      const before = rect('#board'), stage = document.querySelector<HTMLElement>('.game .stage')!
      const screen = { x: 0, y: 0, right: innerWidth, bottom: innerHeight, w: innerWidth, h: innerHeight }
      const labels = []
      for (const kind of ['cross', 'wideCross', 'megaBomb', 'prismStripe', 'prismBomb', 'prismPair'] as const) {
        window.chroma.combo.reportFusion(kind)
        labels.push({ kind, fits: fits(rect('#combo'), rect('.game-feedback')), wordFits: fits(rect('#combo-word'), rect('#combo')) })
      }
      for (const combo of [2, 3, 4, 6, 20]) {
        window.chroma.combo.report(combo)
        labels.push({ kind: `chain${combo}`, fits: fits(rect('#combo'), rect('.game-feedback')), wordFits: fits(rect('#combo-word'), rect('#combo')) })
      }
      window.chroma.combo.fusionHint(true)
      labels.push({ kind: 'hint', fits: fits(rect('#combo'), rect('.game-feedback')), wordFits: fits(rect('#combo-word'), rect('#combo')) })
      const tools = Array.from(document.querySelectorAll<HTMLElement>('#items button')).filter(e => e.getClientRects().length).map(e => {
        const b = e.getBoundingClientRect()
        return { fits: b.x >= 0 && b.y >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, w: b.width, h: b.height }
      })
      const hud = Array.from(document.querySelectorAll<HTMLElement>('.game-hud > div')).map(e => e.getBoundingClientRect().width)
      const hint = document.getElementById('items-hint')!
      hint.textContent = 'Select a gem to use the item.'; hint.hidden = false
      const withHint = rect('#board'); hint.hidden = true
      stage.scrollTop = stage.scrollHeight; await settle()
      window.chroma.combo.report(6)
      rows.push({ skin: skin.id, lang, labels, tools, hud, before, withHint,
        cell: window.chroma.renderer.cellSize, stageHeight: stage.clientHeight,
        afterScrollFits: fits(rect('#combo'), rect('.game-feedback')),
        fitsScreen: fits(rect('.game-feedback'), screen) && fits(rect('#items'), screen),
        pageScroll: scrollY, unchanged: JSON.stringify(window.chroma.game.grid) === stable,
        htmlOverflow: document.documentElement.scrollWidth > innerWidth,
      })
      stage.scrollTop = 0
    }
    return rows
  })
  await writeFile(info.outputPath('matrix.json'), JSON.stringify(result, null, 2))
  for (const row of result) {
    const label = `${width}/${height}/${row.skin}/${row.lang}`
    expect(row.labels.every(x => x.fits && x.wordFits), label).toBe(true)
    expect(row.tools.every(x => x.fits && x.w >= 44 && x.h >= 44), label).toBe(true)
    expect(Math.max(...row.hud) - Math.min(...row.hud), label).toBeLessThan(1)
    expect(row.withHint, label).toEqual(row.before)
    expect(row.cell, label).toBeGreaterThanOrEqual(44)
    expect(row.stageHeight, label).toBeGreaterThanOrEqual(height! < 400 ? 70 : 180)
    expect(row.afterScrollFits && row.fitsScreen && row.unchanged && !row.htmlOverflow, label).toBe(true)
    expect(row.pageScroll, label).toBe(0)
  }
  await page.screenshot({ path: info.outputPath('game.png') })
  expect(errors).toEqual([])
})

test('classic scrollbar width and wide system digits retain targets and complete counts', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await start(page)
  // Reserve a total 17px classic gutter, including any native gutter already
  // present. Adding another 17px on Linux double-counts its real scrollbar.
  await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('.game .stage')!
    const nativeGutter = stage.offsetWidth - stage.clientWidth
    stage.style.paddingRight = `${Math.max(0, 17 - nativeGutter)}px`
  })
  await page.addStyleTag({ content: '#goal-remaining { font-family: monospace; }' })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(await page.evaluate(() => window.chroma.renderer.cellSize)).toBeGreaterThanOrEqual(44)
  await page.setViewportSize({ width: 568, height: 320 })
  await page.evaluate(async () => {
    const { Hud } = await import('/src/ui/hud.ts')
    const hud = new Hud()
    hud.update({ ...window.chroma.game, goal: { kind: 'score', need: 99999 }, need: 99999, progress: 0 } as typeof window.chroma.game)
  })
  await expect(page.locator('#goal-remaining')).toHaveText('99,999')
  await expect.poll(() => page.locator('#goal-remaining').evaluate(node => {
    const box = node.getBoundingClientRect(), allocation = node.closest('.hud-goal')!.getBoundingClientRect()
    const range = document.createRange(); range.selectNodeContents(node)
    const text = range.getBoundingClientRect()
    return box.left >= allocation.left && box.right <= allocation.right && text.left >= box.left && text.right <= box.right
  })).toBe(true)
  await page.screenshot({ path: info.outputPath('classic-gutter-wide-digits.png') })
})

test('real item arming and spending keep the board frame and targets unchanged', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await start(page, true)
  const before = await page.locator('#board').boundingBox()
  await page.locator('[data-item="hammer"]').click()
  await expect(page.locator('#items-hint')).toBeVisible()
  expect(await page.locator('#board').boundingBox()).toEqual(before)
  const point = await page.evaluate(() => window.chroma.renderer.centreOf(12))
  await page.mouse.click(before!.x + point.x, before!.y + point.y)
  await page.waitForFunction(() => !window.chroma.game.busy)
  await expect(page.locator('[data-count="hammer"]')).toHaveText('0')
  await expect(page.locator('#items-hint')).toBeHidden()
  expect(await page.locator('#board').boundingBox()).toEqual(before)
  expect(await page.evaluate(() => window.chroma.game.log.filter(a => a.kind === 'item').length)).toBe(1)
  await page.screenshot({ path: info.outputPath('after-item.png') })
})

test('pause freezes a live cascade and a captured gesture cannot survive window blur', async ({ page }) => {
  await start(page)
  await page.evaluate(() => { const { a, b } = window.chroma.best()!; window.chroma.game.drag(a, b) })
  await page.locator('#pause').click()
  const snapshot = () => page.evaluate(() => JSON.stringify({ phase: window.chroma.game.phaseProgress, grid: window.chroma.game.grid, score: window.chroma.game.score }))
  const paused = await snapshot()
  // Verify absence of progression across real frames, not a mocked game.update.
  await page.evaluate(() => new Promise(resolve => {
    let frames = 0; const next = () => { if (++frames === 30) resolve(null); else requestAnimationFrame(next) }; requestAnimationFrame(next)
  }))
  expect(await snapshot()).toBe(paused)
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !window.chroma.game.busy)
  const moves = await page.evaluate(() => window.chroma.game.moves)
  const box = (await page.locator('#board').boundingBox())!, p = await page.evaluate(() => window.chroma.renderer.centreOf(0))
  await page.mouse.move(box.x + p.x, box.y + p.y); await page.mouse.down()
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.mouse.move(box.x + p.x + 60, box.y + p.y); await page.mouse.up()
  expect(await page.evaluate(() => window.chroma.game.moves)).toBe(moves)
  expect(await page.evaluate(() => window.chroma.game.held)).toBeNull()
})

test('impact has no board translation and every live score stays inside the canvas', async ({ page }, info) => {
  await start(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const result = await page.evaluate(() => {
    const { renderer, game, effects } = window.chroma
    const canvas = document.getElementById('board') as HTMLCanvasElement, ctx = canvas.getContext('2d')!
    renderer.hit(1)
    let impact: number[] = []
    renderer.draw(game, { draw(c: CanvasRenderingContext2D) { const m = c.getTransform(); impact = [m.e, m.f] } } as typeof effects, .08)
    const scores: { left: number; right: number; top: number; bottom: number }[] = []
    const original = ctx.strokeText
    ctx.strokeText = function(text, x, y, ...args) {
      const m = this.getTransform(), measure = this.measureText(text), halo = this.lineWidth / 2
      scores.push({ left: m.e + (x - measure.actualBoundingBoxLeft - halo) * m.a,
        right: m.e + (x + measure.actualBoundingBoxRight + halo) * m.a,
        top: m.f + (y - measure.actualBoundingBoxAscent - halo) * m.d,
        bottom: m.f + (y + measure.actualBoundingBoxDescent + halo) * m.d })
      return original.call(this, text, x, y, ...args)
    }
    try {
      effects.clear()
      for (const [x, y] of [[0, 0], [canvas.clientWidth, 0], [0, canvas.clientHeight], [canvas.clientWidth, canvas.clientHeight]]) effects.float(x!, y!, '+123456', '#fff', 1.35)
      effects.update(.4); renderer.draw(game, effects, .18)
    } finally { ctx.strokeText = original }
    return { impact, scores, width: canvas.width, height: canvas.height }
  })
  expect(result.impact).toEqual([0, 0])
  expect(result.scores).toHaveLength(4)
  for (const score of result.scores) {
    expect(score.left).toBeGreaterThanOrEqual(0); expect(score.top).toBeGreaterThanOrEqual(0)
    expect(score.right).toBeLessThanOrEqual(result.width); expect(score.bottom).toBeLessThanOrEqual(result.height)
  }
  await page.screenshot({ path: info.outputPath('bounded-scores.png') })
})

test('viewport changes clear stale pixel effects but never alter the puzzle or accept a busy-start gesture', async ({ page }) => {
  await start(page)
  const before = await page.evaluate(() => {
    window.chroma.effects.float(800, 600, '+400', '#fff')
    return JSON.stringify({ grid: window.chroma.game.grid, moves: window.chroma.game.moves })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.evaluate(() => window.chroma.effects.counts.texts)).toBe(0)
  expect(await page.evaluate(() => JSON.stringify({ grid: window.chroma.game.grid, moves: window.chroma.game.moves }))).toBe(before)
  await page.evaluate(() => { const { a, b } = window.chroma.best()!; window.chroma.game.drag(a, b) })
  const box = (await page.locator('#board').boundingBox())!, p = await page.evaluate(() => window.chroma.renderer.centreOf(0))
  await page.mouse.move(box.x + p.x, box.y + p.y); await page.mouse.down()
  await page.waitForFunction(() => !window.chroma.game.busy)
  await page.mouse.move(box.x + p.x + 60, box.y + p.y); await page.mouse.up()
  expect(await page.evaluate(() => window.chroma.game.moves)).toBe(24)
})

test('ending during an accepted move banks its settled score once and still verifies', async ({ page }) => {
  await start(page)
  await page.evaluate(() => { const { a, b } = window.chroma.best()!; window.chroma.game.drag(a, b) })
  await page.locator('#pause').click()
  await page.locator('#paused-end').click()
  await expect(page.locator('#overlay')).toBeVisible()
  const result = await page.evaluate(async () => {
    const { recordOf, verifyRun } = await import('/src/game/replay.ts')
    const record = recordOf(window.chroma.game)
    return { status: window.chroma.game.status, actions: window.chroma.game.log.length, verdict: verifyRun(record, window.chroma.game.geom) }
  })
  expect(result.status).toBe('gameOver'); expect(result.actions).toBe(1)
  expect(result.verdict.ok && result.verdict.claimMatches).toBe(true)
  await expect(page.locator('#paused')).toBeHidden()
  await expect(page.locator('#overlay-action')).toBeFocused()
})

test('visible viewport height and safe-area-like insets preserve the run and footer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await start(page)
  const before = await page.evaluate(() => JSON.stringify(window.chroma.game.grid))
  // Controlled browser-chrome geometry, not a claim of physical-device testing.
  await page.evaluate(() => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: { height: 650, scale: 1 } })
    window.dispatchEvent(new Event('resize'))
  })
  await expect.poll(() => page.locator('html').evaluate(e => e.style.getPropertyValue('--play-height'))).toBe('650px')
  await page.addStyleTag({ content: '.app:has(.game:not([hidden])) { padding-top: 28px; padding-bottom: 34px; }' })
  await expect.poll(async () => { const r = (await page.locator('#pause').boundingBox())!; return r.y + r.height <= 650 - 34 }).toBe(true)
  expect(await page.evaluate(() => JSON.stringify(window.chroma.game.grid))).toBe(before)
  await page.evaluate(() => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: { height: 325, scale: 2 } })
    window.dispatchEvent(new Event('resize'))
  })
  await expect.poll(() => page.locator('html').evaluate(e => e.style.getPropertyValue('--play-height'))).toBe('844px')
  expect(await page.evaluate(() => JSON.stringify(window.chroma.game.grid))).toBe(before)
})

test('touch emulation swaps once without page panning or losing the board frame', async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  try {
    const page = await context.newPage(); await start(page)
    const box = (await page.locator('#board').boundingBox())!
    const { a, b } = await page.evaluate(() => window.chroma.best()!)
    const points = await page.evaluate(({ a, b }) => [window.chroma.renderer.centreOf(a), window.chroma.renderer.centreOf(b)], { a, b })
    const cdp = await context.newCDPSession(page)
    const touch = (i: number) => [{ x: box.x + points[i]!.x, y: box.y + points[i]!.y, id: 1 }]
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touch(0) })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touch(1) })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForFunction(() => !window.chroma.game.busy)
    expect(await page.evaluate(() => window.chroma.game.moves)).toBe(24)
    expect(await page.evaluate(() => scrollY)).toBe(0)
    expect(await page.locator('#board').boundingBox()).toEqual(box)
    await page.screenshot({ path: info.outputPath('touch-game.png') })
  } finally { await context.close() }
})

test('every goal type, large counts and translated item instructions stay inside their slots', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await start(page)
  const failures: unknown[] = []
  for (const [width, height] of [[320, 568], [480, 320], [568, 320], [1280, 800]]) {
    await page.setViewportSize({ width: width!, height: height! })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const rows = await page.evaluate(async () => {
      const { Hud } = await import('/src/ui/hud.ts')
      const { setLanguage, t } = await import('/src/i18n/index.ts')
      const { setSkin, SKINS } = await import('/src/render/skins/index.ts')
      const hud = new Hud(), rows = []
      const bounds = (id: string) => document.querySelector(id)!.getBoundingClientRect()
      const fits = (a: DOMRect, b: DOMRect) => a.left >= b.left - .05 && a.right <= b.right + .05 && a.top >= b.top - .05 && a.bottom <= b.bottom + .05
      const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      for (const skin of SKINS) for (const lang of ['en', 'ko', 'ja', 'zh-Hans'] as const) {
        setSkin(skin, false); setLanguage(lang); await settle()
        for (const goal of [
          { kind: 'score' as const, need: 99999 }, { kind: 'power' as const, need: 33 },
          ...Array.from({ length: 6 }, (_, colour) => ({ kind: 'colour' as const, colour, need: 333 })),
        ]) {
          // Content fixture only: do not change a real run's deterministic goal.
          hud.invalidate()
          hud.update({ ...window.chroma.game, goal, progress: 0, need: goal.need, moves: 25, level: 999, seed: 18, rules: 3 } as typeof window.chroma.game)
          await settle()
          const goalBox = bounds('.hud-goal'), label = document.getElementById('goal-text')!
          const range = document.createRange(); range.selectNodeContents(label)
          rows.push({ skin: skin.id, lang, goal, count: fits(bounds('#goal-remaining'), goalBox),
            countBounds: bounds('#goal-remaining').toJSON(), goalBounds: goalBox.toJSON(),
            label: Array.from(range.getClientRects()).every(r => fits(r, goalBox)),
            noOverflow: document.documentElement.scrollWidth <= innerWidth })
        }
        const hint = document.getElementById('items-hint')!
        const board = bounds('#board').toJSON()
        for (const key of ['itemHammerHint', 'itemRocketHint', 'itemBombHint', 'itemsHint'] as const) {
          hint.textContent = t(key); hint.hidden = false
          const range = document.createRange(); range.selectNodeContents(hint)
          rows.push({ skin: skin.id, lang, hint: key, fits: Array.from(range.getClientRects()).every(r => fits(r, hint.getBoundingClientRect())),
            boardStable: JSON.stringify(bounds('#board').toJSON()) === JSON.stringify(board) })
        }
        hint.hidden = true
      }
      return rows.filter(row => 'goal' in row ? !row.count || !row.label || !row.noOverflow : !row.fits || !row.boardStable)
    })
    failures.push(...rows.map(row => ({ width, height, ...row })))
  }
  await writeFile(info.outputPath('content-failures.json'), JSON.stringify(failures, null, 2))
  expect(failures.slice(0, 5), `${failures.length} failures; full evidence in content-failures.json`).toEqual([])
})

test('all profile reaction peaks keep the portrait ring inside its HUD allocation', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await start(page)
  const failures: unknown[] = []
  for (const [width, height] of [[320, 568], [390, 844], [430, 932], [480, 320], [568, 320], [844, 390], [1280, 800]]) {
    await page.setViewportSize({ width: width!, height: height! })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const rows = await page.evaluate(async () => {
      const { Hud } = await import('/src/ui/hud.ts'), hud = new Hud(), rows = []
      const face = document.querySelector('.hud-face')!, canvas = document.getElementById('hud-avatar')!
      const allocation = document.getElementById('hud-character')!.getBoundingClientRect()
      for (const reaction of ['pop', 'power', 'fusion', 'chain', 'clear'] as const) {
        hud.react(reaction, 20)
        const animation = face.getAnimations()[0]!
        animation.pause()
        const duration = Number(animation.effect!.getTiming().duration)
        for (let sample = 0; sample <= 20; sample++) {
          animation.currentTime = duration * sample / 20
          const r = canvas.getBoundingClientRect(), m = new DOMMatrix(getComputedStyle(face).transform)
          // The visible portrait/ring are circular. Rotation expands the
          // transparent square bounds, not the circle; measure its real radius.
          const radius = (canvas.clientWidth / 2 + 5) * Math.hypot(m.a, m.b)
          const x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2
          if (x - radius < allocation.left - .05 || x + radius > allocation.right + .05 || y - radius < 0 || y + radius > innerHeight) {
            rows.push({ reaction, sample, left: x - radius, right: x + radius, top: y - radius, allocation: { left: allocation.left, right: allocation.right } })
          }
        }
      }
      hud.reset(); return rows
    })
    failures.push(...rows.map(row => ({ width, height, ...row })))
  }
  await writeFile(info.outputPath('profile-failures.json'), JSON.stringify(failures, null, 2))
  expect(failures.slice(0, 5), `${failures.length} failures; full evidence in profile-failures.json`).toEqual([])
})

test('200-percent text tokens reflow messages without changing the puzzle or losing footer controls', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await start(page)
  const before = await page.evaluate(() => JSON.stringify(window.chroma.game.grid))
  await page.addStyleTag({ content: ':root { --text-xs:24px; --text-sm:28px; --text-md:28px; --text-lg:30px; --text-xl:36px; --text-2xl:44px; --text-3xl:60px; --text-4xl:92px; }' })
  for (const [width, height] of [[320, 568], [390, 844], [1280, 800]]) {
    await page.setViewportSize({ width: width!, height: height! })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const failures = await page.evaluate(async () => {
      const { setLanguage, t } = await import('/src/i18n/index.ts')
      const failures = [], bounds = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
      const fits = (a: DOMRect, b: DOMRect) => a.left >= b.left - .05 && a.right <= b.right + .05 && a.top >= b.top - .05 && a.bottom <= b.bottom + .05
      for (const lang of ['en', 'ko', 'ja', 'zh-Hans'] as const) {
        setLanguage(lang)
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        for (const kind of ['cross', 'wideCross', 'megaBomb', 'prismStripe', 'prismBomb', 'prismPair'] as const) {
          window.chroma.combo.reportFusion(kind)
          if (!fits(bounds('#combo'), bounds('.game-feedback'))) failures.push({ lang, kind, badge: bounds('#combo').toJSON(), lane: bounds('.game-feedback').toJSON() })
        }
        const hint = document.getElementById('items-hint')!
        for (const key of ['itemHammerHint', 'itemRocketHint', 'itemBombHint', 'itemsHint'] as const) {
          hint.hidden = false; hint.textContent = t(key)
          const range = document.createRange(); range.selectNodeContents(hint)
          if (!Array.from(range.getClientRects()).every(r => fits(r, hint.getBoundingClientRect()))) failures.push({ lang, hint: key })
        }
        hint.hidden = true
      }
      return failures
    })
    expect(failures.slice(0, 3), `${width}×${height}, enlarged text`).toEqual([])
    await expect(page.locator('#pause')).toBeInViewport()
    expect(await page.locator('#items button:visible').evaluateAll(nodes => nodes.every(e => {
      const r = e.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
    }))).toBe(true)
    expect(await page.locator('.game .stage').evaluate(e => e.clientHeight)).toBeGreaterThanOrEqual(44)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await page.evaluate(() => JSON.stringify(window.chroma.game.grid))).toBe(before)
    await page.screenshot({ path: info.outputPath(`text-200-${width}.png`) })
  }
})

test('keyboard board focus stays inside its canvas rather than clipping at the scroller', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await start(page)
  for (const [width, height] of [[320, 568], [390, 844], [568, 320], [1280, 800]]) {
    await page.setViewportSize({ width: width!, height: height! })
    for (const skin of ['jewel', 'glass', 'paper']) {
      await page.evaluate(async skin => {
        const { setSkin, skinById } = await import('/src/render/skins/index.ts')
        setSkin(skinById(skin)!, false)
      }, skin)
      await page.locator('#pause').focus(); await page.keyboard.press('Shift+Tab')
      // Shift+Tab from Exit may first visit the enabled board scroll control.
      for (let i = 0; i < 3 && !await page.locator('#board').evaluate(e => e === document.activeElement); i++) await page.keyboard.press('Shift+Tab')
      await expect(page.locator('#board')).toBeFocused()
      const focus = await page.locator('#board').evaluate(e => {
        const css = getComputedStyle(e)
        return { visible: e.matches(':focus-visible'), width: parseFloat(css.outlineWidth), offset: parseFloat(css.outlineOffset), style: css.outlineStyle }
      })
      expect(focus.visible).toBe(true); expect(focus.width).toBeGreaterThanOrEqual(2)
      expect(focus.width + focus.offset).toBeLessThanOrEqual(0)
      expect(focus.style).toBe('solid')
    }
    await page.screenshot({ path: info.outputPath(`keyboard-focus-${width}.png`) })
  }
  expect(await page.evaluate(() => window.chroma.game.moves)).toBe(25)
})
