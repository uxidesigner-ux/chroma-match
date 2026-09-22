import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import { enterLobby } from './boot.ts'

/**
 * The icon set is 33 masked SVGs on a shared 24-unit grid, and the mask centres
 * each one on that grid — not on the drawing inside it. An icon struck low or
 * to one side therefore renders low or to one side inside its button, however
 * carefully the button centres its contents. Six of them were, by up to two
 * units, which is a sixth of the glyph.
 */
test('every icon is struck on the centre of its own grid', async ({ page }) => {
  const css = fs.readFileSync(new URL('../../src/play-lobby.css', import.meta.url), 'utf8')
  const icons: Record<string, string> = {}
  for (const m of css.matchAll(/\.hud-ico-([a-z0-9-]+) \{ --hud-ico: url\("([^"]+)"\)/g)) {
    icons[m[1]!] = m[2]!
  }
  expect(Object.keys(icons).length).toBeGreaterThan(20)

  await page.goto('/')
  const rows = await page.evaluate(async (set: Record<string, string>) => {
    const out: Array<{ name: string; offX: number; offY: number; ink: boolean }> = []
    const S = 240
    for (const [name, uri] of Object.entries(set)) {
      const img = new Image()
      img.src = uri
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = S
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, S, S)
      const data = ctx.getImageData(0, 0, S, S).data
      let x0 = S, y0 = S, x1 = -1, y1 = -1
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          if (data[(y * S + x) * 4 + 3]! < 8) continue
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
      }
      if (x1 < 0) { out.push({ name, offX: 0, offY: 0, ink: false }); continue }
      const unit = 24 / S
      out.push({
        name,
        offX: ((x0 + x1 + 1) / 2 - S / 2) * unit,
        offY: ((y0 + y1 + 1) / 2 - S / 2) * unit,
        ink: true,
      })
    }
    return out
  }, icons)

  for (const row of rows) {
    expect.soft(row.ink, `${row.name} draws something`).toBe(true)
    // 0.7 of 24 units is 0.6px once the glyph renders at 20px — the point at
    // which a row of buttons stops looking level.
    expect.soft(Math.abs(row.offX), `${row.name} horizontal`).toBeLessThan(0.7)
    expect.soft(Math.abs(row.offY), `${row.name} vertical`).toBeLessThan(0.7)
  }
})

test('buttons centre the icons they hold', async ({ page }) => {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.addInitScript(() => localStorage.setItem('chroma-match:lang', 'ko'))
  await page.goto('/?seed=3')
  await enterLobby(page)

  const offsets = (selector: string) =>
    page.locator(selector).evaluateAll(nodes =>
      nodes
        .map(node => {
          const mark = node.querySelector('.hud-ico')
          if (!mark) return null
          const box = node.getBoundingClientRect()
          const ink = mark.getBoundingClientRect()
          return {
            id: node.id || node.getAttribute('aria-label') || '?',
            dx: ink.left + ink.width / 2 - (box.left + box.width / 2),
            dy: ink.top + ink.height / 2 - (box.top + box.height / 2),
          }
        })
        .filter(Boolean),
    )

  // The lobby nav's label is screen-reader-only and therefore out of flow, so
  // its column had nothing to centre and the glyph packed to the top — 11px
  // above the middle of a 44px circle.
  const round = [
    ...(await offsets('.lobby-head .quick-btn')),
    ...(await offsets('.lobby-head .circle-button')),
    ...(await offsets('#lobby-edit, #lobby-tools button')),
  ]
  expect(round.length).toBeGreaterThanOrEqual(8)
  for (const item of round) {
    expect.soft(Math.abs(item!.dx), `${item!.id} horizontal`).toBeLessThanOrEqual(0.6)
    expect.soft(Math.abs(item!.dy), `${item!.id} vertical`).toBeLessThanOrEqual(0.6)
  }

  // Tabs and history stack a caption under the glyph, so only the horizontal
  // axis is a centring question there.
  await page.locator('#lobby-edit').click()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
  for (const item of [...(await offsets('.studio-tab')), ...(await offsets('.studio-history button'))]) {
    expect.soft(Math.abs(item!.dx), `${item!.id} horizontal`).toBeLessThanOrEqual(0.6)
  }
})
