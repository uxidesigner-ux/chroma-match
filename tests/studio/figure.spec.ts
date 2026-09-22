import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { enterLobby } from './boot.ts'

/**
 * The figure is five bone changes on one skeleton, and a bone carries its
 * scale down to everything under it — so widening the hips would widen the
 * legs, and widening the chest would widen the head and arms, unless each is
 * divided back out. This measures the drawn silhouette rather than the
 * skeleton: it is what the player sees, and it needs no hook into the model.
 */
const rows0 = 41

/** Opens the studio on a stated starter, held still and framed head to toe. */
async function openStudio(page: Page, tab: string): Promise<void> {
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
  await page.getByRole('tab', { name: tab, exact: true }).click()
}

/** Width of the drawn character at a few heights, in pixels. */
function silhouetteOf(page: Page) {
  return () =>
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
      // Shoulders move the arms apart rather than widening one run, so the
      // span from the leftmost to the rightmost ink is what shows them.
      const rowSpan = (y: number) => {
        let left = -1
        let right = -1
        for (let x = 0; x < copy.width; x++)
          if (isInk(x, y)) {
            if (left < 0) left = x
            right = x
          }
        return left < 0 ? 0 : right - left + 1
      }
      const anyInk = (y: number) => rowSpan(y) > 0
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
      const span: number[] = []
      for (let i = 0; i < 41; i++) {
        profile.push(at(i / 40))
        span.push(rowSpan(Math.round(top + (bottom - top) * (i / 40))))
      }
      // Skin is a tint over a baked texture, so it shows as the drawn
      // character getting darker overall rather than as any one pixel.
      let ink = 0
      let lit = 0
      for (let y = top; y <= bottom; y++)
        for (let x = 0; x < copy.width; x++) {
          if (!isInk(x, y)) continue
          const i = (y * copy.width + x) * 4
          lit += data[i]! * 0.2126 + data[i + 1]! * 0.7152 + data[i + 2]! * 0.0722
          ink++
        }
      return { height: bottom - top, profile, span, light: ink ? lit / ink : 0, area: ink / ((bottom - top) ** 2) }
    })
}

type Shot = NonNullable<Awaited<ReturnType<ReturnType<typeof silhouetteOf>>>>

// A wider character makes the camera pull back to keep it framed, so pixel
// widths are not comparable between two shots. Every width is read against the
// character's own head-to-toe height, which the figure does not change.
const band = (shot: Shot, from: number, to: number, key: 'profile' | 'span' = 'profile') =>
  shot[key]
    .map((width, index) => ({ at: index / (rows0 - 1), width: width / shot.height }))
    .filter((row) => row.at >= from && row.at <= to && row.width > 0)
    .map((row) => row.width)

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length

test('the figure reshapes the torso and leaves the head alone', async ({ page }) => {
  await openStudio(page, '체형')
  const silhouette = silhouetteOf(page)

  await page.getByRole('button', { name: '기본', exact: true }).click()
  const even = await silhouette()
  expect(even, 'nothing was drawn to measure').not.toBeNull()

  await page.getByRole('button', { name: '곡선', exact: true }).click()
  const full = await silhouette()

  // The head sits above every scaled bone and is divided back out, so it holds.
  const headEven = Math.max(...band(even!, 0.02, 0.14))
  const headFull = Math.max(...band(full!, 0.02, 0.14))
  expect(headFull / headEven, 'the head changed width').toBeGreaterThan(0.92)
  expect(headFull / headEven, 'the head changed width').toBeLessThan(1.08)

  // And the shape 형 asked for: the waist draws in relative to the hips, which
  // is the measure that survives the camera and the pose.
  const waistToHip = (shot: Shot) =>
    Math.min(...band(shot, 0.30, 0.40)) / Math.max(...band(shot, 0.44, 0.56))
  expect(waistToHip(full!), 'the waist did not draw in against the hips').toBeLessThan(waistToHip(even!))
})

