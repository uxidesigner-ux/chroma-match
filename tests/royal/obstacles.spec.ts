import { test, expect, type Page } from '@playwright/test'
import type { Colour, GoalState, LevelDefinition, ObstacleDefinition, ObstacleState, Piece } from '../../src/royal/model.ts'

type Snapshot = {
  level: number; cols: number; rows: number; time: number; moves: number; turn: number; status: string;
  obstacles: ObstacleState[]; pieces: (Piece | null)[]; goals: GoalState[];
  mask: string[]; jelly: boolean[]; hint: [number, number] | null;
}
type Damage = ReturnType<typeof import('../../src/royal/obstacle-damage.ts').obstacleDamage>
type InspectWindow = Window & { __royalSnapshot: Snapshot; __toolContact?: Snapshot }
const prefsKey = 'chroma-royale:preferences:v2'
const colours = [0, 1, 0, 2, 3, 1, 0, 2, 3, 1, 2, 3, 1, 0, 2, 3, 2, 3, 1, 0, 1, 0, 2, 3, 1]
const target = 12

test.use({ viewport: { width: 390, height: 844 } })

function fixture(obstacle: ObstacleDefinition): LevelDefinition {
  const goal = obstacle.kind === 'gift' ? 'toy' : obstacle.kind
  return {
    version: 1, id: 1, name: '장애물 검수 정원', cols: 5, rows: 5, mask: Array(5).fill('11111'),
    moves: 20, difficulty: 'normal', colours: 4, seed: 321, provenance: 'custom', jelly: [],
    goals: [{ kind: goal, count: ['gift', 'cuckoo', 'dynamite'].includes(obstacle.kind) ? obstacle.stock ?? 1 : 1 }, { kind: 'colour', colour: 0, count: 1000 }],
    obstacles: [obstacle], pieces: colours.flatMap((colour, cell) => obstacle.cells.includes(cell) ? [] : [{ cell, colour: colour as Colour }]),
  }
}
async function state(page: Page): Promise<Snapshot> {
  return page.evaluate(() => (window as unknown as InspectWindow).__royalSnapshot)
}
async function openGame(page: Page, level?: LevelDefinition, campaign = 1): Promise<void> {
  await page.addInitScript(({ level, campaign, prefsKey }) => {
    localStorage.setItem(prefsKey, JSON.stringify({ level: campaign, seed: 2026, randomRetry: false, hints: false, sound: false, haptics: false, speed: 1.4, unlimitedTools: true }))
    if (level) localStorage.setItem('chroma-royale:custom-level:v2', JSON.stringify(level))
  }, { level, campaign, prefsKey })
  await page.goto('/?play=1')
  if (level) {
    await page.locator('#editor-open').click()
    await page.locator('#editor-play').click()
    await expect(page.locator('#mission-name')).toHaveText(level.name)
  }
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  await expect.poll(async () => (await state(page)).obstacles).toBeDefined()
}
async function point(page: Page, cell: number): Promise<{ x: number; y: number }> {
  const { cols, rows } = await state(page), box = (await page.locator('#board').boundingBox())!
  const size = Math.min((box.width - 14) / cols, (box.height - 14) / rows)
  return { x: box.x + (box.width - cols * size) / 2 + (cell % cols + .5) * size,
    y: box.y + (box.height - rows * size) / 2 + (Math.floor(cell / cols) + .5) * size }
}
async function damage(page: Page, id = 'subject'): Promise<{ obstacle: ObstacleState; view: Damage } | undefined> {
  return page.evaluate(async id => {
    const modulePath = '/src/royal/obstacle-damage.ts'
    const { obstacleDamage } = await import(modulePath) as { obstacleDamage(obstacle: ObstacleState): Damage }
    const obstacle = (window as unknown as InspectWindow).__royalSnapshot.obstacles.find(item => item.id === id)
    return obstacle ? { obstacle, view: obstacleDamage(obstacle) } : undefined
  }, id)
}
async function hammer(page: Page, cell = target): Promise<Snapshot> {
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  await page.locator('[data-tool="hammer"]').click()
  await page.evaluate(() => {
    const observed = window as unknown as InspectWindow
    delete observed.__toolContact
    // Observe after the app's pointer handler, before the next frame can trigger a chain.
    window.addEventListener('pointerup', () => { observed.__toolContact = structuredClone(observed.__royalSnapshot) }, { once: true })
  })
  const p = await point(page, cell)
  await page.mouse.click(p.x, p.y)
  await page.mouse.move(1, 1)
  return page.evaluate(() => (window as unknown as InspectWindow).__toolContact!)
}
async function rest(page: Page, contactTime: number): Promise<void> {
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  // Wait in simulation time until transient tool/particle overlays have ended.
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(contactTime + .8)
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}
async function pixels(page: Page, cells: number[]): Promise<string> {
  return page.evaluate(cells => {
    const canvas = document.querySelector<HTMLCanvasElement>('#board')!, box = canvas.getBoundingClientRect()
    const { cols, rows } = (window as unknown as InspectWindow).__royalSnapshot
    const size = Math.min((box.width - 14) / cols, (box.height - 14) / rows), scale = canvas.width / box.width
    const c0 = Math.min(...cells.map(cell => cell % cols)), c1 = Math.max(...cells.map(cell => cell % cols))
    const r0 = Math.min(...cells.map(cell => Math.floor(cell / cols))), r1 = Math.max(...cells.map(cell => Math.floor(cell / cols)))
    const x = ((box.width - cols * size) / 2 + (c0 + .04) * size) * scale
    const y = ((box.height - rows * size) / 2 + (r0 + .04) * size) * scale
    const data = canvas.getContext('2d')!.getImageData(Math.round(x), Math.round(y), Math.round((c1 - c0 + .92) * size * scale), Math.round((r1 - r0 + .92) * size * scale)).data
    let hash = 2166136261
    for (const byte of data) hash = Math.imul(hash ^ byte, 16777619)
    return `${data.length}:${hash >>> 0}`
  }, cells)
}
async function selectObstacle(page: Page, cell = target): Promise<void> {
  const p = await point(page, cell)
  await page.mouse.click(p.x, p.y)
  await page.mouse.move(1, 1)
}
async function capture(page: Page, name: string): Promise<void> {
  await page.locator('#board').screenshot({ path: `/tmp/chroma-obstacle-${name}.png` })
}
async function expectHits(page: Page, count: number): Promise<void> {
  await expect(page.locator('#board-status')).toContainText(new RegExp(`남은[^0-9]*${count}(?:회|타|번|\\s)`))
}

