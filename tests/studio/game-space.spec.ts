import { expect, test, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { enterLobby } from './boot.ts'

async function start(page: Page) {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com|seed-san\.vrm/, route => route.abort())
  await page.addInitScript(() => localStorage.setItem('chroma-match:lang', 'ko'))
  await page.goto('/?seed=i&skin=paper'); await enterLobby(page)
  await page.locator('#start-game').click(); await page.locator('[data-load="hammer"]').click()
  await page.locator('#loadout-start').click(); await expect(page.locator('#board')).toBeVisible()
}

test('phone status/tool allocation maximizes a complete nine-row board, in every theme and locale', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await start(page)
  // Reproduce the supplied screen's content, not a claim of a completed run.
  await page.evaluate(() => {
    const g = window.chroma.game
    g.level = 62; g.moves = 65; g.goal = { kind: 'score', need: 14000 }; g.need = 14000; g.progress = 0
  })
  const rows = []
  for (const [width, height] of [[390, 650], [390, 700], [390, 760], [390, 844], [430, 932]]) {
    await page.setViewportSize({ width: width!, height: height! })
    const result = await page.evaluate(async () => {
      const { setLanguage } = await import('/src/i18n/index.ts')
      const { setSkin, SKINS } = await import('/src/render/skins/index.ts')
      const rows = []
      for (const skin of SKINS) for (const lang of ['en', 'ko', 'ja', 'zh-Hans'] as const) {
        setSkin(skin, false); setLanguage(lang)
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        const stage = document.querySelector<HTMLElement>('.game .stage')!, b = document.getElementById('board')!.getBoundingClientRect()
        const s = stage.getBoundingClientRect(), face = document.querySelector('.hud-face')!.getBoundingClientRect()
        const buttons = [...document.querySelectorAll<HTMLElement>('#items button')].filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect())
        const gutter = stage.offsetWidth - stage.clientWidth
        const maximum = Math.min(s.width - gutter, s.height * 6 / 9)
        rows.push({ skin: skin.id, lang, board: b.toJSON(), stage: s.toJSON(), face: face.width,
          maximum, cell: window.chroma.renderer.cellSize, scrolls: stage.scrollHeight > stage.clientHeight + 2,
          guidanceReadable: getComputedStyle(document.getElementById('items-hint')!).color === getComputedStyle(document.getElementById('goal-text')!).color,
          toolsFit: buttons.every(r => r.width >= 44 && r.height >= 44 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight),
          toolsSeparate: buttons.every((r, i) => i === 0 || r.left >= buttons[i - 1]!.right + 4),
        })
      }
      return rows
    })
    for (const r of result) {
      const label = `${width}×${height}/${r.skin}/${r.lang}`
      expect(r.board.y, label).toBeGreaterThanOrEqual(r.stage.y)
      expect(r.board.bottom, label).toBeLessThanOrEqual(r.stage.bottom + .1)
      expect(r.scrolls, label).toBe(false)
      expect(r.board.width, label).toBeGreaterThanOrEqual(r.maximum - 1)
      expect(r.cell, label).toBeGreaterThanOrEqual(44)
      expect(r.face, label).toBeGreaterThanOrEqual(height! < 700 ? 64 : 80)
      expect(r.toolsFit && r.toolsSeparate, label).toBe(true)
      expect(r.guidanceReadable, label).toBe(true)
      // Old rendered widths: 280px at 700/760, 300.67px at 844.
      if (height === 760) expect(r.board.width, label).toBeGreaterThan(330)
      if (height === 844) expect(r.board.width, label).toBeGreaterThan(350)
    }
    rows.push({ width, height, result })
    await page.evaluate(async () => {
      const { setLanguage } = await import('/src/i18n/index.ts'), { setSkin, skinById } = await import('/src/render/skins/index.ts')
      setLanguage('ko'); setSkin(skinById('paper')!, false)
    })
    await page.screenshot({ path: info.outputPath(`paper-stage62-${width}x${height}.png`) })
  }
  await writeFile(info.outputPath('space-matrix.json'), JSON.stringify(rows, null, 2))
})

