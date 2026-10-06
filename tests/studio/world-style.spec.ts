import { test, expect, type Page } from '@playwright/test'
async function boot(page:Page) {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com|seed-san\.vrm/,r=>r.abort())
  await page.addInitScript(()=>{
    localStorage.setItem('chroma-match:granted','1');localStorage.setItem('chroma-match:lang','ko')
    localStorage.setItem('chroma-match:campaign-v1',JSON.stringify({version:1,completed:{'forest-1':1150}}))
  })
  await page.goto('/?seed=7');await expect(page.locator('#splash')).toBeHidden()
}
test('all four regions have thirty accessible stages, terrain selection and original dimensional props',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});await boot(page)
  await expect(page.locator('#world-progress')).toHaveText('1/120')
  for(const name of ['forest','volcano','prism','relay']) {
    await page.locator(`[data-region="${name}"]`).click()
    await expect(page.locator('.world-mission')).toHaveCount(30)
    await page.locator('[data-mission-step="30"]').focus()
    await expect(page.locator('[data-mission-step="30"]')).toBeInViewport()
    expect(await page.locator('[data-mission-step="30"]').evaluate(e=>e.getBoundingClientRect().width)).toBeCloseTo(52,1)
    // Let the 30fps decorative surface present the same camera as native nodes.
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))))
    expect(await page.locator('#world-art').evaluate(e=>[e.scrollLeft,e.scrollTop])).toEqual([0,0])
    expect(await page.locator('.map-life-surface').evaluate(e=>e.getBoundingClientRect().x)).toBe(0)
    await page.screenshot({path:info.outputPath(`${name}-30.png`)})
    await page.locator('[data-camera="world"]').click()
    await expect(page.locator('.region-glow')).toHaveAttribute('data-selection-region',name)
    expect(await page.locator('.region-glow').evaluate(e=>getComputedStyle(e).clipPath)).toContain('polygon')
    expect(await page.locator(`[data-region="${name}"]`).evaluate(e=>getComputedStyle(e).borderWidth)).toBe('0px')
  }
  await expect(page.locator('#map-character')).toHaveAccessibleName('캐릭터')
  await expect(page.locator('#map-shop')).toHaveAccessibleName(/상점/)
  expect(await page.locator('#map-nav-current').evaluate(e=>e.getBoundingClientRect().width)).toBe(1)
  await expect(page.locator('.hub-nav .icon-fallback')).toHaveCount(0)
  for(const name of ['map','character','shop','gear','help','bomb','star','lock','coin']) {
    const r=await page.request.get(`/ui-icons/${name}-v1.webp`);expect(r.ok()).toBe(true)
    expect(r.headers()['content-type']).toContain('image/webp')
  }
})
test('icon-only hub stays inside phone, fold, landscape and desktop with shop return intact',async({page},info)=>{
  await boot(page)
  for(const [width,height] of [[320,568],[390,844],[720,720],[844,390],[1280,800]]) {
    await page.setViewportSize({width:width!,height:height!})
    for(const id of ['world-list-label','map-character','map-shop','map-profile']) {
      await expect(page.locator(`#${id}`)).toBeInViewport()
      expect(await page.locator(`#${id}`).evaluate(e=>{const r=e.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight&&r.width>=44&&r.height>=44})).toBe(true)
    }
    await page.screenshot({path:info.outputPath(`hub-${width}x${height}.png`)})
  }
  await page.locator('#map-shop').click();await expect(page.locator('#screen-shop')).toBeVisible()
  await expect(page.locator('#map-shop')).toHaveAttribute('aria-current','page')
  await page.locator('#shop-back').click();await expect(page.locator('#screen-map')).toBeVisible()
})
test('missing icon images retain visual fallback and accessible actions',async({page})=>{
  await page.route('**/ui-icons/**',r=>r.abort());await boot(page)
  await expect(page.locator('#map-shop .game-icon')).toHaveClass(/icon-fallback/)
  await expect(page.locator('#map-shop')).toHaveAccessibleName(/상점/)
  await page.locator('#map-shop').click();await expect(page.locator('#screen-shop')).toBeVisible()
})
