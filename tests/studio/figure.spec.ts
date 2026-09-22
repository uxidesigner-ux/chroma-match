import { expect, test } from '@playwright/test'
import { enterLobby } from './boot.ts'

/**
 * The figure is three bone scales on one skeleton, and a bone carries its
 * scale down to everything under it — so widening the hips would widen the
 * legs, and widening the chest would widen the head and arms, unless each is
 * divided back out. This measures the drawn silhouette rather than the
 * skeleton: it is what the player sees, and it needs no hook into the model.
 */
const rows0 = 41

test('the figure reshapes the torso and leaves the head alone', async ({ page }) => {
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, route => route.abort())
  await page.addInitScript(() => {
    localStorage.setItem('chroma-match:lang', 'ko')
    // The starter, stated in full, so the silhouette is the same every run.
    localStorage.setItem('chroma-match:avatar', '4STNN67B7A3A899E891ADB8202C3D333')
  })
  await page.goto('/?seed=3')
  await enterLobby(page)
  await page.locator('#lobby-edit').click()
  await expect(page.locator('#anime-studio')).toHaveAttribute('data-state', 'ready')
  await page.getByRole('button', { name: '전신', exact: true }).click()
  await page.getByRole('button', { name: '동작 멈춤', exact: true }).click()
  await page.getByRole('tab', { name: '체형', exact: true }).click()

  /** Width of the drawn character at a few heights, in pixels. */
  const measure = () =>
    page.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const source = document.querySelector('.studio-stage canvas') as HTMLCanvasElement
      const copy = document.createElement('canvas')
      copy.width = source.width
      copy.height = source.height
      copy.getContext('2d')!.drawImage(source, 0, 0)
      const data = copy.getContext('2d')!.getImageData(0, 0, copy.width, copy.height).data
      // The stage paints one flat backdrop behind the character, so anything
      // that is not that colour is the character.
      const back = [data[0]!, data[1]!, data[2]!]
      const isInk = (x: number, y: number) => {
        const i = (y * copy.width + x) * 4
        return Math.abs(data[i]! - back[0]!) + Math.abs(data[i + 1]! - back[1]!) + Math.abs(data[i + 2]! - back[2]!) > 24
      }
      // The arms hang clear of the body in this pose, so the full row spans
      // hand to hand. The torso is the run of ink that contains the centre.
      const rowWidth = (y: number) => {
        const mid = Math.round(copy.width / 2)
        if (!isInk(mid, y)) return 0
        let left = mid
        let right = mid
        while (left > 0 && isInk(left - 1, y)) left--
        while (right < copy.width - 1 && isInk(right + 1, y)) right++
        return right - left + 1
      }
      const anyInk = (y: number) => {
        for (let x = 0; x < copy.width; x++) if (isInk(x, y)) return true
        return false
      }
      let top = -1
      let bottom = -1
      for (let y = 0; y < copy.height; y++) {
        if (!anyInk(y)) continue
        if (top < 0) top = y
        bottom = y
      }
      if (top < 0) return null
      const at = (fraction: number) => rowWidth(Math.round(top + (bottom - top) * fraction))
      const profile: number[] = []
      for (let i = 0; i < 41; i++) profile.push(at(i / 40))
      return { height: bottom - top, profile }
    })

  const silhouette = measure

  await page.getByRole('button', { name: '기본', exact: true }).click()
  const even = await silhouette()
  expect(even, 'nothing was drawn to measure').not.toBeNull()

  await page.getByRole('button', { name: '곡선', exact: true }).click()
  const full = await silhouette()

  // A wider character makes the camera pull back to keep it framed, so pixel
  // widths are not comparable between the two. Every width is read against the
  // character's own head-to-toe height, which the figure does not change.
  const band = (shot: NonNullable<Awaited<ReturnType<typeof silhouette>>>, from: number, to: number) => {
    const rows = shot.profile
      .map((width, index) => ({ at: index / (rows0 - 1), width: width / shot.height }))
      .filter((row) => row.at >= from && row.at <= to && row.width > 0)
      .map((row) => row.width)
    return rows
  }
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length

  // The head sits above every scaled bone and is divided back out, so it holds.
  const headEven = Math.max(...band(even!, 0.02, 0.14))
  const headFull = Math.max(...band(full!, 0.02, 0.14))
  expect(headFull / headEven, 'the head changed width').toBeGreaterThan(0.92)
  expect(headFull / headEven, 'the head changed width').toBeLessThan(1.08)

  // The bust fills out.
  expect(mean(band(full!, 0.18, 0.22))).toBeGreaterThan(mean(band(even!, 0.18, 0.22)))

  // And the shape 형 asked for: the waist draws in relative to the hips, which
  // is the measure that survives the camera and the pose.
  const waistToHip = (shot: NonNullable<Awaited<ReturnType<typeof silhouette>>>) =>
    Math.min(...band(shot, 0.30, 0.40)) / Math.max(...band(shot, 0.44, 0.56))
  expect(waistToHip(full!), 'the waist did not draw in against the hips').toBeLessThan(waistToHip(even!))
})
