import { expect, test, type Page } from '@playwright/test'
import { Game } from '../../src/game/game.ts'
import { MISSIONS, missionFor } from '../../src/game/campaign.ts'
import { recordOf, verifyRun } from '../../src/game/replay.ts'
import { bestMove } from '../../src/game/autoplay.ts'
import { readPlayer } from './player-helper.ts'
import { BOARD } from '../../src/game/types.ts'

async function boot(page: Page, completed: Record<string,number> = {}) {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com|seed-san\.vrm/, route => route.abort())
  await page.addInitScript(() => {
    localStorage.setItem('chroma-match:lang', 'ko')
    localStorage.setItem('chroma.skin', 'paper')
    localStorage.setItem('chroma-match:granted', '1')
  })
  if (Object.keys(completed).length) await page.addInitScript(completed => localStorage.setItem('chroma-match:campaign-v1', JSON.stringify({version:1,completed})),completed)
  await page.goto('./')
  await expect(page.locator('#splash')).toBeHidden()
  await expect(page.locator('#screen-map')).toBeVisible()
}
async function region(page: Page, name: string) {
  if (await page.locator('[data-camera="world"]').isVisible()) await page.locator('[data-camera="world"]').click()
  await page.locator(`[data-region="${name}"]`).click()
}
function completedRecord(id: string) {
  const m = missionFor(id)!, g = new Game({}, m.seed, BOARD, 6, m.id)
  for (let step = 0; step < 70 && g.status === 'playing'; step++) {
    if (g.feverCharge === 100) g.activateFever()
    if (step < 3) g.useItem('bomb', BOARD.idx(2, 4))
    else if (step < 6) g.useItem('rocket', BOARD.idx(2, step - 3))
    else { const move = bestMove(g)!; g.drag(move.a, move.b) }
    for (let i = 0; i < 4000 && g.phaseKind !== 'idle'; i++) g.update(1 / 60)
  }
  expect(g.status).toBe('levelComplete')
  const record = recordOf(g)
  expect(verifyRun(record, BOARD).claimMatches).toBe(true)
  return record
}
async function aim(page: Page, cell: number) {
  await page.locator('#board').focus()
  for (let i = 0; i < BOARD.cols; i++) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < BOARD.rows; i++) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < BOARD.colOf(cell); i++) await page.keyboard.press('ArrowRight')
  for (let i = 0; i < BOARD.rowOf(cell); i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
}

async function assertMapGeometry(page: Page) {
  const geometry = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll<HTMLElement>('.world-pin, .world-mission[aria-pressed="true"], .map-camera-controls button, .world-quick, #world-play, #map-wallet, #map-profile, .world-utilities > button, .world-nav > button, .world-list > summary')].filter(e => e.getClientRects().length)
    const rects = nodes.map(e => ({ id: e.id || e.dataset.region || `mission-${e.dataset.missionStep}`, r: e.getBoundingClientRect(), e }))
    const failures: string[] = []
    for (const { id, r, e } of rects) {
      if (r.width < 44 || r.height < 44) failures.push(`${id}: target <44px`)
      if (r.x < -.5 || r.y < -.5 || r.right > innerWidth + .5 || r.bottom > innerHeight + .5) failures.push(`${id}: clipped`)
      if (!e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))) failures.push(`${id}: occluded`)
    }
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]!, b = rects[j]!
      if (Math.min(a.r.right, b.r.right) - Math.max(a.r.x, b.r.x) > .5 && Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.y, b.r.y) > .5) failures.push(`${a.id}/${b.id}: overlap`)
    }
    const art = document.getElementById('world-art')!.getBoundingClientRect()
    if (art.width !== innerWidth || art.height !== innerHeight) failures.push('map background not full viewport')
    return failures
  })
  expect(geometry, `Map geometry at ${JSON.stringify(page.viewportSize())}`).toEqual([])
}

