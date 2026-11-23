import { test, expect, type CDPSession, type Page } from '@playwright/test'

type Point = { x: number; y: number }
type Piece = { id: number; colour: number; power?: string } | null
type Snapshot = {
  moves: number; turn: number; locked: number[]; pieces: Piece[];
  goals: { remaining: number }[]; time: number;
}
type InspectWindow = Window & { __royalSnapshot: Snapshot; __acceptedMotion?: Snapshot }

const colours = [
  0, 1, 0, 2, 3,
  1, 0, 2, 3, 1,
  2, 3, 1, 0, 2,
  3, 2, 3, 1, 0,
  1, 0, 2, 3, 1,
]
const fixture = {
  version: 1, id: 1, name: '동작 검수 정원', cols: 5, rows: 5,
  mask: Array(5).fill('11111'), moves: 20, difficulty: 'normal', colours: 4, seed: 321,
  goals: [{ kind: 'colour', colour: 0, count: 100 }], obstacles: [], jelly: [],
  pieces: colours.map((colour, cell) => ({ cell, colour, ...(cell === 24 ? { power: 'tnt' } : {}) })),
  provenance: 'custom',
}

test.use({ viewport: { width: 390, height: 844 } })

async function openBoard(page: Page, speed = 1, level = fixture): Promise<void> {
  await page.addInitScript(({ level, speed }) => {
    localStorage.setItem('chroma-royale:preferences:v2', JSON.stringify({
      seed: 2026, randomRetry: false, hints: false, sound: false, calm: false, speed,
    }))
    localStorage.setItem('chroma-royale:custom-level:v2', JSON.stringify(level))
  }, { level, speed })
  await page.goto('/?play=1')
  await page.locator('#editor-open').click()
  await page.locator('#editor-play').click()
  await expect(page.locator('#mission-name')).toHaveText(level.name)
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  expect((await snapshot(page)).pieces.map(piece => piece?.colour)).toEqual(level.pieces.map(piece => piece.colour))
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => (window as InspectWindow).__royalSnapshot)
}

async function point(page: Page, cell: number): Promise<Point> {
  const box = (await page.locator('#board').boundingBox())!
  const size = Math.min((box.width - 14) / 5, (box.height - 14) / 5)
  return {
    x: box.x + (box.width - 5 * size) / 2 + (cell % 5 + .5) * size,
    y: box.y + (box.height - 5 * size) / 2 + (Math.floor(cell / 5) + .5) * size,
  }
}

async function touch(session: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: (Point & { id: number })[]): Promise<void> {
  await session.send('Input.dispatchTouchEvent', {
    type, touchPoints: points.map(p => ({ ...p, radiusX: 2, radiusY: 2, force: 1 })),
  })
}

function unchanged(actual: Snapshot, initial: Snapshot): void {
  expect(actual.moves).toBe(initial.moves)
  expect(actual.turn).toBe(initial.turn)
  expect(actual.goals).toEqual(initial.goals)
  expect(actual.pieces).toEqual(initial.pieces)
}

for (const speed of [.7, 1.4]) test(`a held swipe commits once before release and defers impact at speed ${speed}`, async ({ page }) => {
  await openBoard(page, speed)
  const before = await snapshot(page), from = await point(page, 1), to = await point(page, 6)
  // Capture after the canvas handler in the same input dispatch, before a frame can advance.
  await page.evaluate(() => {
    const observed = window as InspectWindow
    const capture = () => {
      if (!observed.__royalSnapshot.turn) return
      observed.__acceptedMotion = observed.__royalSnapshot
      window.removeEventListener('pointermove', capture)
    }
    window.addEventListener('pointermove', capture)
  })
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y)
  await expect(page.locator('#board')).toHaveAttribute('data-turn', '1')
  const accepted = await page.evaluate(() => (window as InspectWindow).__acceptedMotion)
  expect(accepted).toBeDefined()
  expect(accepted!.moves).toBe(19)
  expect(accepted!.locked.length).toBeGreaterThan(0)
  expect(accepted!.goals).toEqual(before.goals)
  expect(accepted!.pieces[1]).toEqual(before.pieces[6])
  expect(accepted!.pieces[6]).toEqual(before.pieces[1])
  // Keep the pointer down through an entire cascade; movement and release cannot spend again.
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  const settled = await snapshot(page)
  expect(settled.goals[0]!.remaining).toBeLessThanOrEqual(97)
  await page.mouse.move(to.x + 30, to.y + 15)
  await page.mouse.up()
  unchanged(await snapshot(page), settled)
  expect(settled.moves).toBe(19)
})

test('cancelling a touch below the swipe threshold consumes nothing and permits the next swipe', async ({ page }) => {
  await openBoard(page)
  const session = await page.context().newCDPSession(page)
  const before = await snapshot(page), from = await point(page, 1), to = await point(page, 6)
  await touch(session, 'touchStart', [{ ...from, id: 11 }])
  await touch(session, 'touchMove', [{ x: from.x + 3, y: from.y + 3, id: 11 }])
  await touch(session, 'touchCancel', [])
  unchanged(await snapshot(page), before)
  await touch(session, 'touchStart', [{ ...from, id: 12 }])
  await touch(session, 'touchMove', [{ ...to, id: 12 }])
  await expect(page.locator('#board')).toHaveAttribute('data-turn', '1')
  await touch(session, 'touchEnd', [])
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  expect((await snapshot(page)).moves).toBe(19)
})

