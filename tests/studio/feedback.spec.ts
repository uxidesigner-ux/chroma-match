import { expect, test } from '@playwright/test'
import type { Game } from '../../src/game/game.ts'
import type { Effects } from '../../src/render/particles.ts'
import type { Renderer } from '../../src/render/renderer.ts'
import type { ComboMeter } from '../../src/ui/combo.ts'
import type { Overlay } from '../../src/ui/overlay.ts'

declare global {
  interface Window {
    chroma: {
      game: Game; effects: Effects; renderer: Renderer; combo: ComboMeter; overlay: Overlay
      best: () => { a: number; b: number } | null
    }
  }
}

test.beforeEach(async ({ page }) => {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, (route) => route.abort())
  // URLs encode seeds in base 36: "i" is decimal 18.
  await page.goto('/?seed=i')
  if (await page.locator('#overlay-action').isVisible()) await page.locator('#overlay-action').click()
  await page.locator('#start-game').click()
  await page.locator('#loadout-start').click()
  await expect(page.locator('#board')).toBeVisible()
})

test('legacy legal moves reach a six-chain and clear; score/CTA are immediately available', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const max = await page.evaluate(() => {
    const { game, best, effects } = window.chroma
    // Pin the original animation regression; current-rule fusions have their own suite.
    game.restart(18, 1)
    let heat = 0
    for (let move = 0; move < 20 && game.status === 'playing'; move++) {
      const next = best()!
      game.drag(next.a, next.b)
      for (let frame = 0; frame < 2000 && game.phaseKind !== 'idle'; frame++) {
        game.update(1 / 60)
        effects.update(1 / 60)
        heat = Math.max(heat, Number(document.getElementById('combo')!.dataset.heat ?? 0))
      }
    }
    return { heat, score: game.score, status: game.status }
  })
  expect(max).toEqual({ heat: 3, score: 1800, status: 'levelComplete' })
  await expect(page.locator('#overlay')).toHaveAttribute('data-celebration', 'clear')
  await expect(page.locator('#overlay-victory')).toBeVisible()
  await expect(page.locator('#overlay-hero-value')).not.toBeEmpty()
  await expect(page.locator('#overlay-action')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#overlay')).toBeHidden()
  expect(await page.evaluate(() => window.chroma.game.level)).toBe(2)
  expect(await page.evaluate(() => performance.getEntriesByType('resource').some(r => r.name.endsWith('.vrm')))).toBe(false)
  expect(errors).toEqual([])
})

test('OS reduced motion changes mid-run; all new decorative motion stops', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.evaluate(() => {
    const { effects, combo } = window.chroma
    effects.burst(100, 100, '#fff', 30)
    effects.impact(100, 100, '#fff', 25)
    combo.report(6)
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const counts = await page.evaluate(() => {
    const { effects, combo } = window.chroma
    effects.update(0.016)
    effects.burst(100, 100, '#fff')
    effects.impact(100, 100, '#fff', 25)
    effects.float(100, 100, '+100', '#fff')
    combo.report(6)
    window.chroma.overlay.show({ kicker: 'Clear', title: 'Level complete', body: '', action: 'Next', onAction() {}, celebration: 'clear' })
    return effects.counts
  })
  expect(counts).toEqual({ particles: 0, impacts: 0, texts: 1 })
  expect(await page.locator('#combo-avatar').evaluate(e => getComputedStyle(e).animationName)).toBe('none')
  expect(await page.locator('#victory-avatar').evaluate(e => getComputedStyle(e).animationName)).toBe('none')
  await expect(page.locator('.victory-confetti')).toBeHidden()
  await expect(page.locator('#overlay-action')).toBeFocused()
})

for (const sample of [
  { skin: 'jewel', lang: 'en', width: 1280, height: 800 },
  { skin: 'paper', lang: 'ko', width: 390, height: 844 },
  { skin: 'glass', lang: 'ja', width: 360, height: 740 },
  { skin: 'jewel', lang: 'zh-Hans', width: 320, height: 568 },
]) {
  test(`feedback fits ${sample.skin}/${sample.lang} at ${sample.width}px without shrinking board`, async ({ page }) => {
    await page.setViewportSize(sample)
    await page.evaluate(({ lang, skin }) => {
      localStorage.setItem('chroma-match:lang', lang)
      localStorage.setItem('chroma.skin', skin)
    }, sample)
    await page.reload()
    await page.locator('#start-game').click()
    await page.locator('#loadout-start').click()
    const before = await page.locator('#board').boundingBox()
    await page.evaluate(() => window.chroma.combo.report(6))
    await expect(page.locator('#combo-avatar')).toBeVisible()
    const badge = (await page.locator('#combo').boundingBox())!
    expect(badge.x).toBeGreaterThanOrEqual(0)
    expect(badge.x + badge.width).toBeLessThanOrEqual(sample.width)
    expect(await page.locator('#board').boundingBox()).toEqual(before)
    const content = { kicker: 'Clear', title: 'Level complete', body: 'Ready for the next stage?', action: 'Next' }
    await page.evaluate(content => window.chroma.overlay.show({ ...content, celebration: 'clear', onAction() {} }), content)
    await expect(page.locator('#overlay-action')).toBeInViewport()
    await page.locator('#overlay-action').click()
    await page.evaluate(content => window.chroma.overlay.show({ ...content, onAction() {} }), content)
    await expect(page.locator('#overlay-victory')).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