test('production map opens without 3D, previews locks and clears a real mission with keyboard items', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  let models = 0; page.on('request', r => { if (r.url().includes('seed-san.vrm')) models++ })
  await page.setViewportSize({ width: 390, height: 844 }); await boot(page)
  expect(models).toBe(0)
  expect(await page.evaluate(() => 'chroma' in window)).toBe(false)
  await expect(page.locator('#world-image')).toBeVisible()
  expect(await page.locator('#world-image').evaluate(e => (e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await region(page,'volcano')
  await expect(page.locator('#world-play')).toBeDisabled()
  await expect(page.locator('#world-note')).toContainText('보석숲 1')
  await region(page,'forest')
  await page.locator('[data-mission-step="2"]').click()
  await expect(page.locator('#world-play')).toBeDisabled()
  await expect(page.locator('#world-note')).toContainText('미션 1')
  await page.locator('[data-mission-step="1"]').click()
  await page.locator('#world-play').focus(); await page.keyboard.press('Enter')
  await page.locator('#loadout-start').click()
  await expect(page.locator('#level')).toHaveText('보석숲 · 1/30')
  await expect(page.locator('#moves')).toHaveText('20')
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  for (let i = 0; i < 3; i++) {
    await page.locator('[data-item="bomb"]').click(); await aim(page, BOARD.idx(2, 4))
    await expect(page.locator('[data-count="bomb"]')).toHaveText(String(2 - i))
    await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  }
  await expect(page.locator('#overlay-title')).toHaveText('미션 클리어!')
  await expect(page.locator('.result-growth')).toContainText('Lv.1 → Lv.2')
  await page.screenshot({path:info.outputPath('first-clear-growth.png')})
  await expect(page.locator('.result-rewards')).toContainText('+60')
  await expect(page.locator('.result-rewards [data-game-icon="hammer"]')).toBeVisible()
  expect((await readPlayer(page)).stash.hammer).toBe(1)
  const progress = (await readPlayer(page)).campaign
  expect(progress.completed['forest-1']).toBe(1150)
  expect((await readPlayer(page)).coins).toBe(60)
  await page.emulateMedia({reducedMotion:'no-preference'})
  await expect(page.locator('.result-fireworks')).toBeVisible()
  await expect(page.locator('.result-fireworks i')).toHaveCount(36)
  await page.emulateMedia({reducedMotion:'reduce'})
  await expect(page.locator('.result-fireworks')).toBeHidden()
  for(const size of [{width:320,height:568},{width:390,height:690},{width:844,height:390}]){
    await page.setViewportSize(size)
    await page.locator('#overlay-action').scrollIntoViewIfNeeded()
    expect(await page.locator('#overlay-action').evaluate(el=>{
      const r=el.getBoundingClientRect();return r.width>=44&&r.height>=44&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))
    })).toBe(true)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    if(size.width>=600){
      expect(await page.locator('#overlay-title').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})).toBe(true)
      expect(await page.locator('.result-rewards').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})).toBe(true)
    }
    await page.screenshot({path:info.outputPath(`victory-${size.width}x${size.height}.png`)})
  }
  await page.setViewportSize({width:390,height:844})
  await page.locator('#overlay-home').click()
  await expect(page.locator('#world-progress')).toHaveText('1/120')
  await expect(page.locator('[data-mission-step="2"]')).toHaveAttribute('aria-pressed', 'true')
  expect(await page.locator('#world-track-earned path').evaluateAll(paths => paths.map(p => (p as SVGPathElement).style.opacity))).toEqual(['1', ...Array(28).fill('0')])
  await expect(page.locator('#world-note')).toBeHidden()
  for (const r of ['volcano', 'prism', 'relay']) await expect(page.locator(`[data-region="${r}"]`)).toHaveAttribute('data-state', 'available')
  await page.screenshot({ path: info.outputPath('first-clear-map.png') })
  await page.reload(); await expect(page.locator('#splash')).toBeHidden()
  await expect(page.locator('#world-progress')).toHaveText('1/120')
  await region(page,'forest')
  await page.locator('[data-mission-step="1"]').click()
  await expect(page.locator('#world-play')).toHaveAccessibleName(/재도전/)
  await page.locator('#map-settings').click(); await page.keyboard.press('Escape')
  await expect(page.locator('#sheet-settings')).toBeHidden()
  await expect(page.locator('[data-mission-step="1"]')).toHaveAttribute('aria-pressed', 'true')
  expect(errors).toEqual([])
})

