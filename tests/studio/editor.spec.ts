import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function openCreator(page: Page) {
  await page.locator('#profile-face').click()
  await page.locator('#profile-edit').click()
}

async function openAnime(page: Page) {
  await openCreator(page)
  await page.getByRole('button', { name: 'Anime 3D', exact: true }).click()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
}

test.beforeEach(async ({ page }) => {
  // Do not create accounts or post to production while testing a local editor.
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, (route) => route.abort())
  await page.addInitScript(() => {
    localStorage.setItem('chroma-match:lang', 'en')
  })
  await page.goto('/')
  const gotIt = page.getByRole('button', { name: 'Got it', exact: true })
  if (await gotIt.isVisible()) await gotIt.click()
})

test('3D is lazy; a saved draft reaches the profile and survives reload without loading 3D again', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  expect(
    await page.evaluate(() =>
      performance.getEntriesByType('resource').some((e) => e.name.endsWith('.vrm')),
    ),
  ).toBe(false)
  const old = await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))
  await openAnime(page)
  await page.getByRole('button', { name: 'Ember', exact: true }).click()
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(old)
  await page.getByRole('tab', { name: 'Details', exact: true }).click()
  await page.getByRole('button', { name: 'Short bob', exact: true }).click()
  await page.getByRole('tab', { name: 'Expression', exact: true }).click()
  await page.getByRole('button', { name: 'Happy', exact: true }).click()
  await page.getByRole('button', { name: 'Use this character', exact: true }).click()
  await expect(page.locator('.studio-status')).toHaveText('Saved on this device.')
  const saved = await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))
  expect(saved).toMatch(/^32[a-zA-Z0-9]{72}$/)
  await page.locator('#creator-back').click()
  await expect(page.locator('#profile-avatar')).toHaveAttribute('data-avatar-state', 'ready')
  await page.reload()
  await expect(page.locator('#profile-avatar')).toHaveAttribute('data-avatar-state', 'ready')
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(saved)
  expect(
    await page.evaluate(() =>
      performance.getEntriesByType('resource').some((e) => e.name.endsWith('.vrm')),
    ),
  ).toBe(false)
  await openCreator(page)
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
  await page.getByRole('tab', { name: 'Details', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Short bob', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(errors).toEqual([])
})

test('cancel preserves the old avatar and existing gameplay still starts', async ({ page }) => {
  const before = await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))
  await openAnime(page)
  await page.getByRole('button', { name: 'Rose', exact: true }).click()
  await page.locator('#creator-back').click()
  await expect(page.getByText('Discard your unsaved character changes?')).toBeVisible()
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
  await expect(page.locator('#screen-creator')).toBeVisible()
  await page.locator('#creator-back').click()
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(before)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  // Existing loadout, if shown, has its own Play button.
  const start = page.locator('#loadout-start')
  await expect(start).toBeVisible()
  await start.click()
  await expect(page.locator('#board')).toBeVisible()
})

test('model failure is recoverable; retry uses a fresh canvas', async ({ page }) => {
  await page.route('**/seed-san.vrm', (route) => route.abort())
  await openCreator(page)
  await page.getByRole('button', { name: 'Anime 3D', exact: true }).click()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'error')
  await expect(page.getByRole('button', { name: 'Use this character', exact: true })).toBeDisabled()
  await page.unroute('**/seed-san.vrm')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
  await page.locator('.studio-stage canvas').evaluate((canvas) => {
    ;(canvas as HTMLCanvasElement)
      .getContext('webgl2')
      ?.getExtension('WEBGL_lose_context')
      ?.loseContext()
  })
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'error')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
})

