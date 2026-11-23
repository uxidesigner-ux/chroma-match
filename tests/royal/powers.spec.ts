import { test, expect, type Page } from '@playwright/test'
import type { Colour, EffectEvent, GoalState, LevelDefinition, Piece } from '../../src/royal/model.ts'

type Snapshot = {
  time: number; moves: number; turn: number; status: string; locked: number[];
  pieces: (Piece | null)[]; goals: GoalState[];
}
type Frame = { snapshot: Snapshot; events: EffectEvent[] }
type PowerWindow = Window & { __royalSnapshot: Snapshot; __powerFrames: Frame[] }
const source = 12
const lightball: LevelDefinition = {
  version: 1, id: 1, name: '빛줄기 검수 정원', cols: 5, rows: 5,
  mask: Array(5).fill('11111'), moves: 20, difficulty: 'normal', colours: 4, seed: 321,
  goals: [{ kind: 'colour', colour: 0, count: 1000 }], obstacles: [], jelly: [], provenance: 'custom',
  pieces: Array.from({ length: 25 }, (_, cell) => ({
    cell, colour: (Math.floor(cell / 5) + cell % 5) % 4 as Colour,
    ...(cell === source ? { power: 'lightball' as const } : {}),
  })),
}

test.use({ viewport: { width: 390, height: 844 } })

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => (window as PowerWindow).__royalSnapshot)
}
async function frames(page: Page): Promise<Frame[]> {
  return page.evaluate(() => (window as PowerWindow).__powerFrames)
}
async function events(page: Page): Promise<EffectEvent[]> {
  return (await frames(page)).flatMap(frame => frame.events)
}
async function openBoard(page: Page, speed: number, level = lightball): Promise<Snapshot> {
  await page.addInitScript(({ level, speed }) => {
    localStorage.setItem('chroma-royale:preferences:v2', JSON.stringify({
      seed: 2026, randomRetry: false, hints: false, sound: false, haptics: false, calm: false, speed,
    }))
    localStorage.setItem('chroma-royale:custom-level:v2', JSON.stringify(level))
  }, { level, speed })
  await page.goto('/?play=1')
  await page.locator('#editor-open').click()
  await page.locator('#editor-play').click()
  await expect(page.locator('#mission-name')).toHaveText(level.name)
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  // Observe the actual app engine at its existing drain boundary. No production hooks or mutations.
  await page.evaluate(async () => {
    // An already-running Vite server may stamp the app's module URL after HMR.
    // Import that exact module instance rather than a second unstamped constructor.
    const modulePath = performance.getEntriesByType('resource').map(entry => entry.name)
      .filter(url => new URL(url).pathname === '/src/royal/engine.ts').at(-1) ?? '/src/royal/engine.ts'
    const { RoyalEngine } = await import(modulePath) as { RoyalEngine: { prototype: { drainEvents(): EffectEvent[] } } }
    const original = RoyalEngine.prototype.drainEvents, observed = window as PowerWindow
    observed.__powerFrames = []
    RoyalEngine.prototype.drainEvents = function () {
      const result = original.call(this)
      observed.__powerFrames.push({ snapshot: structuredClone(observed.__royalSnapshot), events: structuredClone(result) })
      if (observed.__powerFrames.length > 1500) observed.__powerFrames.shift()
      return result
    }
  })
  await expect.poll(async () => (await frames(page)).length, { intervals: [10, 20, 30] }).toBeGreaterThan(0)
  return snapshot(page)
}
async function tap(page: Page, cell: number): Promise<void> {
  const box = (await page.locator('#board').boundingBox())!
  const size = Math.min((box.width - 14) / 5, (box.height - 14) / 5)
  await page.mouse.click(box.x + (box.width - size * 5) / 2 + (cell % 5 + .5) * size,
    box.y + (box.height - size * 5) / 2 + (Math.floor(cell / 5) + .5) * size)
  await expect(page.locator('#board')).toHaveAttribute('data-turn', '1')
}
async function firstLaunch(page: Page, kind: 'lightball' | 'propeller'): Promise<EffectEvent> {
  await expect.poll(async () => (await events(page)).some(event => event.kind === kind && event.stage === 'launch'), { intervals: [10, 20, 30] }).toBe(true)
  return (await events(page)).find(event => event.kind === kind && event.stage === 'launch')!
}

