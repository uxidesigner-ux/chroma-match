import { test, expect, type Page } from '@playwright/test'

type FeedbackWindow = Window & {
  __feedbackMessages: { kind: string; intensity: number; time: number }[]
  __vibrationPatterns: (number | number[])[]
  __lastBoardRelease: number
  __royalSnapshot: { time: number; turn: number; moves: number; locked: number[]; pieces: unknown[] }
}
const fixture = {
  version: 1, id: 1, name: '피드백 확인판', cols: 5, rows: 5,
  mask: Array(5).fill('11111'), moves: 20, difficulty: 'normal', colours: 4, seed: 27,
  goals: [{ kind: 'colour', colour: 0, count: 1000 }], obstacles: [], jelly: [], provenance: 'custom',
  pieces: Array.from({ length: 25 }, (_, cell) => ({ cell, colour: (Math.floor(cell / 5) + cell % 5) % 4, ...(cell === 12 ? { power: 'tnt' } : {}) })),
}

test.use({ viewport: { width: 390, height: 844 } })

async function preferences(page: Page): Promise<void> {
  await page.addInitScript(level => {
    localStorage.setItem('chroma-royale:preferences:v2', JSON.stringify({ sound: false, haptics: true, hints: false, randomRetry: false, speed: 1 }))
    localStorage.setItem('chroma-royale:custom-level:v2', JSON.stringify(level))
  }, fixture)
}
async function customBoard(page: Page): Promise<void> {
  await page.goto('/?play=1')
  await page.locator('#editor-open').click()
  await page.locator('#editor-play').click()
  await expect(page.locator('#mission-name')).toHaveText(fixture.name)
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
}
async function nativeBridge(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = window as unknown as FeedbackWindow & {
      chromaNativeCapabilities: { haptics: boolean }
      webkit: { messageHandlers: { chromaHaptics: { postMessage(message: { kind: string; intensity: number }): void } } }
    }
    target.__feedbackMessages = []
    target.chromaNativeCapabilities = { haptics: true }
    target.webkit = { messageHandlers: { chromaHaptics: { postMessage: message => target.__feedbackMessages.push({ ...message, time: performance.now() }) } } }
    document.addEventListener('pointerup', event => {
      if ((event.target as HTMLElement)?.id === 'board') target.__lastBoardRelease = performance.now()
    })
  })
}
async function tnt(page: Page): Promise<void> {
  const box = (await page.locator('#board').boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.locator('#board')).toHaveAttribute('data-turn', '1')
}

test('a browser with no vibration API explains the limitation and disables its vibration setting', async ({ page }) => {
  await preferences(page)
  await page.addInitScript(() => Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true }))
  await page.goto('/?play=1')
  await page.locator('#settings-open').click()
  await expect(page.locator('#setting-haptics')).toBeDisabled()
  await expect(page.locator('#haptics-note')).toContainText('이 브라우저는 게임 진동을 지원하지 않아요')
  await page.locator('#feedback-test').click()
  await expect(page.locator('#toast')).toContainText('버튼 반동과 효과음')
})

test('the opted-in native bridge receives a delayed TNT impact and the live toggle stops all later pulses', async ({ page }) => {
  await preferences(page)
  await nativeBridge(page)
  await customBoard(page)
  await page.evaluate(() => { (window as FeedbackWindow).__feedbackMessages = [] })
  await tnt(page)
  await expect.poll(() => page.evaluate(() => (window as FeedbackWindow).__feedbackMessages.some(message => message.kind === 'tnt'))).toBe(true)
  const result = await page.evaluate(() => ({ messages: (window as FeedbackWindow).__feedbackMessages, release: (window as FeedbackWindow).__lastBoardRelease }))
  const impacts = result.messages.filter(message => message.kind === 'tnt')
  expect(impacts).toHaveLength(1)
  expect(impacts[0]!.time - result.release).toBeGreaterThan(50)
  expect(impacts[0]!.intensity).toBe(.9)
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  await page.locator('#settings-open').click()
  await expect(page.locator('#haptics-note')).toContainText('아이폰 햅틱이 연결됐어요')
  await expect(page.locator('#setting-haptics')).toBeEnabled()
  await page.locator('#setting-haptics').uncheck()
  expect(await page.evaluate(() => (window as FeedbackWindow).__feedbackMessages.at(-1)?.kind)).toBe('cancel')
  await page.evaluate(() => { (window as FeedbackWindow).__feedbackMessages = [] })
  await page.locator('#feedback-test').click()
  expect(await page.evaluate(() => (window as FeedbackWindow).__feedbackMessages)).toEqual([])
})

test('native scene suspension freezes an active turn and resumes it without consuming another move', async ({ page }) => {
  await preferences(page)
  await nativeBridge(page)
  await customBoard(page)
  await page.evaluate(() => { (window as FeedbackWindow).__feedbackMessages = [] })
  await tnt(page)
  await expect.poll(() => page.evaluate(() => (window as FeedbackWindow).__feedbackMessages.some(message => message.kind === 'tnt'))).toBe(true)
  const paused = await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('chroma-native-active', { detail: false }))
    return { board: (window as FeedbackWindow).__royalSnapshot, messages: (window as FeedbackWindow).__feedbackMessages }
  })
  expect(paused.board.turn).toBe(1)
  expect(paused.board.moves).toBe(fixture.moves - 1)
  expect(paused.board.locked.length).toBeGreaterThan(0)
  expect(paused.messages.at(-1)?.kind).toBe('cancel')
  // Allow multiple real animation frames while the native scene is inactive.
  await page.waitForTimeout(350)
  expect(await page.evaluate(() => (window as FeedbackWindow).__royalSnapshot)).toEqual(paused.board)
  expect(await page.evaluate(() => (window as FeedbackWindow).__feedbackMessages)).toEqual(paused.messages)
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('chroma-native-active', { detail: true })))
  await expect.poll(() => page.evaluate(() => (window as FeedbackWindow).__royalSnapshot.time)).toBeGreaterThan(paused.board.time)
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('#board')).toHaveAttribute('data-turn', '1')
  await expect(page.locator('#moves')).toHaveText(String(fixture.moves - 1))
  expect(await page.evaluate(() => (window as FeedbackWindow).__feedbackMessages.filter(message => message.kind === 'tnt'))).toHaveLength(1)
})

test('a vibration-capable browser receives one grouped TNT pattern instead of one pulse per tile', async ({ page }) => {
  await preferences(page)
  await page.addInitScript(() => {
    const target = window as FeedbackWindow
    target.__vibrationPatterns = []
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (pattern: number | number[]) => { target.__vibrationPatterns.push(pattern); return true } })
  })
  await customBoard(page)
  await page.evaluate(() => { (window as FeedbackWindow).__vibrationPatterns = [] })
  await tnt(page)
  await expect.poll(() => page.evaluate(() => (window as FeedbackWindow).__vibrationPatterns.some(pattern => JSON.stringify(pattern) === '[22,12,34]'))).toBe(true)
  const patterns = await page.evaluate(() => (window as FeedbackWindow).__vibrationPatterns)
  expect(patterns.filter(pattern => JSON.stringify(pattern) === '[22,12,34]')).toHaveLength(1)
  expect(patterns.length).toBeLessThan(6)
})
