import { expect, type Page } from '@playwright/test'

/** Wait until the boot splash has handed the lobby over, then dismiss the starter gift if it appears. */
export async function enterLobby(page: Page): Promise<void> {
  await expect(page.locator('#splash')).toBeHidden({ timeout: 60000 })
  const gift = page.locator('#overlay-action')
  if (await gift.isVisible()) await gift.click()
  await expect(page.locator('#start-game')).toBeVisible()
}