test('a box visibly loses each layer from three hits through removal', async ({ page }) => {
  await openGame(page, fixture({ id: 'subject', kind: 'box', cells: [target], hp: 3 }))
  await selectObstacle(page)
  await expectHits(page, 3)
  await capture(page, 'box-3')
  let previous = await pixels(page, [target])
  for (const remaining of [2, 1, 0]) {
    const contact = await hammer(page)
    expect(contact.moves).toBe(20)
    expect(contact.obstacles[0]?.hp ?? 0).toBe(remaining)
    await rest(page, contact.time)
    await capture(page, `box-${remaining}`)
    const current = await pixels(page, [target])
    expect(current).not.toBe(previous)
    previous = current
    if (remaining) {
      expect((await damage(page))!.view.remainingHits).toBe(remaining)
      await expectHits(page, remaining)
    }
  }
  expect(await damage(page)).toBeUndefined()
  expect((await state(page)).goals[0]!.remaining).toBe(0)
})

test('gift stock is a reward count, while its two remaining hits open all seven toys', async ({ page }) => {
  await openGame(page, fixture({ id: 'subject', kind: 'gift', cells: [12, 13], hp: 2, stock: 7 }))
  await selectObstacle(page)
  await expectHits(page, 2)
  expect((await damage(page))!.view).toMatchObject({ remainingHits: 2, contentCount: 7, repeating: false })
  await capture(page, 'gift-2')
  const before = await pixels(page, [12, 13]), first = await hammer(page)
  expect(first.obstacles[0]).toMatchObject({ hp: 1, stock: 7 })
  await rest(page, first.time)
  await expectHits(page, 1)
  await capture(page, 'gift-1')
  expect(await pixels(page, [12, 13])).not.toBe(before)
  const final = await hammer(page)
  expect(final.obstacles).toHaveLength(0)
  expect(final.goals[0]!.remaining).toBe(0)
})

