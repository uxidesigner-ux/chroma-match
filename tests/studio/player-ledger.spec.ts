import { expect, test, type Page } from '@playwright/test'
import { Game } from '../../src/game/game.ts'
import { missionFor } from '../../src/game/campaign.ts'
import { bestMove } from '../../src/game/autoplay.ts'
import { recordOf, missionOf, type RunRecord } from '../../src/game/replay.ts'
import { BOARD } from '../../src/game/types.ts'
import type { PlayerLedger } from '../../src/player/ledger.ts'
import { readPlayer } from '../release/player-helper.ts'

function cleared(id = 'forest-1', rules: 6 | 7 = 7): RunRecord {
  const m = missionFor(id)!, g = new Game({}, m.seed, BOARD, rules, id)
  for (let step = 0; step < 70 && g.status === 'playing'; step++) {
    if (g.feverCharge === 100) g.activateFever()
    if (step < 3) g.useItem('bomb', BOARD.idx(2, 4))
    else if (step < 6) g.useItem('rocket', BOARD.idx(2, step - 3))
    else { const move = bestMove(g)!; g.drag(move.a, move.b) }
    for (let i = 0; i < 4000 && g.phaseKind !== 'idle'; i++) g.update(1/60)
  }
  expect(g.status).toBe('levelComplete'); return recordOf(g)
}
async function boot(page: Page) {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com|seed-san\.vrm/, route => route.abort())
  await page.addInitScript(() => { localStorage.setItem('chroma-match:granted','1'); localStorage.setItem('chroma-match:lang','ko') })
  await page.goto('/?seed=7'); await expect(page.locator('#splash')).toBeHidden()
}
async function claim(page: Page, id: string, record: RunRecord) {
  return page.evaluate(async ({id,record,mission}) => {
    const player = (window as unknown as {chroma: {player: PlayerLedger}}).chroma.player
    await player.begin(id, true, 0, Date.now(), [], `7:${record.seed >>> 0}:${mission}`)
    return player.settle(id, record, 'cleared', true)
  }, {id,record,mission:missionOf(record)?.id ?? ''})
}

test('keeping during a real item cascade then replacing the run retains its accepted play statistics',async({page})=>{
  await boot(page)
  await page.locator('#map-freeplay').click();await page.locator('#loadout-start').click()
  await expect(page.locator('#board')).toBeVisible()
  const paused = await page.evaluate(()=>{
    const g=window.chroma.game,used=g.useItem('bomb',26)
    document.getElementById('pause')!.click()
    return {used,phase:g.phaseKind,score:g.score}
  })
  expect(paused).toEqual({used:true,phase:'strike',score:90})
  await page.locator('#paused-keep').click()
  await expect(page.locator('#screen-map')).toBeVisible()
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('chroma-match:suspended')!).record.score)).toBe(750)
  await page.locator('#map-freeplay').click();await page.locator('#overlay-action').click()
  await page.locator('#loadout-start').click();await expect(page.locator('#board')).toBeVisible()
  const state=await readPlayer(page)
  expect(state.stats.totals.free.rounds).toBe(1)
  expect(state.stats.totals.free.items.bomb).toBe(1)
  expect(state.stats.recent[0]?.outcome).toBe('quit')
  expect(state.growth.totalXp).toBe(0)
  expect(state.stats.totals.adventure.rounds).toBe(0)
})

test('native transactions serialize tabs, deduplicate rewards and distinguish a genuine replay', async ({page, context}) => {
  await boot(page); const second = await context.newPage(); await boot(second)
  const record = cleared(), id = 'test-attempt-1'
  const results = await Promise.all([claim(page,id,record), claim(second,id,record)])
  expect(results.map(r=>r.xp).sort()).toEqual([0,100])
  let state = await readPlayer(page)
  expect(state.coins).toBe(60); expect(state.growth.totalXp).toBe(100)
  expect(state.stats.totals.adventure.rounds).toBe(1)
  await claim(second,'test-attempt-2',record)
  state = await readPlayer(page)
  expect(state.coins).toBe(60); expect(state.growth.totalXp).toBe(140)
  expect(state.stats.totals.adventure.rounds).toBe(2)
  const altered = cleared('forest-2')
  const invalid = await page.evaluate(async ({record,altered}) => {
    const p = (window as unknown as {chroma: {player: PlayerLedger}}).chroma.player
    return [await p.settle('missing-attempt',record,'cleared',true),await p.settle('test-attempt-1',altered,'cleared',true),await p.settle('test-attempt-2',{...record,score:record.score+1},'cleared',true)]
  }, {record,altered})
  expect(invalid.map(r=>r.ok)).toEqual([false,false,false])
  expect((await readPlayer(page)).campaign.completed['forest-2']).toBeUndefined()
  await second.close()
})