test('one feedback lane preserves arming, celebration priority and fixed targets', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 760 }); await page.emulateMedia({ reducedMotion: 'reduce' })
  await start(page)
  const before = await page.locator('#board').boundingBox()
  await expect(page.locator('#items-hint')).toBeVisible()
  const hintPriority = await page.evaluate(() => {
    window.chroma.combo.hide(); window.chroma.combo.fusionHint(true)
    return { kind: document.getElementById('combo')!.dataset.feedback, display: getComputedStyle(document.getElementById('combo')!).display }
  })
  expect(hintPriority).toEqual({ kind: 'hint', display: 'none' })
  await page.locator('[data-item="hammer"]').click()
  await expect(page.locator('#items-hint')).toBeVisible(); await expect(page.locator('#combo')).toBeHidden()
  expect(await page.locator('#board').boundingBox()).toEqual(before)
  await page.screenshot({ path: info.outputPath('item-in-shared-lane.png') })
  await page.evaluate(() => window.chroma.combo.report(6))
  await expect(page.locator('#combo')).toBeVisible(); await expect(page.locator('#items-hint')).toBeHidden()
  expect(await page.locator('#board').boundingBox()).toEqual(before)
  await expect(page.locator('#items-hint')).toBeVisible()
  expect(await page.locator('#board').boundingBox()).toEqual(before)
  const point = await page.evaluate(() => window.chroma.renderer.centreOf(12))
  await page.mouse.click(before!.x + point.x, before!.y + point.y)
  await expect(page.locator('[data-count="hammer"]')).toHaveText('3')
  await expect(page.locator('#items-hint')).toBeHidden()
  expect(await page.locator('#board').boundingBox()).toEqual(before)
})

test('browser-chrome offsets and classic gutter preserve full rows and matching hit geometry', async ({ page }, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: Object.assign(new EventTarget(), {
      offsetTop: 54, offsetLeft: 0, width: 390, height: 650, scale: 1,
    }) })
  })
  await page.setViewportSize({ width: 390, height: 844 }); await start(page)
  await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('.game .stage')!
    stage.style.paddingRight = `${Math.max(0, 17 - (stage.offsetWidth - stage.clientWidth))}px`
  })
  await expect.poll(() => page.evaluate(() => {
    const b = document.getElementById('board')!.getBoundingClientRect(), s = document.querySelector('.game .stage')!.getBoundingClientRect()
    return b.y >= s.y && b.bottom <= s.bottom + .1
  })).toBe(true)
  expect(await page.locator('.app').evaluate(e => e.getBoundingClientRect().height)).toBe(650)
  expect(await page.locator('.app').evaluate(e => e.getBoundingClientRect().top)).toBe(54)
  await expect.poll(() => page.evaluate(() => {
    const b = document.getElementById('board')!.getBoundingClientRect(), g = window.chroma.game.geom
    return Math.abs(window.chroma.renderer.cellSize - Math.min((Math.round(b.width) - 16) / g.cols, (Math.round(b.height) - 16) / g.rows))
  })).toBeLessThan(1e-9)
  await expect(page.locator('.board-scroll-hint')).toBeHidden()
  await page.screenshot({ path: info.outputPath('browser-chrome-gutter.png') })
})

test('viewport changes cancel a held gem before delayed resize events or shell frames', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await start(page)
  const move = await page.evaluate(() => window.chroma.best()!)
  const points = await page.evaluate(({ a, b }) => [window.chroma.renderer.centreOf(a), window.chroma.renderer.centreOf(b)], move)
  const board = (await page.locator('#board').boundingBox())!
  await page.mouse.move(board.x + points[0]!.x, board.y + points[0]!.y); await page.mouse.down()
  // Browser viewport dimensions can change before its resize event / RAF is
  // delivered. Hold the old DOM layout to expose that exact timing gap.
  await page.evaluate(() => Object.defineProperty(window, 'innerWidth', { configurable: true, value: innerWidth + 1 }))
  expect(await page.locator('#board').boundingBox()).toEqual(board)
  await page.mouse.move(board.x + points[1]!.x, board.y + points[1]!.y); await page.mouse.up()
  expect(await page.evaluate(() => window.chroma.game.moves)).toBe(25)
  expect(await page.evaluate(() => window.chroma.game.held)).toBeNull()
  await page.evaluate(() => delete (window as unknown as { innerWidth?: number }).innerWidth)
})
