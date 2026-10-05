import { expect, type Page } from '@playwright/test'

/** Wait until the boot splash has handed the lobby over, then dismiss the starter gift if it appears. */
export async function enterLobby(page: Page): Promise<void> {
  await expect(page.locator('#splash')).toBeHidden({ timeout: 60000 })
  const gift = page.locator('#overlay-action')
  if (await gift.isVisible()) await gift.click()
  // The map is the new default; these existing cases exercise Character.
  if (await page.locator('#screen-map').isVisible()) await page.locator('#map-character').click()
  await expect(page.locator('#start-game')).toBeVisible()
}
