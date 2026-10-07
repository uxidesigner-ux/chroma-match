import { test,expect,type Page } from '@playwright/test'
async function boot(page:Page) {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com|seed-san\.vrm/,r=>r.abort())
  await page.addInitScript(()=>{
    localStorage.setItem('chroma-match:granted','1');localStorage.setItem('chroma-match:lang','ko')
    // Isolated layout fixtures, not fabricated production scores.
    localStorage.setItem('chroma-match:board',JSON.stringify(Array.from({length:20},(_,i)=>({id:`fixture-${i}`,name:`플레이어 ${i+1}`,score:50000-i*1000,level:i+1,at:i,mine:i===4,run:null}))))
  })
  await page.goto('/?seed=7');await expect(page.locator('#splash')).toBeHidden()
}
test('full-screen rankings preserve real rows, tabs, scrolling and focus return across viewports',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await boot(page)
  await page.locator('#map-ranks').click();await expect(page.locator('#ranks-title')).toBeFocused()
  await expect(page.locator('#ranks-list .rank')).toHaveCount(20)
  await expect(page.locator('#ranks-list')).toHaveAttribute('aria-busy','false')
  for(const [width,height] of [[320,568],[390,844],[844,390],[720,720],[1280,800]]) {
    await page.setViewportSize({width,height})
    expect(await page.locator('#sheet-ranks .sheet-panel').evaluate(e=>{const r=e.getBoundingClientRect();return Math.abs(r.width-innerWidth)<1&&Math.abs(r.height-innerHeight)<1})).toBe(true)
    expect(await page.locator('#ranks-list').evaluate(e=>innerHeight-e.getBoundingClientRect().bottom)).toBeLessThan(32)
    await expect(page.locator('#ranks-close')).toBeInViewport()
    expect(await page.locator('.rank-level').first().evaluate(e=>e.clientWidth)).toBeLessThan(100)
    await page.screenshot({path:info.outputPath(`rank-screen-${width}.png`),animations:'disabled'})
  }
  await page.locator('[data-board="everyone"]').focus();await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-board="friends"]')).toBeFocused()
  await expect(page.locator('[data-board="friends"]')).toHaveAttribute('aria-selected','true')
  await page.keyboard.press('Home');await expect(page.locator('[data-board="everyone"]')).toBeFocused()
  await expect(page.locator('#ranks-list .rank')).toHaveCount(20)
  await page.keyboard.press('Escape');await expect(page.locator('#map-ranks')).toBeFocused()
  await page.locator('#map-ranks').click();await page.locator('#ranks-close').click()
  await expect(page.locator('#sheet-ranks')).toBeHidden();expect(errors).toEqual([])
})
test('dimensional panel controls have a press response without changing hit target geometry',async({page},info)=>{
  await boot(page);await page.locator('#map-profile').click();await page.locator('#map-settings').click()
  await expect(page.locator('#sheet-settings')).toBeVisible()
  const sound=page.locator('#set-sound'),before=await sound.getAttribute('aria-checked')
  await sound.click();await expect(sound).toHaveAttribute('aria-checked',before==='true'?'false':'true')
  const done=page.locator('#settings-done');await done.scrollIntoViewIfNeeded()
  const r=(await done.boundingBox())!;await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down()
  await expect.poll(()=>done.evaluate(e=>getComputedStyle(e).translate)).toBe('0px 4px')
  await page.mouse.up();await expect(page.locator('#sheet-settings')).toBeHidden()
  await page.locator('#map-shop').click();await expect(page.locator('#screen-shop')).toBeVisible()
  await page.setViewportSize({width:390,height:844})
  await expect(page.locator('[data-owned="hammer"]')).toHaveText('×0')
  await page.screenshot({path:info.outputPath('casual-shop.png'),animations:'disabled'})
  await page.setViewportSize({width:320,height:568})
  expect(await page.locator('.shop-row').evaluateAll(es=>es.every(e=>e.getBoundingClientRect().right<=innerWidth))).toBe(true)
  expect(await page.locator('[data-buy]').evaluateAll(es=>es.every(e=>e.getBoundingClientRect().width>=44))).toBe(true)
  await page.locator('#shop-back').click()
  await page.locator('#map-freeplay').click();await page.locator('#loadout-start').click()
  await expect(page.locator('#board')).toBeVisible()
  for(const size of [{width:320,height:568},{width:390,height:844},{width:720,height:720}]){
    await page.setViewportSize(size);await expect(page.locator('#pause')).toBeInViewport()
    expect(await page.locator('#items button:visible').evaluateAll(es=>es.every(e=>e.getBoundingClientRect().width>=44))).toBe(true)
    await page.screenshot({path:info.outputPath(`casual-game-${size.width}.png`)})
  }
})

test('an older failed ranking request cannot erase the newer selected board',async({page})=>{
  await boot(page);await page.locator('#map-ranks').click()
  await expect(page.locator('#ranks-list .rank')).toHaveCount(20)
  await page.evaluate(async()=>{
    const path='/src/ui/home.ts', {HomeScreen}=await import(path)
    let reject!:(e:Error)=>void
    const slow=new Promise((_,r)=>{reject=r})
    const home=new HomeScreen({label:'fixture old',isShared:false,top:()=>slow,best:async()=>null})
    const old=home.refresh()
    home.setFriends(async()=>({label:'fixture fresh',entries:[{id:'fresh',name:'Fresh fixture',score:123,level:1,at:1,mine:false,run:null}]}))
    home.setMode('friends');await home.refresh()
    reject(new Error('fixture old error'));await old
  })
  await expect(page.locator('#ranks-list .rank')).toHaveCount(1)
  await expect(page.locator('.rank-name')).toHaveText('Fresh fixture')
  await expect(page.locator('#ranks-note')).toHaveText('fixture fresh')
  await expect(page.locator('#ranks-list')).toHaveAttribute('aria-busy','false')
})