test('ice with four hit points and two cells reports hits independently of its shrinking length', async ({ page }) => {
  await openGame(page, fixture({ id: 'subject', kind: 'ice', cells: [12, 17], hp: 4 }))
  await selectObstacle(page)
  await expectHits(page, 4)
  const first = await hammer(page)
  expect(first.obstacles[0]).toMatchObject({ hp: 3, cells: [12] })
  await rest(page, first.time)
  await expectHits(page, 3)
  const beforeSecond = await pixels(page, [12]), second = await hammer(page)
  expect(second.obstacles[0]).toMatchObject({ hp: 2, cells: [12] })
  await rest(page, second.time)
  expect((await damage(page))!.view.remainingHits).toBe(2)
  await expectHits(page, 2)
  expect(await pixels(page, [12])).not.toBe(beforeSecond)
  expect((await state(page)).goals[0]!.remaining).toBe(1)
})

test('a stone receives visible permanent damage from a hammer', async ({ page }) => {
  await openGame(page, fixture({ id: 'subject', kind: 'stone', cells: [target], hp: 3 }))
  await selectObstacle(page)
  const before = await pixels(page, [target]), contact = await hammer(page)
  expect(contact.obstacles[0]!.hp).toBe(2)
  await rest(page, contact.time)
  await expectHits(page, 2)
  expect(await pixels(page, [target])).not.toBe(before)
})

test('a closed cuckoo ignores a hammer without changing its shell, contents or rested artwork', async ({ page }) => {
  await openGame(page, fixture({ id: 'subject', kind: 'cuckoo', cells: [12, 13, 17, 18], hp: 2, stock: 2, open: false }))
  await selectObstacle(page)
  await expect(page.locator('#board-status')).toContainText('닫')
  await expectHits(page, 4)
  const beforeState = (await state(page)).obstacles[0]!, before = await pixels(page, beforeState.cells)
  await capture(page, 'nest-closed-before')
  const contact = await hammer(page)
  expect(contact.obstacles[0]).toEqual(beforeState)
  expect(contact.turn).toBe(0)
  await rest(page, contact.time)
  await capture(page, 'nest-closed-after')
  expect((await damage(page))!.view.remainingHits).toBe(4)
  expect(await pixels(page, beforeState.cells)).toBe(before)
})

test('an open cuckoo refills its shell after one bird and preserves the total remaining work', async ({ page }) => {
  await openGame(page, fixture({ id: 'subject', kind: 'cuckoo', cells: [12, 13, 17, 18], hp: 2, stock: 2, open: true }))
  await selectObstacle(page)
  await expectHits(page, 4)
  const before = await pixels(page, [12, 13, 17, 18]), first = await hammer(page)
  expect(first.obstacles[0]).toMatchObject({ hp: 1, stock: 2, open: true })
  await rest(page, first.time)
  await expectHits(page, 3)
  expect(await pixels(page, [12, 13, 17, 18])).not.toBe(before)
  const second = await hammer(page)
  expect(second.obstacles[0]).toMatchObject({ hp: 2, stock: 1, open: true })
  expect(second.goals[0]!.remaining).toBe(1)
  expect(second.turn).toBe(0)
  await rest(page, second.time)
  expect((await damage(page))!.view.remainingHits).toBe(2)
  await expectHits(page, 2)
})

test('dynamite shows shell damage before a charge fires, then refills HP while reducing its stock', async ({ page }) => {
  await openGame(page, fixture({ id: 'subject', kind: 'dynamite', cells: [12, 13, 17, 18], hp: 2, stock: 2, colour: 0 }))
  await selectObstacle(page)
  await expectHits(page, 4)
  const before = await pixels(page, [12, 13, 17, 18]), first = await hammer(page)
  expect(first.obstacles[0]).toMatchObject({ hp: 1, stock: 2, colour: 0 })
  await rest(page, first.time)
  await expectHits(page, 3)
  expect(await pixels(page, [12, 13, 17, 18])).not.toBe(before)
  const second = await hammer(page)
  expect(second.obstacles[0]).toMatchObject({ hp: 2, stock: 1, colour: 1 })
  expect(second.goals[0]!.remaining).toBe(1)
  // This observes the real contact before the resulting global explosion/cascade.
  expect(second.obstacles[0]!.hp + (second.obstacles[0]!.stock! - 1) * second.obstacles[0]!.initialHp).toBe(2)
})