test('a second finger cannot replace or finish the primary finger gesture', async ({ page }) => {
  await openBoard(page)
  const session = await page.context().newCDPSession(page)
  const before = await snapshot(page), from = await point(page, 1), to = await point(page, 6)
  const other = await point(page, 24), otherEnd = await point(page, 23)
  await touch(session, 'touchStart', [{ ...from, id: 11 }])
  await touch(session, 'touchStart', [{ ...from, id: 11 }, { ...other, id: 22 }])
  await touch(session, 'touchMove', [{ ...from, id: 11 }, { ...otherEnd, id: 22 }])
  // CDP touchEnd lists the contacts being released, not the contacts that remain.
  await touch(session, 'touchEnd', [{ ...otherEnd, id: 22 }])
  unchanged(await snapshot(page), before)
  await touch(session, 'touchMove', [{ ...to, id: 11 }])
  await expect(page.locator('#board')).toHaveAttribute('data-turn', '1')
  await touch(session, 'touchEnd', [])
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  expect((await snapshot(page)).moves).toBe(19)
})

test('a new gesture can match stable columns while another part of the board is moving', async ({ page }) => {
  const independent = [
    0, 1, 2, 3, 0,
    1, 0, 2, 0, 1,
    0, 2, 3, 1, 0,
    2, 3, 1, 2, 3,
    3, 1, 0, 3, 2,
  ]
  await openBoard(page, .7, { ...fixture, pieces: independent.map((colour, cell) => ({ cell, colour })) })
  const first = await point(page, 5), firstTo = await point(page, 6)
  const second = await point(page, 9), secondTo = await point(page, 8)
  await page.mouse.move(first.x, first.y)
  await page.mouse.down()
  await page.mouse.move(firstTo.x, firstTo.y)
  await page.mouse.up()
  const moving = await snapshot(page)
  expect(moving.turn).toBe(1)
  expect(moving.locked.length).toBeGreaterThan(0)
  expect(moving.locked).not.toContain(8)
  expect(moving.locked).not.toContain(9)
  await page.mouse.move(second.x, second.y)
  await page.mouse.down()
  await page.mouse.move(secondTo.x, secondTo.y)
  await page.mouse.up()
  await expect(page.locator('#board')).toHaveAttribute('data-turn', '2')
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  const settled = await snapshot(page)
  expect(settled.moves).toBe(18)
  expect(settled.goals[0]!.remaining).toBeLessThanOrEqual(94)
})

test('right clicking a power-up is ignored while a left click still activates it', async ({ page }) => {
  await openBoard(page)
  const before = await snapshot(page), power = await point(page, 24)
  await page.mouse.click(power.x, power.y, { button: 'right' })
  unchanged(await snapshot(page), before)
  await page.mouse.click(power.x, power.y)
  await expect(page.locator('#board')).toHaveAttribute('data-turn', '1')
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  expect((await snapshot(page)).moves).toBe(19)
})

test('an invalid held swap restores all pieces and does not consume a move on release', async ({ page }) => {
  await openBoard(page)
  const before = await snapshot(page), from = await point(page, 3), to = await point(page, 4)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y)
  await expect.poll(async () => (await snapshot(page)).locked.length).toBe(0)
  await page.mouse.up()
  unchanged(await snapshot(page), before)
  // A valid gesture immediately afterwards proves rejection did not leave the input locked.
  const validFrom = await point(page, 1), validTo = await point(page, 6)
  await page.mouse.move(validFrom.x, validFrom.y)
  await page.mouse.down()
  await page.mouse.move(validTo.x, validTo.y)
  await page.mouse.up()
  await expect(page.locator('#board')).toHaveAttribute('data-turn', '1')
})

for (const destination of ['home', 'restart', 'editor'] as const) test(`${destination} clears a held gesture before returning to the board`, async ({ page }) => {
  await openBoard(page)
  const session = await page.context().newCDPSession(page)
  const before = await snapshot(page), from = await point(page, 1), to = await point(page, 6)
  await touch(session, 'touchStart', [{ ...from, id: 11 }])
  // Mouse/keyboard UI activation can coexist with a held touch (and a second finger can open these controls).
  if (destination === 'home') {
    await page.locator('#game-home').click()
    await page.locator('#home-play').click()
  } else if (destination === 'restart') {
    await page.locator('#restart').click()
    await page.locator('#result-primary').click()
  } else {
    await page.locator('#editor-open').click()
    await page.locator('#editor-close').click()
  }
  await expect(page.locator('#board')).toBeVisible()
  await touch(session, 'touchMove', [{ ...to, id: 11 }])
  await touch(session, 'touchEnd', [])
  unchanged(await snapshot(page), before)
  await touch(session, 'touchStart', [{ ...from, id: 12 }])
  await touch(session, 'touchMove', [{ ...to, id: 12 }])
  await touch(session, 'touchEnd', [])
  await expect(page.locator('#board')).toHaveAttribute('data-turn', '1')
})
