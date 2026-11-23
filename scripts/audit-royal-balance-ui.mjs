#!/usr/bin/env node
// Run against a local development server. Only mouse input changes the game.
// node scripts/audit-royal-balance-ui.mjs 6,20,23,30,12073 [output-directory]
import {createRequire} from 'node:module'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import fs from 'node:fs/promises'
import {getLevel} from '../src/royal/levels.ts'
import {chooseVisibleMove} from './royal-balance-policy.mjs'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(root+'/package.json')
const {chromium,expect}=require('@playwright/test')
const ids=(process.argv[2]??'6,20,23,30,12073').split(',').map(Number)
const out=resolve(process.argv[3]??root+'/test-results/royal-balance-ui')
const base=process.env.ROYAL_BALANCE_URL??'http://127.0.0.1:5173/'
await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
const results=[]
try{
 for(const id of ids){
  const page=await browser.newPage({viewport:{width:393,height:852},locale:'ko-KR'})
  const errors=[],frames=[];page.on('pageerror',error=>errors.push(error.message))
  await page.addInitScript(()=>localStorage.setItem('chroma-royale:preferences:v2',JSON.stringify({seed:2026,randomRetry:false,speed:1.4,sound:false,haptics:false,hints:false,calm:false,unlimitedTools:false,unlimitedMoves:false,forceSuper:false,boosters:[]})))
  await page.goto(`${base}?play=1&level=${id}`)
  await expect(page.locator('#board')).toHaveAttribute('data-level',String(id))
  const level=getLevel(id),snapshot=()=>page.evaluate(()=>window.__royalSnapshot)
  await page.screenshot({path:`${out}/level-${id}-start.jpg`,type:'jpeg',quality:82})
  for(let action=0;action<80;action++){
   await expect(page.locator('#board')).toHaveAttribute('aria-busy','false')
   const s=await snapshot();if(frames.length&&s.turn<frames.at(-1).turn)throw Error('Game restarted during audit; freeze source changes before running');frames.push({turn:s.turn,moves:s.moves,status:s.status,goals:s.goals,obstacles:s.obstacles.map(o=>({id:o.id,hp:o.hp,stock:o.stock,open:o.open}))})
   if(s.status!=='playing')break
   const move=chooseVisibleMove({...s,level,locked:new Set(s.locked),combo:0})
   if(!move)throw Error(`No visible choice for ${id} turn ${s.turn}`)
   const [a,b]=Array.isArray(move)?move:move.cells
   const box=await page.locator('#board').boundingBox(),size=Math.min((box.width-14)/s.cols,(box.height-14)/s.rows)
   const point=c=>({x:box.x+(box.width-size*s.cols)/2+(c%s.cols+.5)*size,y:box.y+(box.height-size*s.rows)/2+(Math.floor(c/s.cols)+.5)*size})
   const from=point(a),to=point(b)
   if(a===b)await page.mouse.click(from.x,from.y)
   else{await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:4});await page.mouse.up()}
   await expect(page.locator('#board')).toHaveAttribute('data-turn',String(s.turn+1))
   await page.mouse.move(1,1)
   if(action===5){await expect(page.locator('#board')).toHaveAttribute('aria-busy','false');await page.screenshot({path:`${out}/level-${id}-turn6.jpg`,type:'jpeg',quality:82})}
  }
  const final=await snapshot()
  if(final.status==='playing')throw Error('Action limit exceeded')
  await expect(page.locator('#result-dialog')).toBeVisible()
  await page.screenshot({path:`${out}/level-${id}-end.jpg`,type:'jpeg',quality:82})
  const result={id,seedOffset:2026,speed:1.4,status:final.status,turn:final.turn,moves:final.moves,goals:final.goals,errors,frames}
  if(errors.length)throw Error(JSON.stringify(errors))
  results.push(result);console.log(JSON.stringify({id,status:final.status,turn:final.turn,moves:final.moves,goals:final.goals}))
  await page.close()
 }
}finally{await browser.close();await fs.writeFile(out+'/report-'+ids.join('-')+'.json',JSON.stringify({method:'Actual mouse swipes/taps at normal UI settings, 1.4x built-in speed. Fresh storage for each board, default move budget, no starting boosters, super-lightball, tools, or state mutation. Visible-board automated policy; not human win-rate evidence.',results},null,2))}
