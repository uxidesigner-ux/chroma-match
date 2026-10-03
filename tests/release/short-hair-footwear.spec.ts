import { expect, test } from '@playwright/test'
import { decodeSpec } from '../../src/avatar/spec.ts'

test('production short hairstyles save, restore and reopen offline with stable new codes', async ({ page, context }, testInfo) => {
  test.setTimeout(180000)
  await context.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.addInitScript(() => localStorage.setItem('chroma-match:lang', 'en'))
  await page.setViewportSize({ width: 390, height: 844 })
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const boot = async () => {
    await expect(page.locator('#splash')).toBeHidden({ timeout: 60000 })
    const gift = page.getByRole('button', { name: 'Got it', exact: true }); if (await gift.isVisible()) await gift.click()
    await expect(page.locator('#lobby-stage')).toHaveAttribute('data-state', 'ready')
  }
  await page.goto('./'); await boot()
  const portraits: string[] = []
  for (const [label, hair] of [['Short taper', 'fade'], ['Pomade', 'pomade']] as const) {
    await page.locator('#lobby-edit').click(); await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
    await page.getByRole('tab', { name: 'Hair', exact: true }).click()
    const choice = page.getByRole('button', { name: label, exact: true })
    await choice.focus(); await page.keyboard.press('Enter'); await expect(choice).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.locator('.studio-status')).toHaveText('Saved on this device.')
    const code = await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))
    expect(decodeSpec(code!).hair).toBe(hair)
    const portrait = await page.evaluate(() => JSON.parse(localStorage.getItem('chroma-match:anime-portrait-v1')!))
    expect(portrait.frame).toBe(7); expect(portrait.png.length).toBeGreaterThan(1000); portraits.push(portrait.png)
    await page.reload(); await boot(); expect(await page.evaluate(() => localStorage.getItem('chroma-match:avatar'))).toBe(code)
    await page.screenshot({ path: testInfo.outputPath(`production-${hair}-lobby.png`) })
  }
  expect(portraits[0]).not.toBe(portraits[1])
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await context.setOffline(true)
  try {
    await page.reload(); await boot()
    await page.locator('#lobby-edit').click(); await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
    await page.getByRole('tab', { name: 'Hair', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Pomade', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('production-pomade-offline-editor.png') })
  } finally { await context.setOffline(false) }
  expect(errors).toEqual([])
})
