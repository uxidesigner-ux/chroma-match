import { test as base, expect, type Page } from '@playwright/test'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

interface TestOrigin { url: string; stop?: () => Promise<void> }
const test = base.extend<{ origin: TestOrigin }>({
  origin: async ({ baseURL, browserName }, use) => {
    if (browserName !== 'webkit') { await use({ url: baseURL! }); return }
    // WebKit's setOffline flag currently rejects even literal SW responses:
    // https://github.com/microsoft/playwright/issues/42775
    // A local origin that can be shut down tests real cache fallback instead.
    const upstream = new URL(baseURL!)
    const server = createServer(async (request, response) => {
      try {
        const asset = await fetch(new URL(request.url ?? '/', upstream))
        response.statusCode = asset.status
        for (const name of ['content-type', 'cache-control', 'etag', 'last-modified']) {
          const value = asset.headers.get(name); if (value) response.setHeader(name, value)
        }
        response.end(Buffer.from(await asset.arrayBuffer()))
      } catch { response.writeHead(502).end() }
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const local = new URL(upstream.pathname, `http://127.0.0.1:${(server.address() as AddressInfo).port}`)
    let stopped = false
    const stop = async (): Promise<void> => {
      if (stopped) return
      stopped = true
      await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections() })
    }
    try { await use({ url: local.href, stop }) } finally { await stop() }
  },
})

async function enterGame(page: Page): Promise<void> {
  const enter = page.locator('#home-enter')
  const play = page.locator('#home-play')
  await expect.poll(async () => await enter.isVisible() || await play.isVisible() || await page.locator('#board').isVisible()).toBe(true)
  if (await enter.isVisible()) { await enter.click(); await expect(play).toBeVisible() }
  if (await play.isVisible()) await play.click()
  await expect(page.locator('#board')).toBeVisible()
}

test('project-path assets, iPhone metadata and complete offline shell work', async ({ page, context, origin, browserName }) => {
  const errors: string[] = [], failed: string[] = [], external: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`) })
  page.on('request', request => { const url = new URL(request.url()); if (/^https?:$/.test(url.protocol) && url.origin !== new URL(origin.url).origin) external.push(url.href) })
  await page.goto(origin.url)
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes')
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/)
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifestHref).toContain('/chroma-match/')
  const manifest = await (await page.request.get(new URL(manifestHref!, origin.url).href)).json()
  expect(manifest.name).toContain('Chroma Royale')
  expect(manifest.display).toBe('standalone')
  expect(manifest.scope).toBe('./')
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.pwaOffline)).toBe('ready')
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  const cacheContents = await page.evaluate(async () => {
    const keys = await caches.keys(), own = keys.filter(key => key.startsWith('chroma-royale:/chroma-match/:'))
    const requests = await Promise.all(own.map(async key => (await (await caches.open(key)).keys()).map(request => request.url)))
    return { own, urls: requests.flat() }
  })
  expect(cacheContents.own.length).toBeGreaterThan(0)
  expect(cacheContents.urls.some(url => url.endsWith('/index.html'))).toBe(true)
  expect(cacheContents.urls.some(url => /\/assets\/.+\.js$/.test(url))).toBe(true)
  expect(cacheContents.urls.some(url => url.includes('/royal/'))).toBe(true)
  expect(cacheContents.urls.some(url => url.endsWith('/royal/sprites-v5.json'))).toBe(true)
  expect(cacheContents.urls.every(url => !url.includes('.vrm') && !url.includes('firebase'))).toBe(true)
  await enterGame(page)
  await expect(page.locator('[data-tool="hammer"] img')).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await page.locator('#settings-open').click()
  await page.locator('#setting-level').fill('12297')
  await page.locator('#setting-unlimitedMoves').check()
  await page.getByRole('button', { name: '이 설정으로 시작하기' }).click()
  await expect(page.locator('#level-label')).toHaveText('레벨 12297')
  if (origin.stop) {
    await origin.stop()
    // Negative control: the origin is actually unreachable without a SW.
    await expect(page.request.get(origin.url, { timeout: 2000 })).rejects.toThrow()
    test.info().annotations.push({ type: 'coverage', description: 'WebKit origin-stopped cache recovery; offline emulation has upstream issue #42775.' })
  } else await context.setOffline(true)
  try {
    const restored = await page.reload()
    expect(restored?.status()).toBe(200)
    if (browserName === 'chromium') expect(restored?.fromServiceWorker()).toBe(true)
    await enterGame(page)
    // Offline recovery must preserve the prepared artwork, not silently fall
    // back to the vector icons when the sprite pack misses the SW allowlist.
    await expect(page.locator('[data-tool="hammer"] img')).toHaveAttribute('src', /^data:image\/webp;base64,/)
    await expect(page.locator('#level-label')).toHaveText('레벨 12297')
    await expect(page.locator('#moves')).toHaveText('∞')
    await expect(page.locator('#board')).toHaveAttribute('data-columns', '9')
    const before = await page.locator('[data-tool="shuffle"] .tool-count').innerText()
    await page.locator('[data-tool="shuffle"]').click()
    await expect(page.locator('[data-tool="shuffle"] .tool-count')).toHaveText(String(Number(before) - 1))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally { if (!origin.stop) await context.setOffline(false) }
  expect(errors).toEqual([])
  expect(failed).toEqual([])
  expect(external).toEqual([])
})

test('service worker removes only its legacy cache and keeps other projects untouched', async ({ page, origin }) => {
  await page.goto(new URL('manifest.webmanifest', origin.url).href)
  await page.evaluate(async () => {
    await caches.open('chroma-match:/chroma-match/:v2')
    await caches.open('unrelated-project:/other/:v9')
  })
  await page.goto(origin.url)
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  const keys = await page.evaluate(() => caches.keys())
  expect(keys).not.toContain('chroma-match:/chroma-match/:v2')
  expect(keys).toContain('unrelated-project:/other/:v9')
})
