import { expect, test } from '@playwright/test'
import { enterLobby } from './boot.ts'

test.beforeEach(async ({ page }) => {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.addInitScript(() => {
    localStorage.setItem('chroma-match:lang', 'ko')
    localStorage.setItem('chroma.skin', 'paper')
  })
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
  for (const [label, glyph] of [['설정', 'gear'], ['게임 방법', 'help']]) {
    const button = page.getByRole('button', { name: label, exact: true })
    await expect(button).toHaveText('')
    await expect(button.locator(`.hud-ico.hud-ico-${glyph}`)).toHaveCount(1)
  }
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
  await expect(page.locator('.lobby-head .quick')).toHaveCount(1)
  const nav = await page.locator('.home .quick-btn').evaluateAll(nodes =>
    nodes.map(node => {
      const box = node.getBoundingClientRect()
      return { width: box.width, height: box.height, top: box.top }
    }),
  )
  expect(nav).toHaveLength(3)
  expect(Math.max(...nav.map(b => b.width)) - Math.min(...nav.map(b => b.width))).toBeLessThan(1)
  expect(Math.max(...nav.map(b => b.height)) - Math.min(...nav.map(b => b.height))).toBeLessThan(1)
  const head = (await page.locator('.lobby-head').boundingBox())!
  const stage = (await page.locator('#lobby-stage').boundingBox())!
  const navBox = (await page.locator('.home .quick').boundingBox())!
  const play = (await page.locator('.lobby-play').boundingBox())!
  expect(navBox.y).toBeGreaterThanOrEqual(head.y - 1)
  expect(navBox.y + navBox.height).toBeLessThanOrEqual(head.y + head.height + 2)
  expect(navBox.y).toBeLessThan(stage.y)
  expect(play.y).toBeGreaterThan(stage.y + stage.height - 8)
  const name = (await page.locator('#profile-name').boundingBox())!
  const coins = (await page.locator('.profile-wallet').boundingBox())!
  expect(coins.y).toBeGreaterThan(name.y)
  const edit = (await page.locator('#lobby-edit').boundingBox())!
  const tools = (await page.locator('#lobby-tools').boundingBox())!
  expect(edit.x).toBeGreaterThan(stage.x + stage.width / 2)
  expect(edit.y).toBeGreaterThan(stage.y + stage.height / 2)
  expect(Math.abs((edit.y + edit.height) - (tools.y + tools.height))).toBeLessThan(8)
  await expect(page.locator('#lobby-hint-fine')).toContainText('Home')
  await expect(page.locator('#lobby-hint-coarse')).toHaveText('드래그해서 회전')
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
  const [continueBg, startBg, pageBg] = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.background = 'var(--bg)'
    document.body.append(probe)
    const pageFill = getComputedStyle(probe).backgroundColor
    probe.remove()
    return [
      getComputedStyle(document.getElementById('continue-run')!).backgroundColor,
      getComputedStyle(document.getElementById('start-game')!).backgroundColor,
      pageFill,
    ]
  })
  expect(startBg).not.toBe(continueBg)
  expect(startBg).not.toBe(pageBg)
  // The kept run is the stronger offer and takes the wider half. Both sat at
  // flex: 1, so the row read as two equal choices and the whole hierarchy
  // rested on that background difference.
  expect(continueBox.width).toBeGreaterThan(startBox.width * 1.3)
  expect(Math.abs(continueBox.y - startBox.y)).toBeLessThan(2)
  expect(Math.abs(continueBox.height - startBox.height)).toBeLessThan(2)
  expect(startBox.x).toBeGreaterThan(continueBox.x + continueBox.width - 1)
})

