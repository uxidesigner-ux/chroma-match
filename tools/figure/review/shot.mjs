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
  viewport: { width: Number(process.env.W || 1600), height: Number(process.env.H || 1000) },
  deviceScaleFactor: Number(process.env.DPR || 2),
})
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 400)))
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('CONSOLE', msg.text().slice(0, 400))
})

await page.goto(process.argv[2], { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__pageLoaded === true', undefined, {
  timeout: Number(process.env.TMO || 120000),
})
await page.waitForFunction('window.__modelReady === true', undefined, {
  timeout: Number(process.env.TMO || 120000),
})

const ref = process.env.REF
if (ref) {
  if (!existsSync(ref)) {
    console.log('REF_MISSING', ref)
    await browser.close()
    process.exit(2)
  }
  await page.setInputFiles('#original-file', ref)
  await page.waitForFunction('window.__compareReady === true', undefined, {
    timeout: Number(process.env.TMO || 120000),
  })
} else if (process.env.REQUIRE_COMPARE === '1') {
  console.log('COMPARE_NOT_READY original not provided; not treating model-ready as comparison-ready')
  const dump = await page.evaluate('JSON.stringify(window.__dump)')
  console.log('DUMP', dump)
  if (process.argv[3]) await page.screenshot({ path: process.argv[3], fullPage: true })
  await browser.close()
  process.exit(3)
}

if (process.env.DUMP) console.log(await page.evaluate('JSON.stringify(window.__dump, null, 2)'))
if (process.argv[3]) await page.screenshot({ path: process.argv[3], fullPage: true })
await browser.close()
