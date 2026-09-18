import { chromium } from 'playwright'

const executablePath =
  process.env.PW_CHROME ||
  [
    '/opt/pw-browsers/chromium',
    '/home/ubuntu/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
  ].find((p) => {
    try {
      return require('fs').existsSync(p)
    } catch {
      return false
    }
  })

const browser = await chromium.launch({
  executablePath,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({
  viewport: { width: Number(process.env.W || 1400), height: Number(process.env.H || 1100) },
  deviceScaleFactor: Number(process.env.DPR || 2),
})
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 400)))
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('CONSOLE', msg.text().slice(0, 400))
})
await page.goto(process.argv[2], { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__ready === true', undefined, {
  timeout: Number(process.env.TMO || 900000),
})
if (process.env.DUMP) console.log(await page.evaluate('window.__dump ?? ""'))
if (process.argv[3]) await page.screenshot({ path: process.argv[3], fullPage: true })
await browser.close()
