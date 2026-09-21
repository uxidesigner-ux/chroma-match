// Reproducible, local-only visual evidence. Never posts a score or signs in.
// Usage: node scripts/capture-feedback.mjs <existing-output-directory>
import { chromium } from '@playwright/test'
import { copyFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const output = process.argv[2]
const isFusion = process.argv[3] === '--fusion'
const prefix = isFusion ? 'power-fusion' : 'game'
if (!output || !path.isAbsolute(output)) throw new Error('An absolute output directory is required')
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] })
const baseURL = process.env.FEEDBACK_URL ?? 'http://127.0.0.1:5173'
const setup = await browser.newContext({ viewport: { width: 1024, height: 900 }, locale: 'ko-KR' })
await setup.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
const editor = await setup.newPage()
await editor.goto(baseURL)
if (await editor.locator('#overlay-action').isVisible()) await editor.locator('#overlay-action').click()
await editor.locator('#profile-face').click()
await editor.locator('#profile-edit').click()
await editor.locator('#anime-studio[data-state="ready"]').waitFor({ timeout: 60000 })
// Select a licensed preset and save it through the actual editor.
await editor.locator('.studio-apply').click()
await editor.getByText('이 기기에 저장했어요.', { exact: true }).waitFor()
await editor.locator('#creator-back').click()
await editor.locator('#profile-avatar[data-avatar-state="ready"]').waitFor()
const state = await setup.storageState()
await setup.close()
const recordingDir = await mkdtemp(path.join(tmpdir(), 'chroma-feedback-'))

const context = await browser.newContext({
  storageState: state, viewport: { width: 430, height: 900 }, locale: 'ko-KR',
  recordVideo: { dir: recordingDir, size: { width: 430, height: 900 } },
})
await context.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
await page.goto(`${baseURL}/?seed=${isFusion ? '3' : 'i'}`)
await page.locator('#start-game').click()
await page.locator('#loadout-start').click()
if (!isFusion) await page.evaluate(() => window.chroma.game.restart(18, 1))
const video = page.video()
let capturedCombo = false
let capturedFusion = false
for (let turn = 0; turn < 20; turn++) {
  const status = await page.evaluate(() => window.chroma.game.status)
  if (status !== 'playing') break
  const move = await page.evaluate(() => {
    const c = window.chroma
    const move = c.best()
    return move && {
      a: c.renderer.centreOf(move.a), b: c.renderer.centreOf(move.b),
      fusion: c.game.rules === 2 && c.game.grid[move.a].power !== 'none' && c.game.grid[move.b].power !== 'none',
    }
  })
  if (!move) throw new Error('No legal move')
  const board = await page.locator('#board').boundingBox()
  await page.mouse.click(board.x + move.a.x, board.y + move.a.y)
  if (move.fusion) {
    await page.locator('#combo-word').getByText('점선 보석과 합체 · 이동 1회', { exact: true }).waitFor()
    await page.screenshot({ path: path.join(output, 'power-fusion-ready.png') })
    await page.waitForTimeout(600) // Show the deliberate choice in the demo.
  }
  await page.mouse.click(board.x + move.b.x, board.y + move.b.y)
  if (move.fusion) {
    await page.waitForFunction(() => window.chroma.game.phaseKind === 'fusion')
    await page.screenshot({ path: path.join(output, 'power-fusion-charge.png') })
    capturedFusion = true
  }
  await page.waitForFunction(() => window.chroma.game.phaseKind === 'idle')
  if (!capturedCombo && await page.locator('#combo[data-heat="3"]').isVisible()) {
    await page.screenshot({ path: path.join(output, `${prefix}-combo.png`) })
    capturedCombo = true
  }
}
await page.locator('#overlay[data-celebration="clear"]').waitFor()
await page.locator('#victory-avatar[data-avatar-state="ready"]').waitFor()
await page.waitForTimeout(500) // Capture after entrance opacity reaches one.
await page.screenshot({ path: path.join(output, `${prefix}-clear.png`) })
await page.waitForTimeout(1100) // Keep the finite celebration visible in the recording.
const proof = await page.evaluate(() => ({
  score: window.chroma.game.score,
  status: window.chroma.game.status,
  loadedVRM: performance.getEntriesByType('resource').some(r => r.name.endsWith('.vrm')),
  avatar: document.getElementById('victory-avatar').dataset.avatarState,
}))
await context.close()
await copyFile(await video.path(), path.join(output, `${prefix}-animation-preview.webm`))
await browser.close()
console.log(JSON.stringify({ ...proof, errors, capturedCombo, capturedFusion }))
if (errors.length || proof.loadedVRM || proof.score !== (isFusion ? 2290 : 1800) || isFusion && !capturedFusion) process.exitCode = 1
