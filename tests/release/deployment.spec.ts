import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'

test('production wardrobe v7 survives save/reload and offline editor recovery', async ({ page, context }, testInfo) => {
  await context.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.addInitScript(() => localStorage.setItem('chroma-match:lang', 'en'))
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('./')
  await expect(page.locator('#splash')).toBeHidden({ timeout: 60000 })
  const gift = page.getByRole('button', { name: 'Got it', exact: true })
  if (await gift.isVisible()) await gift.click()
  await page.locator('#lobby-edit').click()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
  await page.getByRole('tab', { name: 'Wardrobe', exact: true }).click()
  for (const name of ['V neck · long sleeves', 'Short skirt', 'Heels']) await page.getByRole('button', { name, exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('.studio-status')).toHaveText('Saved on this device.')
  const code = await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))
  expect(code).toMatch(/^7[a-zA-Z0-9]{56}$/)
  await page.reload()
  await expect(page.locator('#splash')).toBeHidden({ timeout: 60000 })
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'ready')
  await expect(page.locator('#profile-avatar')).toHaveAttribute('data-avatar-state', 'ready')
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await context.setOffline(true)
  try {
    await page.reload()
    await expect(page.locator('#splash')).toBeHidden({ timeout: 60000 })
    await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'ready')
    expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(code)
    await page.locator('#lobby-edit').click()
    await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
    await page.getByRole('tab', { name: 'Wardrobe', exact: true }).click()
    for (const name of ['V neck · long sleeves', 'Short skirt', 'Heels']) await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.screenshot({ path: testInfo.outputPath('release-wardrobe-offline.png') })
  } finally { await context.setOffline(false) }
  expect(errors).toEqual([])
})

test('production long hair retains a regenerated portrait and requested still gestures', async ({ page, context }, testInfo) => {
  await context.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.addInitScript(() => localStorage.setItem('chroma-match:lang', 'en'))
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('./')
  await expect(page.locator('#splash')).toBeHidden({ timeout: 60000 })
  const gift = page.getByRole('button', { name: 'Got it', exact: true })
  if (await gift.isVisible()) await gift.click()
  await page.locator('#lobby-edit').click()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
  await page.getByRole('tab', { name: 'Hair', exact: true }).click()
  await page.getByRole('button', { name: 'Long hair', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('release-long-front.png') })
  await page.getByRole('button', { name: 'Rear', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('release-long-back.png') })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('.studio-status')).toHaveText('Saved on this device.')
  const saved = await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))
  expect(saved).toMatch(/^[456]SL/)
  await page.reload()
  await expect(page.locator('#splash')).toBeHidden({ timeout: 60000 })
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'ready')
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(saved)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('chroma-match:anime-portrait-v1')!).frame)).toBe(3)
  await page.setViewportSize({ width: 430, height: 852 })
  const canvas = page.locator('#lobby-canvas')
  const hash = async () => createHash('sha256').update(await canvas.evaluate(e => (e as HTMLCanvasElement).toDataURL())).digest('hex')
  const frames: string[] = []
  for (const label of ['Wave', 'Cheer', 'Pose']) {
    await page.getByRole('button', { name: label, exact: true }).click()
    frames.push(await hash())
    await page.screenshot({ path: testInfo.outputPath(`release-long-${label.toLowerCase()}.png`) })
    await page.waitForTimeout(150)
    expect(await hash()).toBe(frames.at(-1))
  }
  expect(new Set(frames).size).toBe(3)
  expect(errors).toEqual([])
})

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
  await expect(page.locator('#splash')).toBeHidden({ timeout: 60000 })
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true)
  expect(await page.evaluate(() => caches.has('unrelated-app-cache'))).toBe(true)
  expect(await page.evaluate(() => caches.has('chroma-match:/chroma-match/:v1'))).toBe(false)
  await expect(page.locator('#profile-avatar')).toHaveAttribute('data-avatar-state', 'ready')
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'ready')
  const gotIt = page.getByRole('button', { name: 'Got it', exact: true })
  if (await gotIt.isVisible()) await gotIt.click()
  await page.setViewportSize({ width: 430, height: 852 })
  await expect(page.locator('html')).toHaveClass(/lobby-open/)
  await expect(page.locator('#lobby-hint')).toHaveClass('sr-only')
  await expect(page.locator('#start-game')).toBeInViewport()
  const lobby = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
    return {
      profileClear: rect('.profile').right <= rect('.lobby-utilities').left,
      navClear: rect('.lobby-stage').bottom <= rect('.lobby-nav').top,
      root: getComputedStyle(document.documentElement).overscrollBehaviorY,
      touch: getComputedStyle(document.getElementById('lobby-canvas')!).touchAction,
    }
  })
  expect(lobby).toEqual({ profileClear: true, navClear: true, root: 'none', touch: 'none' })
  await page.screenshot({ path: testInfo.outputPath('release-lobby.png') })
  await page.setViewportSize({ width: 1280, height: 800 })
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
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('.studio-status')).toHaveText('Saved on this device.')
  const saved = await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))
  expect(saved).toMatch(/^4S[BT][NHR][NG][0-9A-F]{24}[0-6]{5}[0-9A-F]{6}[MF]$/)
  await page.reload()
  await expect(page.locator('#splash')).toBeHidden({ timeout: 60000 })
  await expect(page.locator('#profile-avatar')).toHaveAttribute('data-avatar-state', 'ready')
  // The first controlled online navigation warms the existing shell cache.
  await expect
    .poll(() => page.evaluate(async () => Boolean(await caches.match(location.href))))
    .toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('#splash')).toBeHidden({ timeout: 60000 })
  await expect(page.locator('#profile-avatar')).toHaveAttribute('data-avatar-state', 'ready')
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(saved)
  await page.locator('#profile-face').click()
  await page.locator('#profile-edit').click()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
  expect(errors).toEqual([])
})

test('production Paper lobby has no drag frame, preserves keyboard focus and separates action hierarchy', async ({ page, context }, testInfo) => {
  await context.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.addInitScript(() => localStorage.setItem('chroma-match:lang', 'ko'))
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 430, height: 852 })
  await page.goto('./?skin=paper')
  await expect(page.locator('#splash')).toBeHidden({ timeout: 60000 })
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'ready')
  const gotIt = page.getByRole('button', { name: '확인', exact: true })
  if (await gotIt.isVisible()) await gotIt.click()
  await expect(page.locator('#lobby-edit')).toHaveText('꾸미기')
  const avatar = await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))
  const canvas = page.locator('#lobby-canvas')
  await canvas.focus()
  await page.keyboard.press('Home')
  expect(await canvas.evaluate(node => getComputedStyle(node).outlineStyle)).toBe('solid')
  const read = async () => createHash('sha256').update(await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL())).digest('hex')
  const before = await read()
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 3 + 60, { steps: 4 })
  await page.mouse.up()
  expect(await canvas.evaluate(node => getComputedStyle(node).outlineStyle)).toBe('none')
  expect(await read()).not.toBe(before)
  expect(await page.locator('.home .profile').evaluate(node => getComputedStyle(node).overflow)).toBe('visible')
  expect(await page.locator('.lobby-utilities button').first().evaluate(node => getComputedStyle(node).boxShadow)).toBe('none')
  await page.screenshot({ path: testInfo.outputPath('release-paper-after-drag.png') })
  await page.keyboard.press('Home')
  expect(await canvas.evaluate(node => getComputedStyle(node).outlineStyle)).toBe('solid')
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(avatar)
  expect(errors).toEqual([])
})
