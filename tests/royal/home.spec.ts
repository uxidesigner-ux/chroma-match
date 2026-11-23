import { test, expect, type Page } from '@playwright/test'

const prefsKey = 'chroma-royale:preferences:v2'
const progressKey = 'chroma-royale:progress:v2'

test.use({ viewport: { width: 390, height: 844 } })
test.beforeEach(async ({ page }) => {
  await page.addInitScript(key => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({
      level: 1, seed: 2026, randomRetry: false, hints: false, sound: false, calm: true,
    }))
  }, prefsKey)
})

async function enterHome(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('.royale-entry')).toBeVisible()
  await page.locator('#home-enter').click()
  await expect(page.locator('.royale-home')).toBeVisible()
}

async function boardState(page: Page): Promise<{ moves: number; turn: number; goals: unknown[] }> {
  return page.evaluate(() => {
    const state = (window as unknown as { __royalSnapshot: { moves: number; turn: number; goals: unknown[] } }).__royalSnapshot
    return { moves: state.moves, turn: state.turn, goals: state.goals }
  })
}

async function playHint(page: Page): Promise<void> {
  const canvas = page.locator('#board')
  await expect(canvas).toHaveAttribute('aria-busy', 'false')
  const before = await boardState(page)
  const hint = await page.evaluate(() => (window as unknown as { __royalSnapshot: { hint: [number, number] | null } }).__royalSnapshot.hint)
  expect(hint).not.toBeNull()
  const bounds = (await canvas.boundingBox())!
  const cols = Number(await canvas.getAttribute('data-columns'))
  const rows = Number(await canvas.getAttribute('data-rows'))
  const size = Math.min((bounds.width - 14) / cols, (bounds.height - 14) / rows)
  const point = (cell: number) => ({
    x: bounds.x + (bounds.width - cols * size) / 2 + (cell % cols + .5) * size,
    y: bounds.y + (bounds.height - rows * size) / 2 + (Math.floor(cell / cols) + .5) * size,
  })
  const from = point(hint![0]), to = point(hint![1])
  if (hint![0] === hint![1]) await page.mouse.click(from.x, from.y)
  else {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 4 })
    await page.mouse.up()
  }
  await expect(canvas).toHaveAttribute('data-turn', String(before.turn + 1))
  await expect(canvas).toHaveAttribute('aria-busy', 'false')
}

test('first entry leads to the home and the playable board without runtime errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.locator('.royale-entry')).toBeVisible()
  await expect(page.locator('.royale-home')).toBeHidden()
  await expect(page.locator('#board')).toBeHidden()

  await page.locator('#home-enter').click()
  await expect(page.locator('.royale-entry')).toBeHidden()
  await expect(page.locator('#home-play')).toBeVisible()
  await expect(page.locator('#home-play')).toBeFocused()
  await expect(page.locator('#home-play')).toHaveAccessibleName('레벨 1 플레이')
  await page.locator('#home-play').click()
  await expect(page.locator('#home-mount')).toBeHidden()
  await expect(page.locator('#board')).toBeVisible()
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('html')).toHaveAttribute('data-view', 'game')
  expect(errors).toEqual([])
})

test('returning home and resuming preserves the played turn, moves and goals', async ({ page }) => {
  await enterHome(page)
  await page.locator('#home-play').click()
  const canvas = page.locator('#board')
  await expect(canvas).toHaveAttribute('aria-busy', 'false')
  const before = await boardState(page)
  await playHint(page)
  const played = await boardState(page)
  expect(played.moves).toBe(before.moves - 1)

  await page.locator('#game-home').click()
  await expect(page.locator('.royale-home')).toBeVisible()
  await expect(canvas).toBeHidden()
  await page.locator('.home-event-purple').click()
  await expect(page.locator('#help-dialog')).toBeVisible()
  await page.locator('#help-dialog .close-button').click()
  expect(await boardState(page)).toEqual(played)
  await page.locator('#home-play').click()
  await expect(canvas).toBeVisible()
  await expect(canvas).toHaveAttribute('data-turn', String(played.turn))
  await expect(page.locator('#moves')).toHaveText(String(played.moves))
  expect(await boardState(page)).toEqual(played)
})