test('keyboard tabs, rotation, mobile reflow and reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openAnime(page)
  await page.getByRole('tab', { name: 'Looks', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Details', exact: true })).toBeFocused()
  await expect(page.getByRole('tab', { name: 'Details', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  const preview = page.locator('.studio-stage canvas')
  await preview.focus()
  const before = await preview.evaluate((c) => (c as HTMLCanvasElement).toDataURL())
  await page.keyboard.press('ArrowRight')
  expect(await preview.evaluate((c) => (c as HTMLCanvasElement).toDataURL())).not.toBe(before)
  await page.keyboard.press('Home')
  const still = await preview.evaluate((c) => (c as HTMLCanvasElement).toDataURL())
  await page.waitForTimeout(180)
  expect(await preview.evaluate((c) => (c as HTMLCanvasElement).toDataURL())).toBe(still)
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 320, height: 568 },
    { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(viewport)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page
      .getByRole('button', { name: 'Use this character', exact: true })
      .scrollIntoViewIfNeeded()
    await expect(
      page.getByRole('button', { name: 'Use this character', exact: true }),
    ).toBeInViewport()
  }
})

test('local storage failure never reports a successful save or replaces the avatar', async ({
  page,
}) => {
  const before = await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))
  await openAnime(page)
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'chroma-match:avatar') throw new DOMException('Full', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await page.getByRole('button', { name: 'Use this character', exact: true }).click()
  await expect(page.locator('.studio-status')).toContainText('could not save')
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(before)
})

test('a missing portrait regenerates from the code and Classic can replace an anime avatar', async ({
  page,
}) => {
  await openAnime(page)
  await page.getByRole('button', { name: 'Use this character', exact: true }).click()
  await expect(page.locator('.studio-status')).toHaveText('Saved on this device.')
  await page.evaluate(() => localStorage.removeItem('chroma-match:anime-portrait-v1'))
  await page.reload()
  await expect(page.locator('#profile-avatar')).toHaveAttribute('data-avatar-state', 'ready')
  expect(
    await page.evaluate(() =>
      performance.getEntriesByType('resource').some((e) => e.name.endsWith('.vrm')),
    ),
  ).toBe(true)
  await openCreator(page)
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
  await page.getByRole('button', { name: 'Classic', exact: true }).click()
  await expect(page.locator('#creator-stage')).toBeVisible()
  await page.locator('#creator-options button:not(:disabled)').first().click()
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toMatch(
    /^2[a-zA-Z0-9]{44}$/,
  )
})

test('full-body controls show every direction without changing the saved profile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openAnime(page)
  const full = page.getByRole('button', { name: 'Full body', exact: true })
  const face = page.getByRole('button', { name: 'Face', exact: true })
  await expect(full).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-framing', 'full')
  const capture = () =>
    page.locator('.studio-stage canvas').evaluate((c) => (c as HTMLCanvasElement).toDataURL())
  const front = await capture()
  await page.getByRole('button', { name: 'Side', exact: true }).click()
  expect(await capture()).not.toBe(front)
  await page.getByRole('button', { name: 'Rear', exact: true }).click()
  const rear = await capture()
  expect(rear).not.toBe(front)
  await page.getByRole('button', { name: 'Front', exact: true }).click()
  expect(await capture()).toBe(front)
  await face.click()
  await expect(face).toHaveAttribute('aria-pressed', 'true')
  await expect(full).toHaveAttribute('aria-pressed', 'false')
  await full.click()
  await page.getByRole('tab', { name: 'Details', exact: true }).click()
  await page.getByRole('button', { name: 'Explorer gear', exact: true }).click()
  await page.getByRole('button', { name: 'Use this character', exact: true }).click()
  await expect(page.locator('.studio-status')).toHaveText('Saved on this device.')
  const saved = await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))
  const portrait = await page.evaluate(() => localStorage.getItem('chroma-match:anime-portrait-v1'))
  await page.getByRole('button', { name: 'Rear', exact: true }).click()
  await face.click()
  await page.getByRole('button', { name: 'Use this character', exact: true }).click()
  await expect(page.locator('.studio-status')).toHaveText('Saved on this device.')
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(saved)
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:anime-portrait-v1'))).toBe(
    portrait,
  )
  await page.locator('#creator-back').click()
  await openCreator(page)
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
  await page.getByRole('tab', { name: 'Details', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Explorer gear', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})