test('earned cosmetics retain keyboard focus and apply to profile, hub and gameplay',async({page})=>{
  await boot(page)
  for (let step=1;step<=5;step++) await claim(page,`cosmetic-${step}`,cleared(`forest-${step}`))
  await expect(page.locator('#hub-level')).toHaveText('Lv.5')
  await expect(page.locator('#map-profile')).toHaveAccessibleName(/내 프로필/)
  await page.locator('#map-profile').click()
  await expect(page.locator('#sheet-profile-title')).toBeFocused()
  await page.locator('#cosmetics-heading').click()
  const leaf=page.locator('[data-choice="frame:leaf"]')
  await leaf.focus();await page.keyboard.press('Enter')
  await expect(leaf).toHaveAttribute('aria-pressed','true')
  await expect(leaf).toBeFocused()
  await expect(page.locator('#profile-preview')).toHaveAttribute('data-frame','leaf')
  const title=page.locator('[data-choice="title:spark"]')
  await title.focus();await page.keyboard.press('Enter')
  await expect(title).toHaveAttribute('aria-pressed','true');await expect(title).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('.hub-header')).toHaveAttribute('data-frame','leaf')
  await expect(page.locator('#hub-title')).toHaveText('반짝임을 만드는 자')
  await expect.poll(()=>page.evaluate(()=>{
    const header=document.querySelector('.hub-header')!.getBoundingClientRect()
    return [...document.querySelectorAll<HTMLElement>('.world-pin')].every(e=>e.getBoundingClientRect().top>=header.bottom+4)
  })).toBe(true)
  await page.locator('#world-play').click();await page.locator('#loadout-start').click()
  await expect(page.locator('#hud-character')).toHaveAttribute('data-frame','leaf')
  expect((await readPlayer(page)).growth.frame).toBe('leaf')
})

test('legacy campaign migration pays only proved clears once; old wallet changes cannot overwrite it', async ({page}) => {
  const record=cleared('forest-1',6)
  await page.addInitScript(record=>localStorage.setItem('chroma-match:suspended',JSON.stringify({record,level:record.level,score:record.score,at:Date.now()})),record)
  await page.addInitScript(() => {
    localStorage.setItem('chroma-match:coins','7')
    localStorage.setItem('chroma-match:campaign-v1',JSON.stringify({version:1,completed:{'forest-1':1150,'forest-2':1900,'unknown-99':10000}}))
  })
  await boot(page)
  const state = await readPlayer(page)
  expect(state.growth.totalXp).toBe(200); expect(state.coins).toBe(27)
  await page.reload(); await expect(page.locator('#splash')).toBeHidden()
  expect((await readPlayer(page)).coins).toBe(27)
  await expect(page.locator('#hub-level')).toHaveText('Lv.2')
  await page.locator('#map-continue').click()
  await expect(page.locator('#overlay-title')).toHaveText('미션 클리어!')
  const reopened=await readPlayer(page)
  expect(reopened.growth.totalXp).toBe(200)
  expect(reopened.coins).toBe(27)
  expect(reopened.stats.totals.adventure.rounds).toBe(0)
})

test('quota failure retains pending proof, does not claim a reward, and retry commits once', async ({page}) => {
  await boot(page)
  const record = cleared()
  await page.evaluate(record => localStorage.setItem('chroma-match:suspended',JSON.stringify({record,level:record.level,score:record.score,at:Date.now()})),record)
  await page.reload(); await expect(page.locator('#splash')).toBeHidden()
  await page.evaluate(() => {
    const transaction = IDBDatabase.prototype.transaction
    Object.assign(window,{restorePlayerTransaction:()=>{IDBDatabase.prototype.transaction=transaction}})
    IDBDatabase.prototype.transaction = function(...args: Parameters<typeof transaction>) {
      if (args[1] === 'readwrite') throw new DOMException('Quota exceeded','QuotaExceededError')
      return transaction.apply(this,args)
    }
  })
  await page.locator('#map-continue').click()
  await expect(page.locator('#overlay-title')).toContainText('저장')
  expect((await readPlayer(page)).growth.totalXp).toBe(0)
  expect(await page.evaluate(()=>Boolean(localStorage.getItem('chroma-match:suspended')))).toBe(true)
  await page.evaluate(()=>(window as unknown as {restorePlayerTransaction:()=>void}).restorePlayerTransaction())
  await page.locator('#overlay-action').click()
  await expect(page.locator('#overlay-title')).toHaveText('미션 클리어!')
  expect((await readPlayer(page)).growth.totalXp).toBe(100)
  expect(await page.evaluate(()=>localStorage.getItem('chroma-match:suspended'))).toBeNull()
})

