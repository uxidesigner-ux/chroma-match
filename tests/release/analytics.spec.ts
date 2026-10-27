import {test, expect, type Page} from '@playwright/test'
import {lookup} from 'node:dns/promises'
const GAME = 'https://uxidesigner-ux.github.io/chroma-match/'
const KEY = 'chroma-match:analytics-consent-v1'
type Hit = [string, string, Record<string, unknown>]
test.use({serviceWorkers: 'block'})

/** Serve this build on its allowed hostname, without publishing QA events to Google. */
async function setup(page: Page, choice?: string, blocked = false, lang = 'ko', realTag = false) {
  const events: Hit[] = [], tags: string[] = [], errors: string[] = [], packets: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route(`${GAME}**`, async route => {
    const url = new URL(route.request().url())
    const response = await route.fetch({url: `http://127.0.0.1:5180${url.pathname}${url.search}`})
    await route.fulfill({response})
  })
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com|seed-san\.vrm/, r => r.abort())
  await page.route(/https:\/\/([^/]*google-analytics\.com|analytics\.google\.com)\//, r => {
    packets.push(`${r.request().url()} ${r.request().postData() ?? ''}`)
    if (!realTag) events.push(JSON.parse(r.request().postData()!) as Hit)
    return r.fulfill({status: 204})
  })
  await page.route('https://www.googletagmanager.com/**', route => {
    tags.push(route.request().url())
    if (realTag) return route.continue()
    return blocked ? route.abort() : route.fulfill({contentType: 'application/javascript', body: `
      (()=>{const q=window.dataLayer||[];const send=a=>{a=Array.from(a);if(a[0]==='event'&&!window['ga-disable-G-QH5S96E4FK'])fetch('https://www.google-analytics.com/g/collect',{method:'POST',body:JSON.stringify(a)}).catch(()=>{})};q.forEach(send);const push=q.push.bind(q);q.push=(...items)=>{items.forEach(send);return push(...items)}})();`})
  })
  await page.addInitScript(({choice, lang, key}) => {
    localStorage.setItem('chroma-match:granted', '1'); localStorage.setItem('chroma-match:lang', lang)
    localStorage.setItem('chroma-match:name', 'PRIVATE_NICKNAME')
    if (choice) localStorage.setItem(key, choice)
  }, {choice, lang, key: KEY})
  await page.goto(`${GAME}?seed=7&friend=PRIVATE_EMAIL%40example.com#PRIVATE_AVATAR`)
  await expect(page.locator('#splash')).toBeHidden()
  return {events, tags, errors, packets}
}
async function clearFirstStage(page: Page) {
  await page.locator('#world-play').click(); await page.locator('#loadout-start').click()
  for (let i = 0; i < 3; i++) {
    await page.locator('[data-item="bomb"]').click(); await page.locator('#board').focus()
    for (let n = 0; n < 6; n++) await page.keyboard.press('ArrowLeft')
    for (let n = 0; n < 9; n++) await page.keyboard.press('ArrowUp')
    for (let n = 0; n < 2; n++) await page.keyboard.press('ArrowRight')
    for (let n = 0; n < 4; n++) await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter'); await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  }
  await expect(page.locator('#overlay-title')).toHaveText('미션 클리어!')
}
test('GA4 requires opt-in, measures accepted play once, excludes private fields and stops on withdrawal', async ({page}, info) => {
  await page.setViewportSize({width: 390, height: 844})
  const {events, tags, errors} = await setup(page)
  await expect(page.locator('#analytics-consent')).toBeVisible(); expect(tags).toHaveLength(0); expect(events).toHaveLength(0)
  await expect(page.locator('#analytics-decline')).toBeFocused()
  await page.locator('#analytics-allow').click(); await expect(page.locator('#analytics-consent')).toBeHidden()
  await expect.poll(() => events.filter(e => e[1] === 'page_view').length).toBe(1)
  expect(tags).toHaveLength(1)
  await clearFirstStage(page)
  await expect.poll(() => events.filter(e => e[1] === 'level_end').length).toBe(1)
  expect(events.filter(e => e[1] === 'game_start')).toHaveLength(1)
  expect(events.filter(e => e[1] === 'item_use')).toHaveLength(3)
  expect(events.find(e => e[1] === 'level_end')![2]).toMatchObject({region: 'forest', stage: 1, success: true, outcome: 'cleared', items_used: 3})
  expect(JSON.stringify(events)).not.toMatch(/PRIVATE_|friend=|seed=|avatar|user_id|email/i)
  await page.locator('#overlay-home').click(); await page.locator('#map-profile').click(); await page.locator('#map-settings').click()
  await expect.poll(() => events.filter(e => e[1] === 'menu_open' && e[2].menu === 'settings').length).toBe(1)
  await page.evaluate(() => {document.cookie = 'chroma_match_ga=test; Path=/chroma-match/; Secure'; document.cookie = 'other_project=test; Path=/; Secure'})
  const count = events.length
  await page.locator('#set-analytics').click(); await expect(page.locator('#set-analytics')).toHaveAttribute('aria-checked', 'false')
  expect(await page.evaluate(() => document.cookie)).not.toContain('chroma_match_')
  expect(await page.evaluate(() => document.cookie)).toContain('other_project=test')
  await page.keyboard.press('Escape'); await page.locator('#profile-close').click(); expect(events).toHaveLength(count)
  await page.reload(); await expect(page.locator('#splash')).toBeHidden(); expect(tags).toHaveLength(1); expect(events).toHaveLength(count)
  expect(errors).toEqual([]); await page.screenshot({path: info.outputPath('analytics-off-map.png')})
})
test('declining analytics remains playable, persists and emits no requests', async ({page}) => {
  const {events, tags, errors} = await setup(page)
  await expect(page.locator('#analytics-consent')).toBeVisible(); await page.keyboard.press('Escape')
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBe('denied')
  await clearFirstStage(page); expect(events).toHaveLength(0); expect(tags).toHaveLength(0)
  await page.reload(); await expect(page.locator('#splash')).toBeHidden(); await expect(page.locator('#analytics-consent')).toBeHidden()
  expect(errors).toEqual([])
})
for (const preference of ['doNotTrack', 'globalPrivacyControl']) test(`GA4 respects ${preference} even with a previously allowed choice`, async ({page}) => {
  await page.addInitScript(key => Object.defineProperty(navigator, key, {get: () => key === 'doNotTrack' ? '1' : true}), preference)
  const {events, tags} = await setup(page, 'granted')
  await expect(page.locator('#analytics-consent')).toBeHidden(); expect(tags).toHaveLength(0); expect(events).toHaveLength(0)
  await page.locator('#map-profile').click(); await page.locator('#map-settings').click(); await expect(page.locator('#set-analytics')).toBeDisabled()
})
test('blocked Google scripts cannot break a game or falsely replay telemetry', async ({page}) => {
  const {events, errors} = await setup(page, 'granted', true)
  await clearFirstStage(page); expect(events).toHaveLength(0); expect(errors).toEqual([])
})
test('first-time welcome completes before the optional analytics choice', async ({page}) => {
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) { if (key !== 'chroma-match:granted') set.call(this, key, value) }
  })
  const {tags} = await setup(page)
  await expect(page.locator('#overlay-action')).toBeVisible(); await expect(page.locator('#analytics-consent')).toBeHidden()
  await page.locator('#overlay-action').click(); await expect(page.locator('#analytics-consent')).toBeVisible()
  await page.locator('#analytics-decline').click(); expect(tags).toHaveLength(0)
})
test('real Google tag payloads use the canonical URL and revocation deletes only the game cookies', async ({page}, info) => {
  test.skip(process.env.GA_REAL_TAG_TEST !== '1', 'Optional vendor-network check: set GA_REAL_TAG_TEST=1 on a machine that permits Google Analytics.')
  const addresses = await lookup('www.googletagmanager.com', {all: true}).catch(() => [])
  test.skip(!addresses.length || addresses.every(a => a.address === '0.0.0.0' || a.address === '::'), 'Google tag DNS is blocked on this machine; do not bypass the visitor privacy setting.')
  const {packets, errors} = await setup(page, undefined, false, 'ko', true)
  await page.locator('#analytics-allow').click()
  await expect.poll(() => packets.some(p => p.includes('en=page_view')), {timeout: 30000}).toBe(true)
  expect(packets.filter(p => p.includes('en=page_view'))).toHaveLength(1)
  expect(decodeURIComponent(packets.join('\n'))).not.toMatch(/PRIVATE_|friend=|seed=|avatar|user_id|email/i)
  expect(decodeURIComponent(packets.join('\n'))).toContain('dl=https://uxidesigner-ux.github.io/chroma-match/')
  const cookies = await page.context().cookies(GAME)
  expect(cookies.some(c => c.name.startsWith('chroma_match_') && c.path === '/chroma-match/')).toBe(true)
  await page.locator('#map-profile').click(); await page.locator('#map-settings').click(); await page.locator('#set-analytics').click()
  expect((await page.context().cookies(GAME)).filter(c => c.name.startsWith('chroma_match_'))).toHaveLength(0)
  expect(errors).toEqual([])
  await page.screenshot({path: info.outputPath('real-tag-opt-out.png')})
})
test('restoring accepted actions does not count item use again', async ({page}) => {
  const {events} = await setup(page, 'granted')
  await page.locator('#world-play').click(); await page.locator('#loadout-start').click()
  await page.locator('[data-item="shuffle"]').click(); await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false')
  await expect.poll(() => events.filter(e => e[1] === 'item_use').length).toBe(1)
  await page.locator('#pause').click(); await page.locator('#paused-keep').click()
  await page.reload(); await expect(page.locator('#splash')).toBeHidden(); await page.locator('#map-continue').click()
  await expect.poll(() => events.filter(e => e[1] === 'game_resume').length).toBe(1)
  expect(events.filter(e => e[1] === 'item_use')).toHaveLength(1)
  expect(events.filter(e => e[1] === 'game_start')).toHaveLength(1)
})
test('first-visit consent remains keyboard reachable in every locale on small portrait and landscape screens', async ({page}, info) => {
  for (const lang of ['ko', 'en', 'ja', 'zh-Hans']) {
    await page.setViewportSize({width: 320, height: 568})
    await setup(page, undefined, false, lang)
    await expect(page.locator('#analytics-consent')).toBeVisible()
    for (const [width, height] of [[320, 568], [568, 320]]) {
      await page.setViewportSize({width: width!, height: height!})
      for (const id of ['analytics-decline', 'analytics-allow']) {
        await page.locator(`#${id}`).scrollIntoViewIfNeeded()
        const rect = (await page.locator(`#${id}`).boundingBox())!
        expect(rect.width).toBeGreaterThanOrEqual(44); expect(rect.height).toBeGreaterThanOrEqual(44)
        await expect(page.locator(`#${id}`)).toBeInViewport()
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({path: info.outputPath(`consent-${lang}-${width}.png`)})
    }
    await page.locator('#analytics-decline').focus(); await page.keyboard.press('Shift+Tab')
    await expect(page.locator('.analytics-panel > a')).toBeFocused()
    await page.keyboard.press('Tab'); await expect(page.locator('#analytics-decline')).toBeFocused()
    await page.evaluate(key => localStorage.removeItem(key), KEY)
  }
})
