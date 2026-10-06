import {expect,test} from '@playwright/test'
import {Game} from '../../src/game/game.ts'
import {missionFor} from '../../src/game/campaign.ts'
import {BOARD} from '../../src/game/types.ts'
import {recordOf} from '../../src/game/replay.ts'
import {readPlayer} from '../release/player-helper.ts'

async function boot(page:import('@playwright/test').Page,step?:number){
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com|seed-san\.vrm/,r=>r.abort())
  await page.addInitScript(()=>{localStorage.setItem('chroma-match:granted','1');localStorage.setItem('chroma-match:lang','ko');localStorage.setItem('chroma.skin','jewel')})
  if(step)await page.addInitScript(step=>localStorage.setItem('chroma-match:campaign-v1',JSON.stringify({version:1,completed:Object.fromEntries(Array.from({length:step-1},(_,i)=>[`forest-${i+1}`,1500]))})),step)
  await page.goto('/?seed=7');await expect(page.locator('#splash')).toBeHidden()
  if(step){
    await page.locator('[data-region="forest"]').click()
    await page.locator(`[data-mission-step="${step}"]`).focus()
    await page.locator(`[data-mission-step="${step}"]`).click()
    await page.locator('#world-play').click()
  }else await page.locator('#map-freeplay').click()
  await page.locator('#loadout-start').click()
}
for(const step of [1,6,13,25])test(`mobile terrain stage ${step} renders and preserves finger targets`,async({page},info)=>{
  await page.setViewportSize({width:390,height:690});await boot(page,step)
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  await expect(page.locator('#level')).toContainText(`${step}/30`)
  const state=await page.evaluate(()=>{
    const g=window.chroma.game
    return {holes:[...g.terrain.voidCells],crates:[...g.terrain.crates],shape:g.terrain.shape}
  })
  if(step>=6)expect(state.holes.length).toBeGreaterThan(0)
  expect(await page.evaluate(()=>window.chroma.renderer.cellSize)).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(()=>['.game-hud','#moves','.goal','#hud-character'].map(selector=>{
    const r=document.querySelector(selector)!.getBoundingClientRect();return {selector,left:r.left,right:r.right,width:r.width}
  }).filter(r=>r.left<-.5||r.right>innerWidth+.5))).toEqual([])
  expect(await page.evaluate(()=>['#moves','#level','#goal-text','.hud-moves .stat-label'].map(selector=>{
    const range=document.createRange();range.selectNodeContents(document.querySelector(selector)!);const r=range.getBoundingClientRect()
    return {selector,left:r.left,right:r.right}
  }).filter(r=>r.left<-.5||r.right>innerWidth+.5))).toEqual([])
  await page.screenshot({path:info.outputPath(`stage-${step}-${state.shape}.png`)})
  expect(await page.evaluate(()=>({left:document.documentElement.scrollLeft,top:document.documentElement.scrollTop,
    viewportLeft:visualViewport?.offsetLeft,gameLeft:document.querySelector('#screen-game')!.getBoundingClientRect().left,
    hudRight:document.querySelector('.game-hud')!.getBoundingClientRect().right}))).toMatchObject({left:0,top:0,viewportLeft:0})
  expect(await page.evaluate(()=>['.game-hud','#moves','.goal','#hud-character'].map(selector=>{
    const r=document.querySelector(selector)!.getBoundingClientRect();return {selector,left:r.left,right:r.right,width:r.width}
  }).filter(r=>r.left<-.5||r.right>innerWidth+.5))).toEqual([])
  if(step>=6){
    const cell=state.crates[0]!,initial=await page.evaluate(cell=>window.chroma.game.grid[cell]?.durability,cell)
    await page.evaluate(cell=>window.chroma.game.useItem('hammer',cell),cell)
    await expect.poll(()=>page.evaluate(cell=>window.chroma.game.grid[cell]?.durability,cell)).toBe(initial!-1)
    await page.evaluate(cell=>{const canvas=document.getElementById('board')!;canvas.focus();for(let i=0;i<6;i++)canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));},cell)
    await page.screenshot({path:info.outputPath(`stage-${step}-damaged.png`)})
  }
  expect(errors).toEqual([])
})

test('first v8 clear pays one real stash item atomically and duplicates cannot pay it again',async({page})=>{
  await boot(page)
  const m=missionFor('forest-1')!,g=new Game({},m.seed,BOARD,8,m.id)
  for(let n=0;n<3;n++){g.useItem('bomb',26);for(let i=0;i<4000&&g.phaseKind!=='idle';i++)g.update(1/60)}
  expect(g.status).toBe('levelComplete');const record=recordOf(g)
  const claim=async(id:string)=>page.evaluate(async({id,record})=>{
    const p=window.chroma.player;await p.begin(id,true,0,Date.now(),[],`8:${record.seed}:forest-1`)
    return p.settle(id,record,'cleared',true)
  },{id,record})
  const before=(await readPlayer(page)).stash.hammer
  expect((await claim('terrain-first')).item).toBe('hammer')
  expect((await claim('terrain-first')).item).toBeUndefined()
  expect((await claim('terrain-replay')).item).toBeUndefined()
  expect((await readPlayer(page)).stash.hammer).toBe(before+1)
  await page.reload();await expect(page.locator('#splash')).toBeHidden()
  expect((await readPlayer(page)).stash.hammer).toBe(before+1)
})
