import { chromium } from 'playwright'
import { existsSync } from 'fs'

const executablePath =
  process.env.PW_CHROME ||
  [
    '/opt/pw-browsers/chromium',
    '/home/ubuntu/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
  ].find((p) => existsSync(p))

const browser = await chromium.launch({
  executablePath,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({
  viewport: { width: Number(process.env.W || 1600), height: Number(process.env.H || 1100) },
  deviceScaleFactor: Number(process.env.DPR || 2),
})
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 400)))
await page.goto(process.argv[2], { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__viewsReady === true', undefined, {
  timeout: Number(process.env.TMO || 120000),
})
if (process.argv[3]) await page.screenshot({ path: process.argv[3], fullPage: true })
await browser.close()