test('My Play shows actual sample/average and reset preserves growth, wallet and avatar', async ({page},info) => {
  await page.setViewportSize({width:390,height:844}); await boot(page)
  await claim(page,'profile-proof',cleared())
  await page.locator('#map-profile').click()
  await expect(page.locator('#player-level')).toHaveText('Lv.2')
  await expect(page.locator('#stats-sample')).toContainText('1')
  await expect(page.locator('#stats-used')).toHaveText('3')
  await expect(page.locator('#stats-average')).toHaveText('3.0')
  await page.locator('[data-mode="free"]').click()
  await expect(page.locator('#stats-average')).toHaveText('—')
  await page.locator('[data-mode="adventure"]').click()
  await page.locator('#stats-reset').scrollIntoViewIfNeeded()
  await expect(page.locator('#profile-close')).toBeInViewport()
  await expect(page.locator('#profile-close')).toHaveAccessibleName('닫기')
  const before=await readPlayer(page),avatar=await page.evaluate(()=>localStorage.getItem('chroma-match:avatar'))
  await page.screenshot({path:info.outputPath('player-growth-stats.png')})
  await page.locator('#stats-reset').click(); await page.locator('#stats-confirm-no').click()
  await expect(page.locator('#stats-sample')).toContainText('1')
  await page.locator('#stats-reset').click(); await page.locator('#stats-confirm-yes').click()
  await expect(page.locator('#stats-sample')).toContainText('0')
  const after=await readPlayer(page)
  expect(after.growth).toEqual(before.growth); expect(after.coins).toBe(before.coins)
  expect(after.campaign).toEqual(before.campaign)
  expect(await page.evaluate(()=>localStorage.getItem('chroma-match:avatar'))).toBe(avatar)
  await page.locator('#profile-close').click()
  await expect(page.locator('#sheet-profile')).toBeHidden()
  await expect(page.locator('#map-profile')).toBeFocused()
})

test('an aborted result write rolls back XP, coins, completion and round together',async({page})=>{
  await boot(page)
  const record=cleared()
  const rejected=await page.evaluate(async record=>{
    const p=(window as unknown as {chroma:{player:PlayerLedger}}).chroma.player
    await p.begin('abort-result',true,0,Date.now(),[],`7:${record.seed}:forest-1`)
    const put=IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put=function(...args:Parameters<typeof put>){throw new DOMException('Quota exceeded','QuotaExceededError')}
    try{await p.settle('abort-result',record,'cleared',true);return false}
    catch{return true}
    finally{IDBObjectStore.prototype.put=put}
  },record)
  expect(rejected).toBe(true)
  const before=await readPlayer(page)
  expect(before.coins).toBe(0); expect(before.growth.totalXp).toBe(0)
  expect(before.campaign.completed['forest-1']).toBeUndefined()
  expect(before.attempts['abort-result']!.finished).toBe(false)
  expect(before.stats.totals.adventure.rounds).toBe(0)
  await claim(page,'abort-result',record)
  expect((await readPlayer(page)).growth.totalXp).toBe(100)
})

test('corrupt nested ledger data is retained, while session-only basic play remains available',async({page})=>{
  await boot(page)
  await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('chroma-match-player-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
    try{await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('player','readwrite'),store=tx.objectStore('player'),r=store.get('current')
      r.onsuccess=()=>{r.result.stash.hammer=NaN;store.put(r.result,'current')}
      tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error)
    })}finally{db.close()}
  })
  await page.reload();await expect(page.locator('#splash')).toBeHidden()
  await expect(page.locator('#world-note')).toContainText('저장')
  expect(Number.isNaN((await readPlayer(page)).stash.hammer)).toBe(true)
  await page.locator('#world-play').click();await page.locator('#loadout-start').click()
  await expect(page.locator('#screen-game')).toBeVisible()
  await expect(page.locator('[data-count="hammer"]')).toHaveText('3')
  expect(Number.isNaN((await readPlayer(page)).stash.hammer)).toBe(true)
})