test('each axis moves its own region and leaves the others standing', async ({ page }) => {
  await openStudio(page, '체형')
  const silhouette = silhouetteOf(page)
  const step = (axis: string, value: number) =>
    page.getByRole('button', { name: `${axis} ${value}`, exact: true }).click()

  // Every axis but the one under test is held at the middle, which is the
  // model untouched, so whatever moves is the work of that axis alone.
  for (const axis of ['어깨', '가슴', '허리', '엉덩이', '머리 크기']) await step(axis, 4)
  const rest = await silhouette()
  expect(rest, 'nothing was drawn to measure').not.toBeNull()

  await step('어깨', 7)
  const wide = await silhouette()
  await step('어깨', 4)
  await step('가슴', 7)
  const full = await silhouette()
  await step('가슴', 4)
  await step('머리 크기', 7)
  const big = await silhouette()

  /*
   * The chest is read through the torso run rather than the full span, because
   * the arms hang against the body at this height: the span would report the
   * shoulders, and the preset test cannot separate the two at all since its
   * curved build narrows the shoulders in the same rows.
   */
  expect(mean(band(full!, 0.20, 0.28)), 'the chest did not fill out')
    .toBeGreaterThan(mean(band(rest!, 0.20, 0.28)) * 1.03)

  /*
   * The arms hang clear of the body, so the shoulders show as the outermost
   * ink at chest height rather than as a wider torso. Below the hips nothing
   * the shoulder axis touches reaches, which is what keeps it separable.
   */
  expect(mean(band(wide!, 0.16, 0.26, 'span')), 'the shoulders did not move apart')
    .toBeGreaterThan(mean(band(rest!, 0.16, 0.26, 'span')) * 1.04)
  const hips = (shot: Shot) => mean(band(shot, 0.44, 0.56))
  expect(hips(wide!) / hips(rest!), 'the shoulders carried down into the hips').toBeGreaterThan(0.96)
  expect(hips(wide!) / hips(rest!), 'the shoulders carried down into the hips').toBeLessThan(1.04)

  /*
   * A bigger head makes the whole silhouette taller, which moves every band
   * that is measured as a fraction of it — so the head is read against the
   * body rather than against the frame. Each band takes its extreme over a
   * wide range, which lands on the same piece of anatomy either way, and the
   * ratio of two of them cancels the camera along with the height.
   */
  const widest = (shot: Shot, from: number, to: number) => Math.max(...band(shot, from, to))
  const narrowest = (shot: Shot, from: number, to: number) => Math.min(...band(shot, from, to))
  const headToHip = (shot: Shot) => widest(shot, 0.02, 0.14) / widest(shot, 0.38, 0.62)
  // The head is the one scale allowed to carry down, because the hair and the
  // eyes under it should grow with it.
  expect(headToHip(big!) / headToHip(rest!), 'the head did not grow').toBeGreaterThan(1.05)
  // And it stops at the neck: the torso keeps the shape it had.
  const waistToHip = (shot: Shot) => narrowest(shot, 0.28, 0.40) / widest(shot, 0.38, 0.62)
  expect(waistToHip(big!) / waistToHip(rest!), 'the head reshaped the torso').toBeGreaterThan(0.96)
  expect(waistToHip(big!) / waistToHip(rest!), 'the head reshaped the torso').toBeLessThan(1.04)
})

test('a skin tone darkens the character and white leaves the model as drawn', async ({ page }) => {
  await openStudio(page, '색상')
  const silhouette = silhouetteOf(page)

  const pale = await silhouette()
  expect(pale, 'nothing was drawn to measure').not.toBeNull()

  await page.getByRole('button', { name: '피부 #6F4530', exact: true }).click()
  const deep = await silhouette()
  expect(deep!.light, 'the deepest tone did not darken the character')
    .toBeLessThan(pale!.light * 0.97)

  // White is not a tone, it is no tint at all: it has to land back exactly on
  // the model as its author drew it, which is what every older code asks for.
  await page.getByRole('button', { name: '피부 #FFFFFF', exact: true }).click()
  const back = await silhouette()
  expect(Math.abs(back!.light - pale!.light), 'white did not restore the model').toBeLessThan(0.5)
})

test('a female character carries a bust a male one does not, and going back takes it off', async ({ page }) => {
  await openStudio(page, '체형')
  const silhouette = silhouetteOf(page)
  // Read from the side: a bust is depth, and from the front it is shading.
  await page.getByRole('button', { name: '측면', exact: true }).click()

  /*
   * Picking a character also seeds a build, which moves four bones. Landing
   * back on the even build after each pick strips that away, so what is left
   * between the two shots is the sculpt and nothing else.
   */
  const evened = async () => {
    await page.getByRole('button', { name: '기본', exact: true }).click()
    return silhouette()
  }
  await page.getByRole('button', { name: '남성', exact: true }).click()
  const male = await evened()
  expect(male, 'nothing was drawn to measure').not.toBeNull()
  await page.getByRole('button', { name: '여성', exact: true }).click()
  const female = await evened()
  await page.getByRole('button', { name: '남성', exact: true }).click()
  const back = await evened()

  const chest = (shot: Shot) => mean(band(shot, 0.20, 0.28, 'span'))
  const waist = (shot: Shot) => mean(band(shot, 0.33, 0.41, 'span'))
  expect(chest(female!) / chest(male!), 'the chest gained no depth').toBeGreaterThan(1.06)
  // The shape is bounded: nothing below the ribs is touched by it.
  expect(waist(female!) / waist(male!), 'the sculpt reached past the ribs').toBeGreaterThan(0.97)
  expect(waist(female!) / waist(male!), 'the sculpt reached past the ribs').toBeLessThan(1.03)
  /*
   * Every pass rewrites from the model's own vertices, so going back has to
   * land on the mesh exactly, not merely near it — otherwise switching twice
   * would leave a character no code could describe.
   */
  expect(chest(back!) / chest(male!), 'the chest did not go back').toBeGreaterThan(0.995)
  expect(chest(back!) / chest(male!), 'the chest did not go back').toBeLessThan(1.005)
})

test('the ponytail is hidden, worn, or worn long, and each draws a different head of hair', async ({ page }) => {
  await openStudio(page, '헤어')
  const silhouette = silhouetteOf(page)
  await page.getByRole('button', { name: '측면', exact: true }).click()

  const wearing = async (style: string) => {
    await page.getByRole('button', { name: style, exact: true }).click()
    const shot = await silhouette()
    expect(shot, `${style} drew nothing`).not.toBeNull()
    // Ink against the character's own height squared, so the camera pulling
    // back to frame a longer tail does not read as a shorter one.
    return shot!.area
  }
  const bob = await wearing('단발')
  const tail = await wearing('포니테일')
  const long = await wearing('긴 포니테일')
  expect(tail, 'the ponytail added nothing to the silhouette').toBeGreaterThan(bob * 1.01)
  expect(long, 'the long ponytail is no longer than the short one').toBeGreaterThan(tail * 1.01)
})
