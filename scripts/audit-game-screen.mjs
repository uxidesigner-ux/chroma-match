import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Isolated guest diagnostics: no account access, remote writes or game-rule edits.
const url = process.argv[2] ?? 'http://127.0.0.1:5174/'
const output = resolve(process.argv[3] ?? 'test-results/game-audit')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] })
const samples = [
  [320, 568, 'jewel', 'zh-Hans'], [360, 640, 'glass', 'ja'],
  [390, 844, 'paper', 'ko'], [430, 932, 'jewel', 'en'],
  [568, 320, 'paper', 'ko'], [740, 360, 'glass', 'en'],
  [844, 390, 'jewel', 'en'], [720, 720, 'paper', 'ja'],
  [900, 720, 'glass', 'zh-Hans'], [1280, 800, 'jewel', 'en'],
]
const results = []
try {
  for (const [width, height, skin, lang] of samples) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' })
    await context.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com|seed-san\.vrm/, route => route.abort())
    await context.addInitScript(({ skin, lang }) => {
      localStorage.setItem('chroma.skin', skin)
      localStorage.setItem('chroma-match:lang', lang)
    }, { skin, lang })
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${url}?seed=i`)
    // The deliberately blocked 3D load settles boot quickly. Do not race the
    // automatically disappearing Skip control with a queued click.
    await page.locator('#splash').waitFor({ state: 'hidden' })
    if (await page.locator('#overlay-action').isVisible()) await page.locator('#overlay-action').click()
    await page.locator('#start-game').click()
    await page.locator('#loadout-start').click()
    await page.locator('#board').waitFor({ state: 'visible' })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const metrics = await page.evaluate(async () => {
      const box = selector => {
        const e = document.querySelector(selector), r = e.getBoundingClientRect()
        return { x: r.x, y: r.y, width: r.width, height: r.height, scroll: e.scrollHeight, client: e.clientHeight }
      }
      const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const before = box('#board'), hint = document.getElementById('items-hint')
      const originalHidden = hint.hidden
      hint.hidden = true; await settle(); const withoutHint = box('#board')
      hint.hidden = false; await settle(); const withHint = box('#board')
      hint.hidden = originalHidden
      let impactTransform = null, floats = []
      if (window.chroma) {
        window.chroma.combo.report(6)
        const ctx = document.getElementById('board').getContext('2d'), stroke = ctx.strokeText
        ctx.strokeText = function(text, x, y, ...args) {
          const m = this.getTransform(), metrics = this.measureText(text)
          floats.push({ text, x: m.e + x * m.a, y: m.f + y * m.d,
            halfWidth: metrics.width * m.a / 2, halfHeight: 16 * m.d })
          return stroke.call(this, text, x, y, ...args)
        }
        const ink = getComputedStyle(document.documentElement).getPropertyValue('--text').trim()
        window.chroma.effects.float(10, 8, '+123456', ink, 1.35)
        window.chroma.effects.update(.4)
        window.chroma.renderer.draw(window.chroma.game, window.chroma.effects, 0)
        ctx.strokeText = stroke
        // Record board-space transform at the effects boundary, without inventing
        // a viewport transform. Normal-motion hit must not change hit-test space.
      }
      await settle()
      return { before, withoutHint, withHint, stage: box('.game .stage'), hud: box('.game-hud'),
        combo: box('#combo'), items: box('#items'), game: box('#screen-game'),
        htmlOverflow: document.documentElement.scrollWidth > innerWidth,
        pageScroll: scrollY, bodyHeight: document.documentElement.scrollHeight,
        cell: window.chroma?.renderer.cellSize, floats, impactTransform }
    })
    const name = `${width}x${height}-${skin}-${lang}`
    await page.screenshot({ path: resolve(output, `${name}.png`) })
    if (width === 1280 && await page.evaluate(() => Boolean(window.chroma))) {
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      metrics.impactTransform = await page.evaluate(() => {
        const { renderer, game } = window.chroma
        renderer.hit(1)
        let matrix
        renderer.draw(game, { draw(ctx) { const m = ctx.getTransform(); matrix = [m.a, m.d, m.e, m.f] } }, .08)
        return matrix
      })
    }
    results.push({ width, height, skin, lang, errors, ...metrics })
    console.log(JSON.stringify(results.at(-1)))
    await context.close()
  }
} finally { await browser.close() }
await writeFile(resolve(output, 'audit.json'), JSON.stringify({ url, results }, null, 2))