async function jump(page: Page, level: number): Promise<void> {
  await page.locator('#level-picker').click()
  await page.locator('#level-jump').fill(String(level))
  await page.locator('#jump-form button').click()
  await expect(page.locator('#board')).toHaveAttribute('data-level', String(level))
}

test('level one million can be entered through the UI and survives home navigation and saved reload', async ({ page }) => {
  await openGame(page)
  await jump(page, 1000000)
  expect((await state(page)).level).toBe(1000000)
  await page.locator('#game-home').click()
  await expect(page.locator('#home-play')).toHaveAttribute('aria-label', /1000000|1,000,000/)
  await page.locator('#home-play').click()
  await expect(page.locator('#board')).toHaveAttribute('data-level', '1000000')
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).level, prefsKey)).toBe(1000000)
  const fresh = await page.context().newPage()
  await fresh.goto('/?play=1')
  await expect(fresh.locator('#board')).toHaveAttribute('data-level', '1000000')
  await fresh.close()
})

test('legitimately completing campaign level 999999 advances into level one million', async ({ page }) => {
  test.setTimeout(120000)
  await openGame(page, undefined, 999999)
  await page.locator('#settings-open').click()
  await page.locator('#setting-unlimitedMoves').check()
  await page.locator('#settings-form button[type="submit"]').click()
  const useLine = async (tool: 'arrow' | 'cannon', cell: number) => {
    await page.locator(`[data-tool="${tool}"]`).click()
    const p = await point(page, cell)
    await page.mouse.click(p.x, p.y)
  }
  const useHint = async (current: Snapshot) => {
    expect(current.hint, 'an actual move is required to reopen a closed nest or refill target colours').not.toBeNull()
    const [a, b] = current.hint!, from = await point(page, a)
    if (a === b) await page.mouse.click(from.x, from.y)
    else {
      const to = await point(page, b)
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move(to.x, to.y)
      await page.mouse.up()
    }
    await expect(page.locator('#board')).toHaveAttribute('data-turn', String(current.turn + 1))
  }
  for (let actions = 0; actions < 200; actions++) {
    const current = await state(page)
    if (current.status === 'won') break
    expect(current.status).toBe('playing')
    const playable = (cell: number) => current.mask[Math.floor(cell / current.cols)]?.[cell % current.cols] === '1'
    const lines: { tool: 'arrow' | 'cannon'; cells: number[] }[] = [
      ...Array.from({ length: current.rows }, (_, row) => ({ tool: 'arrow' as const, cells: Array.from({ length: current.cols }, (_, col) => row * current.cols + col).filter(playable) })),
      ...Array.from({ length: current.cols }, (_, col) => ({ tool: 'cannon' as const, cells: Array.from({ length: current.rows }, (_, row) => row * current.cols + col).filter(playable) })),
    ]
    const jellyRemaining = current.goals.some(goal => goal.kind === 'jelly' && goal.remaining > 0)
    const spreading = jellyRemaining ? lines.filter(line => line.cells.some(cell => current.jelly[cell]))
      .map(line => ({ ...line, gain: line.cells.filter(cell => !current.jelly[cell]).length })).filter(line => line.gain > 0)
      .sort((a, b) => b.gain - a.gain)[0] : undefined
    const liveObstacles = current.obstacles.filter(obstacle => current.goals.some(goal => goal.remaining > 0 && goal.kind === (obstacle.kind === 'gift' ? 'toy' : obstacle.kind)))
    const hittable = liveObstacles.filter(obstacle => obstacle.kind !== 'cuckoo' || obstacle.open)
    const multiple = lines.map(line => ({ ...line, hits: hittable.filter(obstacle => obstacle.cells.some(cell => line.cells.includes(cell))).length }))
      .filter(line => line.hits > 1).sort((a, b) => b.hits - a.hits)[0]
    const colourLine = lines.map(line => ({ ...line, gain: current.goals.filter(goal => goal.kind === 'colour' && goal.remaining > 0)
      .reduce((sum, goal) => sum + Math.min(goal.remaining, line.cells.filter(cell => {
        const piece = current.pieces[cell]
        return piece && !piece.power && piece.colour === goal.colour
      }).length), 0) })).filter(line => line.gain > 0).sort((a, b) => b.gain - a.gain)[0]
    if (spreading) await useLine(spreading.tool, spreading.cells.find(cell => current.jelly[cell])!)
    else if (multiple) await useLine(multiple.tool, multiple.cells[0]!)
    else if (hittable.length) await hammer(page, hittable[0]!.cells[0]!)
    else if (colourLine) await useLine(colourLine.tool, colourLine.cells[0]!)
    else await useHint(current)
    await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  }
  const completed = await state(page)
  expect(completed.goals.every(goal => goal.remaining === 0), JSON.stringify(completed.goals)).toBe(true)
  expect(completed.status).toBe('won')
  await expect(page.locator('#result-title')).toHaveText('멋진 승리!')
  await page.locator('#result-primary').click()
  await expect(page.locator('#board')).toHaveAttribute('data-level', '1000000')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('chroma-royale:progress:v2')!).completed)).toContain(999999)
})

