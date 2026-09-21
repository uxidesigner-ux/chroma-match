import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'

test('release serves the pinned model, license notices and built entry assets', async ({
  request,
}) => {
  const page = await request.get('./')
  expect(page.ok()).toBe(true)
  const html = await page.text()
  const entry = html.match(/<script[^>]+src="([^"]+)"/)
  expect(entry).not.toBeNull()
  const js = await request.get(entry![1]!)
  expect(js.ok()).toBe(true)
  expect(js.headers()['content-type']).toMatch(/javascript/)
  expect(html).not.toContain('creator-styles')
  expect(html).not.toContain('creator-figure')
  const stylesheet = html.match(/<link[^>]+href="([^"]+\.css)"/)
  expect(stylesheet).not.toBeNull()
  const styles = await request.get(stylesheet![1]!)
  expect(styles.ok()).toBe(true)
  for (const removed of ['creator-styles', 'creator-option', 'profile-tab', 'profile-option', 'option-chip']) {
    expect(await styles.text()).not.toContain(removed)
  }
  const portrait = await request.get('avatars/seed-v1/default-portrait.png')
  expect(portrait.ok()).toBe(true)
  expect(portrait.headers()['content-type']).toMatch(/image\/png/)
  const source = await request.get('avatars/seed-v1/source.json')
  expect(source.ok()).toBe(true)
  const metadata = await source.json()
  const model = await request.get('avatars/seed-v1/seed-san.vrm')
  expect(model.ok()).toBe(true)
  const bytes = await model.body()
  expect(bytes.length).toBe(10917800)
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(metadata.sha256)
  expect(metadata.sha256).toBe('624d0d554bc205bbdc33e22a68a2c3c20edebb3e573011ead8878a65e5329b23')
  for (const path of [
    'licenses/anime-assets.html',
    'licenses/character-studio.txt',
    'licenses/three-runtime.txt',
  ]) {
    expect((await request.get(path)).ok()).toBe(true)
  }
})

test('production guest editor saves, reloads and reopens offline without touching unrelated caches', async ({
  page,
  context,
}, testInfo) => {
  // Do not create accounts, scores or cloud profile records during release QA.
  await context.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, (route) => route.abort())
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('licenses/anime-assets.html')
  await page.evaluate(async () => {
    await caches.open('unrelated-app-cache')
    await caches.open('chroma-match:/chroma-match/:v1')
    localStorage.setItem('chroma-match:lang', 'en')
  })
  await page.goto('./')
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true)
  expect(await page.evaluate(() => caches.has('unrelated-app-cache'))).toBe(true)
  expect(await page.evaluate(() => caches.has('chroma-match:/chroma-match/:v1'))).toBe(false)
  await expect(page.locator('#profile-avatar')).toHaveAttribute('data-avatar-state', 'ready')
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'ready')
  const gotIt = page.getByRole('button', { name: 'Got it', exact: true })
  if (await gotIt.isVisible()) await gotIt.click()
  await page.locator('#profile-face').click()
  await page.locator('#profile-edit').click()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
  await expect(page.getByRole('button', { name: 'Full body', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Ember', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('release-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 375, height: 812 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('release-mobile.png'), fullPage: true })
  await page.getByRole('button', { name: 'Use this character', exact: true }).click()
  await expect(page.locator('.studio-status')).toHaveText('Saved on this device.')
  const saved = await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))
  expect(saved).toMatch(/^4S[BT][NHR][NG][0-9A-F]{24}$/)
  await page.reload()
  await expect(page.locator('#profile-avatar')).toHaveAttribute('data-avatar-state', 'ready')
  // The first controlled online navigation warms the existing shell cache.
  await expect
    .poll(() => page.evaluate(async () => Boolean(await caches.match(location.href))))
    .toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('#profile-avatar')).toHaveAttribute('data-avatar-state', 'ready')
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(saved)
  await page.locator('#profile-face').click()
  await page.locator('#profile-edit').click()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
  expect(errors).toEqual([])
})