test('lobby and studio chrome hold a 44px target on narrow phones, and the studio follows the skin', async ({ page }) => {
  // The suite runs on the Paper skin, so the studio's own colours are the test:
  // it used to paint itself from hardcoded navy and stayed dark while the rest
  // of the app turned to paper.
  for (const [width, height] of [[360, 780], [320, 568], [390, 844]]) {
    await page.setViewportSize({ width: width!, height: height! })
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true)
    const chrome = page.locator('.lobby-head .quick-btn, .lobby-head .circle-button, #lobby-edit, #lobby-tools button')
    for (const button of await chrome.all()) {
      const box = (await button.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('#lobby-edit').click()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')

  for (const button of await page.locator('.studio-hud button').all()) {
    const box = (await button.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }

  // Every tab names itself; the equipment that used to hide behind the hair
  // glyph is a destination of its own.
  await expect(page.getByRole('tab')).toHaveCount(7)
  for (const name of ['스타일', '체형', '헤어', '장비', '색상', '표정', '보관함']) {
    await expect(page.getByRole('tab', { name, exact: true })).toHaveText(name)
  }
  await page.getByRole('tab', { name: '장비', exact: true }).click()
  await expect(page.getByRole('button', { name: '배낭', exact: true })).toHaveText('배낭')

  // The stage HUD takes its scrim from the page, not from a constant.
  const stageInk = await page.locator('.studio-stage').evaluate(
    node => getComputedStyle(node).backgroundColor,
  )
  const pageInk = await page.evaluate(
    () => getComputedStyle(document.documentElement).getPropertyValue('--panel-strong').trim(),
  )
  expect(stageInk).not.toBe('rgb(32, 44, 61)')
  expect(pageInk).not.toBe('')

  // Paper hangs a hard offset shadow off the buttons; the scroll box has to
  // leave room for it rather than slicing it at the edge. That box is the
  // options inside the sheet now — the screen itself no longer scrolls.
  const overflow = await page.locator('.studio-options').evaluate(node => ({
    scroll: node.scrollWidth,
    client: node.clientWidth,
    pad: getComputedStyle(node).paddingRight,
  }))
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client)
  expect(parseFloat(overflow.pad)).toBeGreaterThanOrEqual(8)
})

test('accent chips clear WCAG AA on every skin, and the discard prompt is a real modal', async ({ page }) => {
  const contrast = (a: string, b: string) => {
    const rgb = (c: string) => c.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number)
    const lum = (c: string) =>
      rgb(c)
        .map(v => (v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
        .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i]!, 0)
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
    return (hi! + 0.05) / (lo! + 0.05)
  }

  // Every skin puts a light colour in --accent, so the white that used to sit
  // on these chips scored between 1.67:1 and 2.14:1.
  for (const skin of ['jewel', 'glass', 'paper']) {
    await page.goto(`/?seed=3&skin=${skin}`)
    await enterLobby(page)
    const pair = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement)
      const probe = document.createElement('span')
      probe.className = 'quick-badge'
      document.body.append(probe)
      const style = getComputedStyle(probe)
      const read = { fg: style.color, bg: style.backgroundColor }
      probe.remove()
      return { ...read, onAccent: root.getPropertyValue('--on-accent').trim() }
    })
    expect(pair.onAccent).not.toBe('')
    expect(contrast(pair.fg, pair.bg)).toBeGreaterThanOrEqual(4.5)
  }
  await page.goto('/?seed=3')
  await enterLobby(page)

  // Nothing under 11px, and the scale is tokens rather than literals.
  const tiny = await page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .map(n => parseFloat(getComputedStyle(n).fontSize))
      .filter(px => px > 0 && px < 11).length,
  )
  expect(tiny).toBe(0)

  // Gestures lie across the stage instead of stacking down one edge.
  const stage = (await page.locator('#lobby-stage').boundingBox())!
  const tools = (await page.locator('#lobby-tools').boundingBox())!
  expect(tools.width).toBeGreaterThan(tools.height)
  expect(tools.height / stage.height).toBeLessThan(0.35)

  await page.locator('#lobby-edit').click()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')

  /*
   * Everything that drives the preview sits on the preview. Direction spent a
   * while on a row of its own underneath, which cost a line of the screen and
   * put the controls further from the thing they turn; it is back in the corner
   * the model's name used to hold, and nothing is left below the stage.
   */
  expect(await page.locator('.studio-hud button').count()).toBe(10)
  await expect(page.locator('.studio-below-stage')).toHaveCount(0)
  for (const name of ['정면', '측면', '후면'])
    await expect(page.locator('.studio-hud').getByRole('button', { name, exact: true })).toBeVisible()
  // The rotate hint no longer takes a line under the preview, but it is still
  // what the canvas points at, so the description survives the tidy-up.
  await expect(page.locator('.studio-stage canvas')).toHaveAttribute('aria-describedby', 'studio-rotate-help')
  await expect(page.locator('#studio-rotate-help')).toHaveClass(/sr-only/)

  await expect(page.locator('#creator-actions .studio-apply')).toBeVisible()
  await page.getByRole('button', { name: '랜덤 스타일', exact: true }).click()
  await page.locator('#creator-back').click()
  const dialog = page.locator('dialog.studio-discard')
  await expect(dialog).toBeVisible()
  expect(await dialog.evaluate(node => node.matches(':modal'))).toBe(true)
  expect(await page.evaluate(() =>
    document.querySelector('dialog.studio-discard')!.contains(document.activeElement),
  )).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
})

test('the paper skin\'s shadows and the mission badge survive the scroll box', async ({ page }) => {
  // `overflow-y: auto` clips on both axes. The first pass at this only padded
  // the inline one, so the Play row's 4px drop shadow was sliced off the
  // bottom and the mission count — pinned 3px above its nav button — off the
  // top, on any width where the header does not wrap to two rows.
  for (const width of [360, 390, 430, 620]) {
    await page.setViewportSize({ width, height: 844 })
    const fit = await page.evaluate(() => {
      const home = document.querySelector('.home') as HTMLElement
      const badge = document.getElementById('today-summary-badge')!
      badge.hidden = false
      badge.textContent = '3'
      // Overflow clips at the padding box, so that — not the content edge — is
      // the line both of these have to stay inside. The padding is the room.
      const box = home.getBoundingClientRect()
      const shadow = getComputedStyle(document.getElementById('start-game')!).boxShadow
      const drop = Number(shadow.match(/(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px/)?.[2] ?? 0)
      const play = document.querySelector('.lobby-play')!.getBoundingClientRect()
      const mark = badge.getBoundingClientRect()
      badge.hidden = true
      return {
        badgeAbove: +(box.top - mark.top).toFixed(1),
        shadowBelow: +(play.bottom + drop - box.bottom).toFixed(1),
      }
    })
    expect(fit.badgeAbove, `badge clipped at ${width}px`).toBeLessThanOrEqual(0)
    expect(fit.shadowBelow, `play shadow clipped at ${width}px`).toBeLessThanOrEqual(0)
  }
})

test('the skin reaches the status bar before the first paint', async ({ page }) => {
  // The module that applies the remembered skin is deferred behind the whole
  // import graph; until it ran, the browser tinted the standalone window's
  // chrome from index.html's near-black default while the Paper page came up
  // cream, which reads as black bands at the top and bottom of the screen.
  await page.addInitScript(() => localStorage.setItem('chroma.skin', 'paper'))
  await page.goto('/?seed=3')
  const early = await page.evaluate(() => ({
    skin: document.documentElement.dataset.skin,
    theme: document.querySelector('meta[name="theme-color"]')!.getAttribute('content'),
    bg: document.documentElement.style.getPropertyValue('--bg'),
  }))
  expect(early.skin).toBe('paper')
  expect(early.theme?.toLowerCase()).toBe('#f2ecde')
  expect(early.bg.toLowerCase()).toBe('#f2ecde')
})
