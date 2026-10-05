import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com|seed-san\.vrm/, route => route.abort())
await page.addInitScript(() => {
  localStorage.setItem('chroma-match:lang', 'ko')
  localStorage.setItem('chroma-match:granted', '1')
  localStorage.setItem('chroma.skin', 'paper')
})
const errors = []
page.on('pageerror', e => errors.push(e.message))
await mkdir('test-results/world-inspect', { recursive: true })
await page.goto(process.env.WORLD_URL ?? 'http://127.0.0.1:5181/')
await page.locator('#splash').waitFor({ state: 'hidden' })
console.log(await page.locator('#screen-map').innerText())
for (const [width, height] of [[390, 844], [320, 568], [844, 390], [720, 720], [1280, 800]]) {
  await page.setViewportSize({ width, height })
  await page.screenshot({ path: `test-results/world-inspect/map-${width}x${height}.png` })
  console.log({ width, height, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) })
}
await page.locator('[data-region="volcano"]').click()
console.log('locked:', await page.locator('#world-note').innerText(), 'disabled:', await page.locator('#world-play').isDisabled())
await page.locator('[data-region="forest"]').click()
await page.locator('#world-play').click()
await page.locator('#loadout-start').click()
await page.locator('#screen-game').waitFor({ state: 'visible' })
console.log('game:', await page.locator('#level').innerText(), await page.locator('#goal-remaining').innerText())
console.log('errors:', errors)
await browser.close()
