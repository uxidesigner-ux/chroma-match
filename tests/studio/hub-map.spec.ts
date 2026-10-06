import { expect, test, type Page } from '@playwright/test'
const touchTest = test.extend({hasTouch:true})

async function boot(page: Page) {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com|seed-san\.vrm/, route=>route.abort())
  await page.addInitScript(()=>{localStorage.setItem('chroma-match:granted','1');localStorage.setItem('chroma-match:lang','ko')})
  await page.goto('/?seed=7'); await expect(page.locator('#splash')).toBeHidden()
}

test('camera keeps 52px stage targets, pans without selecting, keyboard reveals stages and shared navigation preserves camera', async ({page},info)=>{
  await page.setViewportSize({width:390,height:844}); await boot(page)
  await page.locator('[data-region="forest"]').click()
  await expect(page.locator('.world-mission')).toHaveCount(30)
  const read=()=>page.locator('.world-plane').evaluate(e=>getComputedStyle(e).transform)
  const size=()=>page.locator('[data-mission-step="1"]').evaluate(e=>e.getBoundingClientRect().width)
  const original=await read()
  await page.locator('[data-camera="in"]').click()
  expect(await read()).not.toBe(original); expect(await size()).toBeCloseTo(52,1)
  await page.mouse.move(210,440); await page.mouse.down(); await page.mouse.move(230,540,{steps:8}); await page.mouse.up()
  await expect(page.locator('[data-mission-step="1"]')).toHaveAttribute('aria-pressed','true')
  expect(await page.evaluate(()=>document.documentElement.scrollTop)).toBe(0)
  await page.locator('[data-mission-step="30"]').focus()
  await expect(page.locator('[data-mission-step="30"]')).toBeInViewport()
  await page.locator('#world-art').focus(); await page.keyboard.press('Home')
  await expect(page.locator('[data-mission-step="1"]')).toBeInViewport()
  await expect.poll(()=>page.locator('.world-plane').evaluate(e=>{
    const actual=new DOMMatrix(getComputedStyle(e).transform),target=new DOMMatrix((e as HTMLElement).style.transform)
    return Math.abs(actual.m41-target.m41)+Math.abs(actual.m42-target.m42)
  })).toBeLessThan(.1)
  await page.screenshot({path:info.outputPath('forest-region-mobile.png')})
  const camera=await read()
  await page.locator('#map-shop').click()
  await expect(page.locator('.hub-header')).toBeVisible(); await expect(page.locator('#map-shop')).toHaveAttribute('aria-current','page')
  await page.locator('#map-shop').click() // Re-selecting the tab must not replace its return destination.
  await page.locator('#shop-back').click()
  await expect(page.locator('#screen-map')).toBeVisible();await expect(page.locator('#map-shop')).toBeFocused()
  expect(await read()).toBe(camera)
  await page.locator('#map-shop').click()
  await page.locator('#world-list-label').click()
  await expect(page.locator('#screen-map')).toBeVisible(); expect(await read()).toBe(camera)
  await page.locator('#world-art').focus(); await page.keyboard.press('Escape')
  await expect(page.locator('#screen-map')).toHaveAttribute('data-map-view','world')
  await page.locator('#map-character').click()
  await expect(page.locator('#screen-home')).toBeVisible(); await expect(page.locator('#map-character')).toHaveAttribute('aria-current','page')
  await page.locator('#start-game').click(); await page.locator('#loadout-start').click()
  await expect(page.locator('.hub-header')).toBeHidden(); await expect(page.locator('.hub-nav')).toBeHidden()
  await expect(page.locator('#hud-player-level')).toHaveText('Lv.1')
})

test('world overview fixed controls remain visible and unoccluded across phone, fold and desktop sizes',async({page},info)=>{
  await boot(page)
  for(const [width,height]of[[320,568],[390,690],[390,844],[480,320],[844,390],[720,720],[1280,800]]){
    await page.setViewportSize({width:width!,height:height!})
    await expect.poll(()=>page.evaluate(()=>{
      const nodes=[...document.querySelectorAll<HTMLElement>('.world-pin,.world-quick,#world-play,#map-wallet,#map-profile,.world-utilities > button,.world-nav > button,.world-list > summary')]
      const errors:string[]=[]
      for(const e of nodes){const r=e.getBoundingClientRect();const name=e.id||e.dataset.region||e.className
        if(r.width<44||r.height<44)errors.push(`${name}:size`)
        if(r.x<0||r.y<0||r.right>innerWidth+.5||r.bottom>innerHeight+.5)errors.push(`${name}:clip`)
        if(!e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)))errors.push(`${name}:occluded`)
      }
      if(document.documentElement.scrollWidth>innerWidth)errors.push('overflow')
      return errors
    }),{message:`${width}x${height} map target geometry`}).toEqual([])
    await page.screenshot({path:info.outputPath(`world-${width}x${height}.png`)})
  }
})

touchTest('two-finger zoom keeps targets fixed, and touch cancellation does not swallow subsequent keyboard selection',async({page})=>{
  await page.setViewportSize({width:390,height:844});await boot(page)
  await page.locator('[data-region="forest"]').click()
  await expect(page.locator('[data-mission-step="1"]')).toBeInViewport()
  const matrix=()=>page.locator('.world-plane').evaluate(e=>getComputedStyle(e).transform)
  const before=await matrix(),session=await page.context().newCDPSession(page)
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:170,y:400,id:1},{x:230,y:400,id:2}]})
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:130,y:400,id:1},{x:270,y:400,id:2}]})
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  expect(await matrix()).not.toBe(before)
  expect(await page.locator('[data-mission-step="1"]').evaluate(e=>e.getBoundingClientRect().width)).toBeCloseTo(52,1)
  await expect(page.locator('[data-mission-step="1"]')).toHaveAttribute('aria-pressed','true')
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:220,y:420,id:3}]})
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:220,y:490,id:3}]})
  await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]})
  await page.locator('[data-mission-step="2"]').focus();await page.keyboard.press('Enter')
  await expect(page.locator('[data-mission-step="2"]')).toHaveAttribute('aria-pressed','true')
  expect(await page.evaluate(()=>document.documentElement.scrollTop)).toBe(0)
  await session.detach()
})