test('production regional entry, spent-stock continue and cancelled replacement preserve exact mission context', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await boot(page, {'forest-1':1150})
  await region(page,'prism')
  await expect(page.locator('#world-context')).toContainText('3색')
  await page.locator('#world-play').click(); await page.locator('#loadout-start').click()
  await expect(page.locator('#level')).toHaveText('프리즘해변 · 1/30 · 3색 축제')
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  await page.locator('[data-item="hammer"]').click(); await aim(page, 0)
  await expect(page.locator('[data-count="hammer"]')).toHaveText('2')
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  await page.locator('#pause').click(); await page.locator('#paused-keep').click()
  await expect(page.locator('#screen-map')).toBeVisible()
  await expect(page.locator('#map-continue')).toContainText('프리즘해변')
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('chroma-match:suspended')!).record)
  expect(kept.moves.startsWith('zq0z')).toBe(true)
  expect(verifyRun(kept, BOARD).claimMatches).toBe(true)
  await region(page,'volcano'); await page.locator('#world-play').click()
  await page.locator('#overlay-action').click(); await page.locator('#loadout-cancel').click()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('chroma-match:suspended')!).record)).toEqual(kept)
  await page.reload(); await expect(page.locator('#splash')).toBeHidden()
  await page.locator('#map-continue').click()
  await expect(page.locator('#level')).toHaveText('프리즘해변 · 1/30 · 3색 축제')
  await expect(page.locator('[data-count="hammer"]')).toHaveText('2')
  await page.locator('#pause').click(); await page.locator('#paused-keep').click()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('chroma-match:suspended')!).record)).toEqual(kept)
  expect(errors).toEqual([])
})

test('production verified result reload never duplicates reward; mission scores do not enter endless rankings', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await boot(page)
  const record = completedRecord('forest-1')
  await page.evaluate(record => localStorage.setItem('chroma-match:suspended', JSON.stringify({ record, level: record.level, score: record.score, at: Date.now() })), record)
  await page.reload(); await expect(page.locator('#splash')).toBeHidden()
  await page.locator('#map-continue').click()
  await expect(page.locator('#overlay-title')).toHaveText('미션 클리어!')
  await expect(page.locator('#post-run')).toBeHidden()
  expect((await readPlayer(page)).coins).toBe(60)
  await page.locator('#overlay-home').click()
  await page.evaluate(record => localStorage.setItem('chroma-match:suspended', JSON.stringify({ record, level: record.level, score: record.score, at: Date.now() })), record)
  await page.reload(); await expect(page.locator('#splash')).toBeHidden()
  await page.locator('#map-continue').click()
  await expect(page.locator('.result-growth')).toContainText('+0 XP')
  expect((await readPlayer(page)).coins).toBe(60)
  expect(await page.evaluate(() => localStorage.getItem('chroma-match:best'))).toBeNull()
  expect(errors).toEqual([])
})

test('production fullscreen map controls and native list reflow across locales/themes/folds', async ({ page }, info) => {
  await boot(page)
  for (const [width, height] of [[320, 568], [390, 690], [390, 844], [480, 320], [844, 390], [720, 720], [1280, 800]]) {
    await page.setViewportSize({ width: width!, height: height! })
    for (const skin of ['paper', 'jewel', 'glass']) for (const lang of ['ko', 'en', 'ja', 'zh-Hans']) {
      await page.locator('#map-settings').click()
      await page.locator(`button[data-lang="${lang}"]`).click(); await page.locator(`button[data-skin-id="${skin}"]`).click()
      await page.keyboard.press('Escape')
      await expect(page.locator('#sheet-settings')).toBeHidden()
      await expect(page.locator('#map-settings')).toBeFocused()
      await expect(page.locator('#world-play')).toBeInViewport()
      for (const id of ['map-character', 'map-shop']) await expect(page.locator(`#${id}`)).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await assertMapGeometry(page)
      if (skin === 'paper' && lang === 'ko') await page.screenshot({ path: info.outputPath(`map-${width}x${height}.png`) })
    }
  }
  await page.setViewportSize({ width: 320, height: 568 })
  await page.locator('#world-list-label').click()
  await page.locator('[data-list-region="relay"]').focus(); await page.keyboard.press('Enter')
  await expect(page.locator('[data-region="relay"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#world-play')).toBeDisabled()
  await expect(page.locator('#world-list-label')).toBeFocused()
  await page.locator('#world-list-label').click()
  await page.locator('#map-character').focus()
  await expect(page.locator('.world-list')).not.toHaveAttribute('open', '')
  await page.locator('#world-list-label').click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.world-list')).not.toHaveAttribute('open', '')
  await expect(page.locator('#world-list-label')).toBeFocused()
  await region(page,'forest')
  await page.addStyleTag({ content: ':root { --text-xs:24px; --text-sm:28px; --text-lg:30px; --text-xl:36px; --text-2xl:44px; }' })
  await page.locator('#world-play').focus()
  await expect(page.locator('#world-play')).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await assertMapGeometry(page)
  await page.screenshot({ path: info.outputPath('map-enlarged-text.png') })
})

