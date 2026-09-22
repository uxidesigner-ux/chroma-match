import { expect, test } from '@playwright/test'
import { enterLobby } from './boot.ts'

/**
 * A gem's draw offset is scaled by one board-wide factor, which is zero only
 * while the board is idle, clearing or fusing. So a gem still carrying an
 * offset from a phase that already ended is drawn a whole cell away the frame
 * any other phase begins — the player touches one pair and a different pair
 * jumps and slides back. This drives the real board rather than the model, so
 * it fails if anything reintroduces the leak further down the pipeline.
 */
test('touching one pair never moves another', async ({ page }) => {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.addInitScript(() => localStorage.setItem('chroma-match:lang', 'ko'))
  await page.goto('/?seed=3')
  await enterLobby(page)
  await page.locator('#start-game').click()
  await page.locator('#loadout-start').click()
  await page.waitForFunction(() => window.chroma.game.phaseKind === 'idle')

  const displaced = await page.evaluate(async () => {
    const game = window.chroma.game
    const moves = () => window.chroma.moves()
    const rowOf = (i: number) => game.geom.rowOf(i)
    const settle = async () => {
      for (let i = 0; i < 600 && game.phaseKind !== 'idle'; i++) {
        await new Promise(requestAnimationFrame)
      }
    }

    // A swap that matches nothing: the board reverts, and no gravity pass runs
    // behind it to tidy the offsets away.
    const legal = new Set(moves().map(m => `${m.a}:${m.b}`))
    let rejected: [number, number] | null = null
    for (let i = 0; i < game.geom.cells && !rejected; i++) {
      const right = i + 1
      if (rowOf(i) !== rowOf(right)) continue
      if (legal.has(`${i}:${right}`) || legal.has(`${right}:${i}`)) continue
      rejected = [i, right]
    }
    if (!rejected) return { error: 'no rejected swap available' }
    game.drag(rejected[0], rejected[1])
    await settle()

    // Now a real move somewhere else. Only its own pair may be displaced on
    // the frame the next phase starts.
    const next = moves().find(m => ![rejected![0], rejected![1]].includes(m.a) && ![rejected![0], rejected![1]].includes(m.b))
    if (!next) return { error: 'no unrelated move available' }
    game.drag(next.a, next.b)
    const strays = game.grid
      .map((gem, index) => (gem && (gem.ox !== 0 || gem.oy !== 0) ? index : -1))
      .filter(index => index >= 0 && index !== next.a && index !== next.b)
    return { strays, rejected, next: [next.a, next.b] }
  })

  expect(displaced.error).toBeUndefined()
  expect(displaced.strays, 'gems outside the swapped pair were displaced').toEqual([])
})