for (const speed of [.7, 1.4]) test(`lightball removes each selected-colour piece at its own ray arrival at speed ${speed}`, async ({ page }) => {
  const before = await openBoard(page, speed)
  await tap(page, source)
  const launch = await firstLaunch(page, 'lightball')
  expect(launch.from).toBe(source)
  expect(launch.pieces?.[0]?.piece.id).toBe(before.pieces[source]?.id)
  const targets = before.pieces.flatMap((piece, cell) => piece && !piece.power && piece.colour === launch.colour ? [cell] : [])
  expect(targets.length).toBeGreaterThan(2)
  expect(launch.rays!.map(ray => ray.cell).sort((a, b) => a - b)).toEqual(targets)
  expect(launch.rays!.every(ray => ray.duration >= .2 && ray.duration <= .4)).toBe(true)
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  const observed = await frames(page), stream = observed.flatMap(frame => frame.events)
  const activation = stream.find(event => event.kind === 'activate' && event.power === 'lightball')!
  expect(launch.at - activation.at).toBeCloseTo(activation.duration!, 7)
  const arrivalTimes: number[] = []
  for (const ray of launch.rays!) {
    const originalId = before.pieces[ray.cell]!.id, arrival = launch.at + ray.delay + ray.duration
    const impact = stream.find(event => event.kind === 'lightball' && event.stage === 'impact' && event.to === ray.cell)!
    const clear = stream.find(event => event.kind === 'clear' && event.pieces?.some(item => item.piece.id === originalId))!
    expect(impact, `ray ${ray.cell} has an impact`).toBeDefined()
    expect(clear, `ray ${ray.cell} clears the original piece`).toBeDefined()
    expect(impact.at).toBeCloseTo(arrival, 7)
    expect(clear.at).toBeCloseTo(arrival, 7)
    const approaching = observed.filter(frame => frame.snapshot.time >= launch.at && frame.snapshot.time < arrival - 1e-8)
    expect(approaching.length).toBeGreaterThan(0)
    expect(approaching.every(frame => frame.snapshot.pieces[ray.cell]?.id === originalId)).toBe(true)
    const hitFrame = observed.find(frame => frame.events.includes(impact) || frame.events.some(event => event.kind === 'lightball' && event.stage === 'impact' && event.to === ray.cell))!
    expect(hitFrame.snapshot.pieces[ray.cell]).toBeNull()
    arrivalTimes.push(clear.at)
  }
  expect(new Set(arrivalTimes.map(at => at.toFixed(6))).size).toBeGreaterThan(2)
  const settled = await snapshot(page)
  expect(settled.turn).toBe(1)
  expect(settled.moves).toBe(19)
})

for (const destination of ['settings', 'home'] as const) test(`${destination} pauses a lightball volley without losing its pending arrivals`, async ({ page }) => {
  await openBoard(page, .7)
  await tap(page, source)
  const launch = await firstLaunch(page, 'lightball')
  if (destination === 'settings') await page.locator('#settings-open').click()
  else await page.locator('#game-home').click()
  const paused = await snapshot(page)
  expect(paused.locked.length).toBeGreaterThan(0)
  expect(launch.rays!.some(ray => launch.at + ray.delay + ray.duration > paused.time)).toBe(true)
  // Wait on live browser frames, not a guessed animation duration.
  const inactiveFrames = await page.evaluate(async () => {
    const samples: Snapshot[] = []
    for (let i = 0; i < 12; i++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      samples.push(structuredClone((window as PowerWindow).__royalSnapshot))
    }
    return samples
  })
  for (const sample of inactiveFrames) expect(sample).toEqual(paused)
  if (destination === 'settings') await page.locator('#settings-dialog [data-close]').click()
  else await page.locator('#home-play').click()
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  const settled = await snapshot(page), stream = await events(page)
  expect(settled.time).toBeGreaterThan(paused.time)
  expect(settled.turn).toBe(1)
  expect(settled.moves).toBe(19)
  for (const ray of launch.rays!) {
    const impact = stream.find(event => event.kind === 'lightball' && event.stage === 'impact' && event.to === ray.cell)!
    expect(impact.at).toBeCloseTo(launch.at + ray.delay + ray.duration, 7)
  }
})

test('propeller flies to the live box goal instead of an irrelevant multi-layer stone', async ({ page }) => {
  const boxCells = [0, 1], stoneCells = [4], blocked = new Set([...boxCells, ...stoneCells])
  const level: LevelDefinition = {
    ...lightball, name: '목표 비행 검수 정원', goals: [{ kind: 'box', count: 1 }],
    obstacles: [{ id: 'last-box', kind: 'box', cells: boxCells, hp: 1 }, { id: 'irrelevant-stone', kind: 'stone', cells: stoneCells, hp: 3 }],
    pieces: lightball.pieces!.filter(piece => !blocked.has(piece.cell)).map(piece => ({
      cell: piece.cell, colour: piece.colour, ...(piece.cell === 24 ? { power: 'propeller' as const } : {}),
    })),
  }
  await openBoard(page, 1, level)
  await tap(page, 24)
  const flight = await firstLaunch(page, 'propeller')
  expect(boxCells).toContain(flight.to)
  expect(stoneCells).not.toContain(flight.to)
  await expect.poll(async () => (await snapshot(page)).goals[0]!.remaining).toBe(0)
  const observed = await frames(page), stream = observed.flatMap(frame => frame.events)
  const impact = stream.find(event => event.kind === 'propeller' && event.stage === 'impact' && event.to === flight.to)!
  expect(impact.at).toBeCloseTo(flight.at + flight.duration!, 7)
  const beforeImpact = observed.filter(frame => frame.snapshot.time >= flight.at && frame.snapshot.time < impact.at - 1e-8)
  expect(beforeImpact.length).toBeGreaterThan(0)
  expect(beforeImpact.every(frame => frame.snapshot.goals[0]!.remaining === 1)).toBe(true)
  const damage = stream.find(event => event.kind === 'damage' && event.cells.some(cell => boxCells.includes(cell)))!
  expect(damage.at).toBeCloseTo(impact.at, 7)
  expect(stream.some(event => event.kind === 'damage' && event.cells.some(cell => stoneCells.includes(cell)))).toBe(false)
  const hitFrame = observed.find(frame => frame.events.some(event => event.kind === 'propeller' && event.stage === 'impact'))!
  expect(hitFrame.snapshot.goals[0]!.remaining).toBe(0)
  expect(hitFrame.snapshot.moves).toBe(19)
})
