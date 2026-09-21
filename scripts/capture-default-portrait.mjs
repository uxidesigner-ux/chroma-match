// Generates the bundled starter portrait from the licensed model, not a separate artwork.
// Run with the local Vite server available at PORTRAIT_URL (default :5173).
import { chromium } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] })
try {
  const context = await browser.newContext({ deviceScaleFactor: 1, reducedMotion: 'reduce' })
  await context.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  const page = await context.newPage()
  await page.goto(process.env.PORTRAIT_URL ?? 'http://127.0.0.1:5173/')
  const png = await page.evaluate(async () => {
    const { AnimeRenderer } = await import('/src/avatar/anime-renderer.ts')
    const { DEFAULT_ANIME } = await import('/src/avatar/anime-spec.ts')
    const renderer = new AnimeRenderer(document.createElement('canvas'))
    try {
      await renderer.load(DEFAULT_ANIME)
      return renderer.portrait()
    } finally { renderer.dispose() }
  })
  await writeFile(new URL('../public/avatars/seed-v1/default-portrait.png', import.meta.url),
    Buffer.from(png.split(',')[1], 'base64'))
  console.log('Generated default-portrait.png from DEFAULT_ANIME and Seed-san.')
} finally { await browser.close() }
