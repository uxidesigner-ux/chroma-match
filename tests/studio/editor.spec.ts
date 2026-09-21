import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { enterLobby } from './boot.ts'

async function openCreator(page: Page) {
  await page.locator('#profile-face').click()
  await page.locator('#profile-edit').click()
}

async function openAnime(page: Page) {
  await openCreator(page)
  await expect(page.locator('#creator-styles, #creator-figure, #creator-tabs, #creator-options')).toHaveCount(0)
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
}

async function expectFaceCrop(page: Page, selector: string) {
  await expect(page.locator(selector)).toHaveAttribute('data-avatar-state', 'ready')
  const result = await page.locator(selector).evaluate(async element => {
    const actual = element as HTMLCanvasElement
    const saved = JSON.parse(localStorage.getItem('chroma-match:anime-portrait-v1')!)
    const image = new Image()
    image.src = saved.png
    await image.decode()
    const size = Number.parseFloat(actual.style.width)
    const ratio = Math.min(3, Math.max(1, devicePixelRatio || 1))
    const capture = (zoom: boolean) => {
      const canvas = document.createElement('canvas')
      canvas.width = actual.width
      canvas.height = actual.height
      const ctx = canvas.getContext('2d')!
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.beginPath()
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
      ctx.clip()
      if (zoom) {
        const edge = image.naturalWidth
        const crop = edge / 1.65
        ctx.drawImage(image, (edge - crop) / 2, edge * 0.43 - crop / 2, crop, crop, 0, 0, size, size)
      } else ctx.drawImage(image, 0, 0, size, size)
      return canvas.toDataURL()
    }
    return { isCloseup: actual.toDataURL() === capture(true), isOldFraming: actual.toDataURL() === capture(false) }
  })
  expect(result).toEqual({ isCloseup: true, isOldFraming: false })
}

test.beforeEach(async ({ page }) => {
  // Do not create accounts or post to production while testing a local editor.
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, (route) => route.abort())
  await page.addInitScript(() => {
    localStorage.setItem('chroma-match:lang', 'en')
  })
  await page.goto('/')
  await enterLobby(page)
})

test('a saved draft reaches the profile and 3D lobby and survives reload', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'ready')
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
  expect(saved).toMatch(/^4S[BT][NHR][NG][0-9A-F]{24}$/)
  await page.locator('#creator-back').click()
  await expect(page.locator('#profile-avatar')).toHaveAttribute('data-avatar-state', 'ready')
  await expectFaceCrop(page, '#profile-avatar')
  const cachedPortrait = await page.evaluate(() => localStorage.getItem('chroma-match:anime-portrait-v1'))
  await page.reload()
  await enterLobby(page)
  await expect(page.locator('#profile-avatar')).toHaveAttribute('data-avatar-state', 'ready')
  await expectFaceCrop(page, '#profile-avatar')
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:anime-portrait-v1'))).toBe(cachedPortrait)
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(saved)
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'ready')
  await page.locator('#profile-face').click()
  await expectFaceCrop(page, '#profile-preview')
  await page.locator('#profile-edit').click()
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

test('a missing custom portrait regenerates from the code and reopens the same editor', async ({
  page,
}) => {
  await openAnime(page)
  await page.getByRole('button', { name: 'Ember', exact: true }).click()
  await page.getByRole('button', { name: 'Use this character', exact: true }).click()
  await expect(page.locator('.studio-status')).toHaveText('Saved on this device.')
  await page.evaluate(() => localStorage.removeItem('chroma-match:anime-portrait-v1'))
  await page.reload()
  await enterLobby(page)
  await expect(page.locator('#profile-avatar')).toHaveAttribute('data-avatar-state', 'ready')
  expect(
    await page.evaluate(() =>
      performance.getEntriesByType('resource').some((e) => e.name.endsWith('.vrm')),
    ),
  ).toBe(true)
  await openCreator(page)
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
  await expect(page.getByRole('button', { name: 'Ember', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toMatch(
    /^4S[BT][NHR][NG][0-9A-F]{24}$/,
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

test('retired profile data becomes the starter without changing scores', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('chroma-match:avatar', '2basbhaiavbtanaoaebxa32343C33456B5C7A5EF3F0EA')
    localStorage.setItem('chroma-match:best', '9876')
    localStorage.setItem('chroma-match:best-level', '7')
    localStorage.setItem('chroma-match:name', 'Returning player')
  })
  await page.reload()
  await enterLobby(page)
  await expect(page.locator('#profile-avatar')).toHaveAttribute('data-avatar-state', 'ready')
  const state = await page.evaluate(() => ({
    code: localStorage.getItem('chroma-match:avatar'), best: localStorage.getItem('chroma-match:best'),
    level: localStorage.getItem('chroma-match:best-level'), name: localStorage.getItem('chroma-match:name'),
  }))
  expect(state).toEqual({ code: '4STNN67B7A3A899E891ADB8202C3D', best: '9876', level: '7', name: 'Returning player' })
  await openAnime(page)
  await expect(page.getByRole('button', { name: 'Full body', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('existing anime data migrates to the compact code without changing appearance', async ({ page }) => {
  const previous = '32basbhaiavbtanaoaebxa32343C33456B5C7A5EF3F0EASTNNED9560B897ED9A8BCD352C43'
  await page.evaluate(code => localStorage.setItem('chroma-match:avatar', code), previous)
  await page.reload()
  await enterLobby(page)
  await expect(page.locator('#profile-avatar')).toHaveAttribute('data-avatar-state', 'ready')
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe('4' + previous.slice(46))
  await openAnime(page)
  await expect(page.getByRole('button', { name: 'Ember', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('starter portrait remains available without WebGL or storage writes', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (type === 'webgl' || type === 'webgl2') return null
      return getContext.call(this, type, ...args)
    } as typeof HTMLCanvasElement.prototype.getContext
    Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError') }
  })
  await page.reload()
  await enterLobby(page)
  await expect(page.locator('#profile-avatar')).toHaveAttribute('data-avatar-state', 'ready')
  await openCreator(page)
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'error')
  await expect(page.getByRole('button', { name: 'Use this character', exact: true })).toBeDisabled()
  await page.locator('#creator-back').click()
  await expect(page.locator('#profile-avatar')).toBeVisible()
})
