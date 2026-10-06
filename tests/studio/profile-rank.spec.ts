import { test, expect, type Page } from '@playwright/test'
import { neededXp } from '../../src/player/model.ts'

async function boot(page:Page) {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com|seed-san\.vrm/,r=>r.abort())
  await page.addInitScript(()=>{localStorage.setItem('chroma-match:granted','1');localStorage.setItem('chroma-match:lang','ko')})
  await page.goto('/?seed=7');await expect(page.locator('#splash')).toBeHidden()
}
async function seedLevel(page:Page,level:number) {
  let xp=0;for(let i=1;i<level;i++)xp+=neededXp(i)
  await page.evaluate(async xp=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('chroma-match-player-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('player','readwrite'),s=tx.objectStore('player'),r=s.get('current')
      r.onsuccess=()=>{const state=r.result;state.growth.totalXp=xp;s.put(state,'current')}
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)
    });db.close()
  },xp)
  await page.reload();await expect(page.locator('#splash')).toBeHidden()
}

test('six earned frame tiers surround cached portraits and share readable level plaques',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});await boot(page)
  for(const [level,tier] of [[1,'bronze'],[3,'silver'],[10,'gold'],[20,'crystal'],[35,'royal'],[50,'legend']] as const){
    if(level>1)await seedLevel(page,level)
    await expect(page.locator('#map-profile')).toHaveAttribute('data-rank',tier)
    await expect(page.locator('#hub-level')).toHaveText(`Lv.${level}`)
    await expect(page.locator('.rank-art-fallback')).toHaveCount(0)
    expect(await page.evaluate(async tier=>{
      const image=new Image();image.src=`/profile-frames/${tier}-v1.webp`;await image.decode()
      const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d')!
      ctx.drawImage(image,0,0,256,256);return [ctx.getImageData(128,128,1,1).data[3],ctx.getImageData(0,0,1,1).data[3]]
    },tier)).toEqual([0,0])
    await page.screenshot({path:info.outputPath(`hub-${tier}.png`)})
  }
  await page.locator('#map-profile').click()
  await expect(page.locator('#profile-rank')).toHaveAttribute('data-rank','legend')
  await expect(page.locator('#profile-level')).toHaveText('Lv.50')
  // Measure in one frame: the sheet's entrance translates both elements.
  expect(await page.evaluate(()=>{
    const b=document.getElementById('profile-level')!.getBoundingClientRect(),n=document.getElementById('profile-name-input')!.getBoundingClientRect()
    return b.right<=n.left || b.bottom<=n.top
  })).toBe(true)
  await page.screenshot({path:info.outputPath('profile-legend.png'),animations:'disabled'})
  await page.locator('#profile-close').click()
  await expect(page.locator('#map-profile')).toBeFocused()
  await page.locator('#map-freeplay').click();await page.locator('#loadout-start').click()
  await expect(page.locator('.hud-face')).toHaveAttribute('data-rank','legend')
  await expect(page.locator('#hud-player-level')).toHaveText('Lv.50')
  expect(await page.locator('#hud-player-level').evaluate(e=>getComputedStyle(e).backgroundImage)).toContain('badge-v1.webp')
  await expect(page.locator('#board')).toBeInViewport()
  await page.screenshot({path:info.outputPath('game-legend.png')})
})

test('large levels and narrow screens retain wallet space, keyboard focus and motion preference',async({page},info)=>{
  await page.emulateMedia({reducedMotion:'reduce'});await boot(page);await seedLevel(page,9999)
  for(const [width,height] of [[320,568],[390,844],[844,390],[720,720]]) {
    await page.setViewportSize({width,height})
    await expect(page.locator('#hub-level')).toHaveText('Lv.9999')
    const a=await page.locator('#map-profile').boundingBox(),name=await page.locator('#map-name').boundingBox()
    expect(a!.x+a!.width).toBeLessThanOrEqual(name!.x)
    expect(await page.locator('#hub-level').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true)
    await expect(page.locator('#map-profile')).toBeInViewport()
    await page.screenshot({path:info.outputPath(`rank-${width}.png`)})
  }
  await seedLevel(page,10000)
  await expect(page.locator('#hub-level')).toHaveText('Lv.10K')
  await expect(page.locator('#hub-level')).toHaveAccessibleName('Lv.10000')
  await page.locator('#map-profile').focus();await page.keyboard.press('Enter')
  await expect(page.locator('#sheet-profile-title')).toBeFocused()
})

test('unavailable ornaments retain an outlined portrait, legible level and accessible profile',async({page})=>{
  await page.route('**/profile-frames/**',r=>r.abort());await boot(page)
  await expect(page.locator('#map-profile')).toHaveClass(/rank-art-fallback/)
  await expect(page.locator('#hub-level')).toHaveClass(/profile-level-fallback/)
  await expect(page.locator('#map-profile')).toHaveAccessibleName(/내 프로필/)
  await page.locator('#map-profile').click();await expect(page.locator('#profile-level')).toHaveText('Lv.1')
})

test('a short phone leaves two landmark rows clear even with a storage-error footer',async({page})=>{
  await page.setViewportSize({width:320,height:568})
  await page.addInitScript(()=>Object.defineProperty(window,'indexedDB',{get:()=>{throw new DOMException('Blocked','SecurityError')}}))
  await boot(page)
  await expect(page.locator('#world-note')).toBeVisible()
  // The asynchronous storage error enlarges the footer; its ResizeObserver
  // repositions landmarks on the next layout frame. Assert settled geometry.
  await expect.poll(()=>page.locator('.world-pin').evaluateAll(pins=>{
    const rects=pins.map(p=>p.getBoundingClientRect())
    return rects.every((a,i)=>rects.every((b,j)=>i===j||a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top))
  })).toBe(true)
})