test('the final safe-integer level page stays exact and cannot paginate beyond its final entry', async ({ page }, testInfo) => {
  await openGame(page)
  await jump(page, Number.MAX_SAFE_INTEGER)
  await page.locator('#level-picker').click()
  await expect(page.locator('#levels-next')).toBeDisabled()
  const ids = await page.locator('#level-grid [data-level]').evaluateAll(buttons => buttons.map(button => Number((button as HTMLElement).dataset.level)))
  expect(ids.length).toBeGreaterThan(0)
  expect(ids.length).toBeLessThanOrEqual(30)
  expect(ids.at(-1)).toBe(Number.MAX_SAFE_INTEGER)
  expect(ids.every(Number.isSafeInteger)).toBe(true)
  expect(new Set(ids).size).toBe(ids.length)
  await page.locator('#levels-prev').click()
  await expect(page.locator('#levels-next')).toBeEnabled()
  await page.locator('#levels-next').click()
  expect(await page.locator('#level-grid [data-level]').evaluateAll(buttons => buttons.map(button => Number((button as HTMLElement).dataset.level)))).toEqual(ids)
  await page.setViewportSize({ width: 375, height: 667 })
  await page.locator('#levels-dialog [data-close]').click()
  await page.locator('#game-home').click()
  const play = page.locator('#home-play'), label = play.locator('[data-home-value="level"]')
  await expect(play).toBeVisible()
  await expect(play).toHaveAttribute('aria-label', `레벨 ${Number.MAX_SAFE_INTEGER} 플레이`)
  await expect(label).toHaveText(`레벨 ${Number.MAX_SAFE_INTEGER}`)
  const textLayout = await label.evaluate(label => {
    const button = label.closest<HTMLButtonElement>('#home-play')!, content = button.querySelector<HTMLElement>('.play-button-content')!
    const bounds = button.getBoundingClientRect(), contentBounds = content.getBoundingClientRect(), css = getComputedStyle(button)
    const range = document.createRange()
    range.selectNodeContents(label)
    return {
      inner: {
        left: Math.max(contentBounds.left, bounds.left + parseFloat(css.borderLeftWidth) + parseFloat(css.paddingLeft)),
        right: Math.min(contentBounds.right, bounds.right - parseFloat(css.borderRightWidth) - parseFloat(css.paddingRight)),
        top: Math.max(contentBounds.top, bounds.top + parseFloat(css.borderTopWidth) + parseFloat(css.paddingTop)),
        bottom: Math.min(contentBounds.bottom, bounds.bottom - parseFloat(css.borderBottomWidth) - parseFloat(css.paddingBottom)),
      },
      fragments: Array.from(range.getClientRects(), rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })),
    }
  })
  expect(textLayout.fragments.length).toBeGreaterThan(0)
  for (const text of textLayout.fragments) {
    expect(text.left).toBeGreaterThanOrEqual(textLayout.inner.left - .5)
    expect(text.right).toBeLessThanOrEqual(textLayout.inner.right + .5)
    expect(text.top).toBeGreaterThanOrEqual(textLayout.inner.top - .5)
    expect(text.bottom).toBeLessThanOrEqual(textLayout.inner.bottom + .5)
  }
  await page.screenshot({ path: testInfo.outputPath('high-level-home.png') })
})