test('production map and campaign progress survive offline reload; utilities and shop return to the map', async ({ page, context }) => {
  await boot(page)
  await page.locator('#map-today').click(); await expect(page.locator('#sheet-today')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.locator('#map-ranks').click(); await expect(page.locator('#sheet-ranks')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.locator('#map-shop').click(); await expect(page.locator('#screen-shop')).toBeVisible()
  await page.locator('#shop-back').click(); await expect(page.locator('#screen-map')).toBeVisible()
  await page.locator('#map-wallet').click(); await expect(page.locator('#screen-shop')).toBeVisible()
  await page.locator('#shop-back').click(); await expect(page.locator('#screen-map')).toBeVisible()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await page.reload(); await expect(page.locator('#splash')).toBeHidden()
  await expect.poll(() => page.evaluate(async () => Boolean(await caches.match(location.href)))).toBe(true)
  await context.setOffline(true)
  try {
    await page.reload(); await expect(page.locator('#splash')).toBeHidden()
    await expect(page.locator('#screen-map')).toBeVisible()
    expect(await page.locator('#world-image').evaluate(e => (e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    await page.locator('#world-play').click(); await page.locator('#loadout-start').click()
    await expect(page.locator('#moves')).toHaveText(String(MISSIONS[0]!.moves))
  } finally { await context.setOffline(false) }
})

test('production visited regional terraces and five shared destinations survive offline recovery',async({page,context})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'})
  await boot(page)
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true)
  await page.reload();await expect(page.locator('#splash')).toBeHidden()
  for(const name of ['forest','volcano','prism','relay']){
    await region(page,name)
    await expect(page.locator('#world-image')).toHaveAttribute('src',new RegExp(`chroma-${name}-`))
    await expect.poll(()=>page.locator('#world-image').evaluate(async e=>Boolean(await caches.match((e as HTMLImageElement).src)))).toBe(true)
  }
  await expect.poll(()=>page.evaluate(async()=>Boolean(await caches.match(location.href)))).toBe(true)
  await context.setOffline(true)
  try{
    await page.reload();await expect(page.locator('#splash')).toBeHidden()
    for(const name of ['forest','volcano','prism','relay']){
      await region(page,name)
      await expect(page.locator('.world-mission')).toHaveCount(30)
      await expect.poll(()=>page.locator('#world-image').evaluate(e=>(e as HTMLImageElement).naturalWidth)).toBe(2048)
      const last=page.locator('[data-mission-step="30"]')
      await last.focus();await page.keyboard.press('Enter');await expect(last).toHaveAttribute('aria-pressed','true')
    }
    for(const [id,sheet] of [['map-today','sheet-today'],['map-ranks','sheet-ranks']]){
      await page.locator(`#${id}`).focus();await page.keyboard.press('Enter')
      await expect(page.locator(`#${sheet}`)).toBeVisible();await page.keyboard.press('Escape')
      await expect(page.locator(`#${id}`)).toBeFocused()
    }
    await page.locator('#map-shop').click();await expect(page.locator('#screen-shop')).toBeVisible()
    await expect(page.locator('.hub-nav #map-today')).toBeVisible()
  }finally{await context.setOffline(false)}
})

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`production map earned feedback originates from the cleared node and respects ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion })
    await page.setViewportSize({ width: 390, height: 690 }); await boot(page)
    await region(page,'forest')
    const beacon = () => page.locator('[data-mission-step="1"]').evaluate(e => getComputedStyle(e, '::before').animationName)
    expect(await beacon()).toBe(reducedMotion === 'reduce' ? 'none' : 'world-ready')
    const record = completedRecord('forest-1')
    await page.evaluate(record => localStorage.setItem('chroma-match:suspended', JSON.stringify({ record, level: record.level, score: record.score, at: Date.now() })), record)
    await page.reload(); await expect(page.locator('#splash')).toBeHidden()
    await page.evaluate(() => {
      const flights: Array<{ x: number; y: number }> = []
      Object.assign(window, { mapFlights: flights })
      new MutationObserver(records => {
        for (const r of records) for (const node of r.addedNodes) {
          if (node instanceof HTMLElement && node.classList.contains('world-reward-particle'))
            flights.push({ x: parseFloat(node.style.left), y: parseFloat(node.style.top) })
        }
      }).observe(document.getElementById('screen-map')!, { childList: true })
    })
    await page.locator('#map-continue').click()
    await expect(page.locator('#overlay-title')).toHaveText('미션 클리어!')
    await page.locator('#overlay-home').click()
    await expect(page.locator('[data-mission-step="2"]')).toHaveAttribute('aria-pressed', 'true')
    const feedback = await page.evaluate(() => {
      const selectedRegion = document.getElementById('screen-map')!.dataset.mapView === 'region'
      const node = document.querySelector(selectedRegion ? '[data-mission-step="1"]' : '[data-region="forest"]')!.getBoundingClientRect()
      const root = document.getElementById('screen-map')!.getBoundingClientRect()
      return { flights: (window as unknown as { mapFlights: Array<{ x: number; y: number }> }).mapFlights, origin: { x: node.x + node.width / 2 - root.x, y: node.y + node.height / 2 - root.y } }
    })
    expect(feedback.flights).toHaveLength(reducedMotion === 'reduce' ? 0 : 5)
    for (const flight of feedback.flights) {
      // CSS serializes fractional pixels to fewer decimal places.
      expect(flight.x).toBeCloseTo(feedback.origin.x, 3)
      expect(flight.y).toBeCloseTo(feedback.origin.y, 3)
    }
    await expect(page.locator('.world-reward-particle')).toHaveCount(0)
    await page.locator('[data-mission-step="1"]').click()
    await page.locator('#map-settings').click(); await page.keyboard.press('Escape')
    await expect(page.locator('#sheet-settings')).toBeHidden()
    await expect(page.locator('[data-mission-step="1"]')).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => (window as unknown as { mapFlights: unknown[] }).mapFlights.length)).toBe(reducedMotion === 'reduce' ? 0 : 5)
    expect((await readPlayer(page)).coins).toBe(60)
  })
}

test('production map keeps controls usable when art or campaign storage is unavailable', async ({ page }, info) => {
  await page.route(/\/chroma-world-v\d+\.(jpg|webp)(?:\?.*)?$/, route => route.abort())
  await page.addInitScript(() => {
    Object.defineProperty(window,'indexedDB',{get:()=>{throw new DOMException('Blocked','SecurityError')}})
  })
  await page.setViewportSize({ width: 320, height: 568 }); await boot(page)
  await expect(page.locator('#world-art')).toHaveClass(/art-unavailable/)
  await expect(page.locator('#world-note')).toContainText('저장 공간')
  await expect(page.locator('#world-play')).toBeEnabled()
  await page.screenshot({ path: info.outputPath('map-art-storage-fallback.png') })
  await assertMapGeometry(page)
  await page.locator('#world-list-label').focus(); await page.keyboard.press('Enter')
  await expect(page.locator('[data-list-region="forest"]')).toBeVisible()
  await page.locator('#map-settings').click()
  await expect(page.locator('.world-list')).not.toHaveAttribute('open', '')
  await page.keyboard.press('Escape'); await expect(page.locator('#sheet-settings')).toBeHidden()
  await page.locator('#world-play').click(); await page.locator('#loadout-start').click()
  await expect(page.locator('#moves')).toHaveText('20')
})
