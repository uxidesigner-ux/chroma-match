import { test, expect, type Page } from '@playwright/test'
const prefsKey='chroma-royale:preferences:v2'
async function openGame(page:Page,prefs:Record<string,unknown>={}):Promise<void>{
 await page.addInitScript(({key,prefs})=>localStorage.setItem(key,JSON.stringify({seed:2026,randomRetry:false,hints:false,sound:false,...prefs})),{key:prefsKey,prefs})
 await page.goto('/?play=1');await expect(page.locator('#board')).toBeVisible();await expect(page.locator('#board')).toHaveAttribute('aria-busy','false')
}
async function point(page:Page,cell:number):Promise<{x:number;y:number}>{
 const canvas=page.locator('#board'),box=(await canvas.boundingBox())!,cols=Number(await canvas.getAttribute('data-columns')),rows=Number(await canvas.getAttribute('data-rows')),size=Math.min((box.width-14)/cols,(box.height-14)/rows)
 return {x:box.x+(box.width-cols*size)/2+(cell%cols+.5)*size,y:box.y+(box.height-rows*size)/2+(Math.floor(cell/cols)+.5)*size}
}
async function hintMove(page:Page):Promise<void>{
 const hint=await page.evaluate(()=>((window as unknown as {__royalSnapshot:{hint:[number,number]|null}}).__royalSnapshot.hint));expect(hint).not.toBeNull()
 const a=await point(page,hint![0]),b=await point(page,hint![1]);const turn=Number(await page.locator('#board').getAttribute('data-turn'))
 if(hint![0]===hint![1])await page.mouse.click(a.x,a.y);else{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:4});await page.mouse.up()}
 await expect(page.locator('#board')).toHaveAttribute('data-turn',String(turn+1));await expect(page.locator('#board')).toHaveAttribute('aria-busy','false')
}
const custom=()=>({version:1,id:1,name:'테스트 정원',cols:5,rows:5,mask:Array(5).fill('11111'),moves:20,difficulty:'normal',colours:4,seed:123,goals:[{kind:'box',count:1}],obstacles:[{id:'custom-1',kind:'box',cells:[0],hp:1}],jelly:[],provenance:'custom'})
async function importCustom(page:Page,level:unknown):Promise<void>{
 await page.locator('#editor-open').click();if(!await page.locator('#editor-json').isVisible())await page.locator('.json-tools summary').click();await page.locator('#editor-json').fill(JSON.stringify(level));await page.locator('#editor-import').click();await expect(page.locator('#editor-errors')).toHaveText('')
}
test('starts a local target-based game with no third-party requests or runtime errors',async({page})=>{
 const errors:string[]=[],external:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const u=new URL(r.url());if(/^https?:$/.test(u.protocol)&&u.hostname!=='127.0.0.1')external.push(u.href)})
 await openGame(page);await expect(page.locator('#level-label')).toHaveText('레벨 1');await expect(page.locator('#goals .goal')).toHaveAttribute('aria-label','왕관 20 남음');await expect(page.locator('#board')).toHaveAttribute('data-columns','6');await expect(page.locator('#board')).toHaveAttribute('data-rows','7');await hintMove(page);await expect(page.locator('#moves')).toHaveText('21');expect(errors).toEqual([]);expect(external).toEqual([])
})
test('reference level 12297 uses 9x11 with four goals and settings persist',async({page})=>{
 await openGame(page);await page.locator('#level-picker').click();await page.locator('#reference-level').click();await expect(page.locator('#level-label')).toHaveText('레벨 12297');await expect(page.locator('#board')).toHaveAttribute('data-columns','9');await expect(page.locator('#board')).toHaveAttribute('data-rows','11');await expect(page.locator('#goals .goal')).toHaveCount(4);await expect(page.locator('#mission-kind')).toHaveText('영상 참고')
 await page.locator('#settings-open').click();await page.locator('#setting-unlimitedMoves').check();await page.locator('#setting-unlimitedTools').check();await page.locator('#setting-seed').fill('777');await page.getByRole('button',{name:'이 설정으로 시작하기'}).click();await expect(page.locator('#moves')).toHaveText('∞')
 // A second page shares storage without the first page's test initializer.
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),prefsKey);expect(saved.level).toBe(12297);expect(saved.seed).toBe(777);expect(saved.unlimitedTools).toBe(true)
 const fresh=await page.context().newPage();await fresh.goto('/?play=1');await expect(fresh.locator('#level-label')).toHaveText('레벨 12297');await expect(fresh.locator('#moves')).toHaveText('∞');await fresh.close()
})
test('keyboard hammer targets a cell and spends a tool without spending a move',async({page})=>{
 await openGame(page);const moves=await page.locator('#moves').innerText();await page.locator('[data-tool="hammer"]').click();await page.locator('#board').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowDown');await expect(page.locator('#board-status')).toContainText('2행 2열');await page.keyboard.press('Enter');await expect(page.locator('[data-tool="hammer"] .tool-count')).toHaveText('2');await expect(page.locator('#board')).toHaveAttribute('aria-busy','false');await expect(page.locator('#moves')).toHaveText(moves)
})
test('normal play wins, grants a star, opens the next level and spends a star on the kingdom',async({page})=>{
 test.setTimeout(60000);await openGame(page,{unlimitedMoves:true,speed:1.4})
 for(let i=0;i<70;i++){if(await page.locator('#board').getAttribute('data-status')!=='playing')break;await hintMove(page)}
 await expect(page.locator('#result-title')).toHaveText('멋진 승리!');await expect(page.locator('#star-balance')).toHaveText('★ 1');await page.locator('#result-primary').click();await expect(page.locator('#level-label')).toHaveText('레벨 2');await expect(page.locator('#board')).toHaveAttribute('data-columns','7');await page.locator('#kingdom-open').click();await page.locator('[data-task="garden-1"]').click();await expect(page.locator('#kingdom-stage')).toHaveText('왕실의 정원 · 1/6');await expect(page.locator('#kingdom-stars')).toHaveText('★ 0')
})
test('editor import, paint, save, reload and custom settings preserve the designed board',async({page})=>{
 await openGame(page);await importCustom(page,custom());await page.locator('[data-brush="box"]').click();await page.locator('[data-cell="24"]').click();await page.locator('#editor-save').click();await expect(page.locator('#editor-errors')).toHaveText('');const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('chroma-royale:custom-level:v2')!));expect(new Set(stored.obstacles.map((o:{id:string})=>o.id)).size).toBe(2)
 await page.locator('#editor-play').click();await expect(page.locator('#level-label')).toHaveText('나만의 보드');await expect(page.locator('#board')).toHaveAttribute('data-columns','5');await page.locator('#settings-open').click();await page.locator('#setting-unlimitedMoves').check();await page.getByRole('button',{name:'이 설정으로 시작하기'}).click();await expect(page.locator('#level-label')).toHaveText('나만의 보드');await expect(page.locator('#moves')).toHaveText('∞')
 await page.reload();await page.locator('#editor-open').click();await expect(page.locator('#editor-name')).toHaveValue('테스트 정원');await page.locator('[data-brush="box"]').click();await page.locator('[data-cell="20"]').click();await page.locator('#editor-save').click();await expect(page.locator('#editor-errors')).toHaveText('')
})
test('invalid JSON never replaces the current editor board',async({page})=>{
 await openGame(page);await importCustom(page,custom());await page.locator('#editor-json').fill('{"version":1,"cols":999999}');await page.locator('#editor-import').click();await expect(page.locator('#editor-errors')).not.toHaveText('');await expect(page.locator('#editor-name')).toHaveValue('테스트 정원');await page.locator('#editor-json').fill('{bad');await page.locator('#editor-import').click();await expect(page.locator('#editor-errors')).toContainText('올바른 JSON')
})
test('custom target completion and last-move failure show the correct result without changing campaign streak',async({page})=>{
 await openGame(page);await page.evaluate(()=>localStorage.setItem('chroma-royale:progress:v2',JSON.stringify({completed:[],stars:0,coins:0,tasks:[],streak:3,lightWins:10,superActive:true})));await page.reload();await importCustom(page,custom());await page.locator('#editor-play').click();await page.locator('[data-tool="hammer"]').click();const p=await point(page,0);await page.mouse.click(p.x,p.y);await expect(page.locator('#result-title')).toHaveText('멋진 승리!');await page.locator('#result-dialog [data-close]').click();await importCustom(page,{...custom(),obstacles:[],goals:[{kind:'colour',colour:0,count:500}],moves:1});await page.locator('#editor-play').click();await hintMove(page);await expect(page.locator('#result-title')).toHaveText('레벨 실패!');expect((await page.evaluate(()=>JSON.parse(localStorage.getItem('chroma-royale:progress:v2')!))).streak).toBe(3);await page.locator('#result-primary').click();await expect(page.locator('#moves')).toHaveText('1');await expect(page.locator('#board')).toHaveAttribute('data-status','playing')
})
for(const [width,height]of [[320,568],[390,844],[844,390]])test(`all controls and editor fit ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width:width!,height:height!});await openGame(page,{level:12297});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 for(const b of await page.locator('.tools>button').all()){await expect(b).toBeVisible();const box=(await b.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width!);expect(box.y+box.height).toBeLessThanOrEqual(height!)}
 await page.locator('#settings-open').click();await page.locator('#setting-moves').fill('50');await page.getByRole('button',{name:'이 설정으로 시작하기'}).click();await expect(page.locator('#moves')).toHaveText('50');await page.locator('#editor-open').click();await expect(page.locator('#editor-grid')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