test('home kingdom action spends a star and refreshes home progress', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({
    completed: [1, 2], stars: 2, coins: 125, tasks: [], streak: 2, lightWins: 2, superActive: false,
  })), progressKey)
  await enterHome(page)
  await expect(page.locator('[data-home-value="stars"]')).toHaveText('2')
  await page.locator('.home-task-banner').click()
  await expect(page.locator('#kingdom-dialog')).toBeVisible()
  await page.locator('[data-task="garden-1"]').click()
  await expect(page.locator('#kingdom-stage')).toHaveText('왕실의 정원 · 1/6')
  await page.locator('#kingdom-dialog .close-button').click()
  await expect(page.locator('.royale-home')).toBeVisible()
  await expect(page.locator('[data-home-value="stars"]')).toHaveText('1')
  await expect(page.locator('[data-home-value="tasks"]')).toHaveText('1/6')
  await expect(page.locator('[data-home-value="coins"]')).toHaveText('125')
})

test('home settings launch the selected level with the requested moves', async ({ page }) => {
  await enterHome(page)
  await page.locator('.home-setting-button').click()
  await expect(page.locator('#settings-dialog')).toBeVisible()
  await page.locator('#setting-level').fill('73')
  await page.locator('#setting-moves').fill('37')
  await page.getByRole('button', { name: '이 설정으로 시작하기' }).click()
  await expect(page.locator('.royale-home')).toBeHidden()
  await expect(page.locator('#board')).toBeVisible()
  await expect(page.locator('#level-label')).toHaveText('레벨 73')
  await expect(page.locator('#moves')).toHaveText('37')
  await page.locator('#game-home').click()
  await expect(page.locator('#home-play')).toHaveAccessibleName('레벨 73 플레이')
})

test('home workshop starts a saved personal board and remains accessible after return', async ({ page }) => {
  await enterHome(page)
  await page.locator('.home-event-green').click()
  await expect(page.locator('#editor-dialog')).toBeVisible()
  await page.locator('#editor-name').fill('나의 작은 정원')
  await page.locator('#editor-moves').fill('18')
  await page.locator('#editor-play').click()
  await expect(page.locator('#editor-dialog')).toBeHidden()
  await expect(page.locator('.royale-home')).toBeHidden()
  await expect(page.locator('#level-label')).toHaveText('나만의 보드')
  await expect(page.locator('#mission-name')).toHaveText('나의 작은 정원')
  await expect(page.locator('#moves')).toHaveText('18')
  await page.locator('#game-home').click()
  await page.locator('.home-bottom-nav [data-home-action="editor"]').click()
  await expect(page.locator('#editor-name')).toHaveValue('나의 작은 정원')
  await page.locator('#editor-close').click()
  await expect(page.locator('#home-play')).toBeVisible()
})

test('reload within the same session skips the entry screen and opens home', async ({ page }) => {
  await enterHome(page)
  await page.reload()
  await expect(page.locator('.royale-home')).toBeVisible()
  await expect(page.locator('.royale-entry')).toBeHidden()
  await expect(page.locator('#board')).toBeHidden()
  await page.locator('#home-play').click()
  await expect(page.locator('#board')).toBeVisible()
})

test('a direct play link bypasses entry and home for reference level 12297', async ({ page }) => {
  await page.goto('/?play=1&level=12297')
  await expect(page.locator('#board')).toBeVisible()
  await expect(page.locator('#home-mount')).toBeHidden()
  await expect(page.locator('#level-label')).toHaveText('레벨 12297')
  await expect(page.locator('#board')).toHaveAttribute('data-level', '12297')
  await page.locator('#game-home').click()
  await expect(page.locator('#home-play')).toHaveAccessibleName('레벨 12297 플레이')
})

test('a direct play link without a level hides home and advances the game', async ({ page }) => {
  await page.goto('/?play=1')
  await expect(page.locator('#board')).toBeVisible()
  await expect(page.locator('#home-mount')).toBeHidden()
  await expect(page.locator('#level-label')).toHaveText('레벨 1')
  const before = await boardState(page)
  await playHint(page)
  expect((await boardState(page)).moves).toBe(before.moves - 1)
})

test('desktop entry and home keep the portrait composition within 550 pixels', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  await expect(page.locator('.royale-entry')).toBeVisible()
  const entry = (await page.locator('.royale-entry').boundingBox())!
  expect(entry.width).toBeLessThanOrEqual(550)
  expect(entry.width).toBeGreaterThan(500)
  await page.locator('#home-enter').click()
  const home = (await page.locator('.royale-home').boundingBox())!
  expect(home.width).toBe(entry.width)
  expect(home.x).toBeGreaterThanOrEqual(0)
  expect(home.x + home.width).toBeLessThanOrEqual(1280)
})
