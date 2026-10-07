import { test, expect, type Page } from '@playwright/test'

async function boot(page: Page) {
  // Map-only coverage: never load or exercise the frozen character renderer.
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com|seed-san\.vrm/, r => r.abort())
  await page.addInitScript(() => {
    localStorage.setItem('chroma-match:granted', '1')
    localStorage.setItem('chroma-match:lang', 'ko')
    localStorage.setItem('chroma-match:campaign-v1', JSON.stringify({ version: 1, completed: { 'forest-1': 1150 } }))
  })
  await page.goto('/?seed=7')
  await expect(page.locator('#splash')).toBeHidden()
}

test('compact identity and separate wallet leave the scene clear at mobile and fold sizes', async ({ page }, info) => {
  await boot(page)
  for (const [width, height] of [[320,568],[390,690],[390,844],[720,720],[844,390],[1280,800]]) {
    await page.setViewportSize({ width: width!, height: height! })
    await expect.poll(() => page.locator('.hub-header').evaluate(e => e.getBoundingClientRect().height)).toBeLessThanOrEqual(100)
    expect(await page.locator('#map-wallet').evaluate(e => e.parentElement!.classList.contains('hub-header'))).toBe(true)
    expect(await page.locator('.world-identity').evaluate(e => getComputedStyle(e).backgroundImage)).toBe('none')
    // Existing campaign migration credits the real first-clear XP fixture.
    await expect(page.locator('#hub-level')).toHaveText('Lv.2')
    await expect(page.locator('#hub-title')).toBeHidden()
    await expect(page.locator('#map-wallet')).toBeVisible()
    await page.screenshot({ path: info.outputPath(`scene-${width}x${height}.png`) })
  }
})

test('selection, region symbol, localized stage and preparation refer to the same mission', async ({ page }) => {
  await boot(page)
  for (const [region, symbol] of [['forest','map'],['volcano','bomb'],['prism','star'],['relay','gear']]) {
    await page.locator(`.world-pin[data-region="${region}"]`).click()
    await expect(page.locator('#world-play')).toHaveAttribute('data-selected-region', region!)
    await expect(page.locator('#world-play .game-icon')).toHaveAttribute('data-game-icon', symbol!)
    const selected = await page.locator('.world-mission[aria-pressed="true"]').getAttribute('data-mission-step')
    await expect(page.locator('#world-play-label')).toHaveText(`${selected}단계 · 플레이`)
    await expect(page.locator('#world-play')).toHaveAccessibleName(new RegExp(` ${selected}$`))
    await page.locator('[data-camera="world"]').click()
  }
  await page.locator('#world-play').click()
  await expect(page.locator('#loadout')).toBeVisible()
  await page.locator('#loadout-start').click()
  await expect(page.locator('#screen-game')).toBeVisible()
  await expect(page.locator('.hub-header')).toBeHidden()
  await expect(page.locator('.hub-nav')).toBeHidden()
})

test('five-destination plinth emphasizes only the current page and restores modal focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 690 }); await boot(page)
  await expect(page.locator('.hub-nav [aria-current="page"]')).toHaveCount(1)
  expect(await page.locator('#world-list-label').evaluate(e => getComputedStyle(e).translate)).toBe('0px -5px')
  expect(await page.locator('#map-shop').evaluate(e => getComputedStyle(e).backgroundImage)).toBe('none')
  await page.locator('#map-shop').click()
  await expect(page.locator('#map-shop')).toHaveAttribute('aria-current', 'page')
  await page.locator('#map-ranks').click(); await page.keyboard.press('Escape')
  await expect(page.locator('#map-ranks')).toBeFocused()
  await page.locator('#world-list-label').click()
  await expect(page.locator('#screen-map')).toBeVisible()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await page.locator('#map-shop').evaluate(e => getComputedStyle(e).transitionDuration)).toBe('0s')
  expect(await page.locator('.region-glow').evaluate(e => getComputedStyle(e).animationName)).toBe('none')
})

test('stage action remains readable in all four languages and total completion stays discoverable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 }); await boot(page)
  await page.locator('#world-list-label').click()
  await expect(page.locator('#world-region-list #world-progress')).toHaveText('1/120')
  await page.keyboard.press('Escape')
  for (const [lang, text] of [['en','Level 2'],['ja','レベル2'],['zh-Hans','第2关'],['ko','2단계']]) {
    await page.locator('#map-profile').click(); await page.locator('#map-settings').click()
    await page.locator(`#set-langs [data-lang="${lang}"]`).click()
    await page.keyboard.press('Escape')
    await page.locator('#profile-close').click()
    await expect(page.locator('#screen-map')).toBeVisible()
    await expect(page.locator('#world-play-label')).toContainText(text!)
    expect(await page.locator('#world-play-label').evaluate(e => {
      const a = e.getBoundingClientRect(), b = e.closest('button')!.getBoundingClientRect()
      return a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom
    })).toBe(true)
  }
})

test('short landscape waypoints stay in their terrain quadrants rather than clustering beside the dock', async ({ page }) => {
  await boot(page)
  for (const [width, height] of [[480,320],[844,390]]) {
    await page.setViewportSize({ width: width!, height: height! })
    await expect.poll(() => page.locator('.world-pin').evaluateAll(nodes => {
      const points = Object.fromEntries(nodes.map(e => {
        const r = e.getBoundingClientRect()
        return [(e as HTMLElement).dataset.region, { x: r.x + r.width / 2, y: r.y + r.height / 2 }]
      }))
      return points.forest!.x < innerWidth / 2 && points.prism!.x < innerWidth / 2
        && points.volcano!.x > innerWidth / 2 && points.relay!.x > innerWidth / 2
        && points.forest!.y < points.prism!.y && points.volcano!.y < points.relay!.y
    })).toBe(true)
  }
})
