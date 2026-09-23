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
      /*
       * The chest sampled far more finely than the whole-body profile, because
       * the shape of the bust — where it peaks and how it runs out above and
       * below — lives inside four of that profile's rows.
       */
      const chest: number[] = []
      for (let i = 0; i < 61; i++)
        chest.push(rowSpan(Math.round(top + (bottom - top) * (0.14 + (0.26 * i) / 60))) / (bottom - top))
      return {
        height: bottom - top,
        profile,
        span,
        chest,
        light: ink ? lit / ink : 0,
        area: ink / ((bottom - top) ** 2),
      }
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
  // The rows are tracks now. `fill` sets the value and fires the same input and
  // change a thumb does, which is the gesture the editor records as one step.
  const step = (axis: string, value: number) =>
    page.getByLabel(axis, { exact: true }).fill(String(value - 1))

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

test('the bust is rounded at the front and runs out further below than above', async ({ page }) => {
  await openStudio(page, '체형')
  const silhouette = silhouetteOf(page)
  await page.getByRole('button', { name: '측면', exact: true }).click()
  const evened = async () => {
    await page.getByRole('button', { name: '기본', exact: true }).click()
    return silhouette()
  }
  await page.getByRole('button', { name: '남성', exact: true }).click()
  const male = await evened()
  expect(male, 'nothing was drawn to measure').not.toBeNull()
  await page.getByRole('button', { name: '여성', exact: true }).click()
  await page.getByLabel('가슴', { exact: true }).fill('6')
  const female = await evened()

  /*
   * What the sculpt alone adds at each height: the female depth less the male
   * depth at the same row, both already read against the character's own
   * height. Everything below is about the shape of that curve, not its size.
   */
  const added = female!.chest.map((depth, row) => depth - male!.chest[row]!)
  const peak = added.indexOf(Math.max(...added))
  const top = added[peak]!
  expect(top, 'the sculpt added no depth to measure').toBeGreaterThan(0.01)

  /*
   * How many rows either side of the peak stay above half its depth. The rows
   * are a fixed fraction of the character's own height apart, so these are
   * lengths along the body and comparable with the depth itself.
   */
  const ROW = 0.26 / 60
  // The furthest such row, not the first dip: a single noisy row in the middle
  // of the shape should not report it as ending there.
  const reach = (step: number) => {
    let far = 0
    for (let row = peak; added[row] !== undefined; row += step)
      if (added[row]! > top * 0.5) far = Math.abs(row - peak)
    return far
  }
  const above = reach(-1)
  const below = reach(1)

  /*
   * Rounded, not pointed. What makes a shape read as a point is being tall for
   * its width, so that is what is measured: how broad it stays at half its
   * depth, against how far it comes forward. Reading the rows either side of
   * the apex instead says nothing — a cone and a dome both hold their maximum
   * over a row or two at this scale, and both score one.
   */
  const broadness = ((above + below) * ROW) / top
  expect(broadness, 'the bust is tall for its width, which reads as a point').toBeGreaterThan(2.4)

  /*
   * And softer underneath than on top: there is more of the shape below its
   * peak than above it, which is what carries the underside into the ribcage
   * instead of ending it on a rim.
   *
   * Measured as the area either side rather than the rows either side. A row
   * count is a count of pixels, so it moves with how large the character
   * happens to be drawn — when the preview grew, the same shape read 1.5
   * instead of 2.0 on a gate of 1.6 and failed for no reason of its own. The
   * area either side of the peak is the same number whatever the scale.
   */
  const area = (step: number) => {
    let total = 0
    for (let row = peak + step; added[row] !== undefined && added[row]! > 0; row += step) total += added[row]!
    return total
  }
  expect(area(1) / area(-1), 'the underside is no softer than the top').toBeGreaterThan(1.35)
})

test('picking a character seeds a build, and keeps a figure set row by row', async ({ page }) => {
  await openStudio(page, '체형')
  const pressed = (name: string) =>
    expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true')
  const reads = (axis: string, value: number) =>
    expect(page.getByLabel(axis, { exact: true })).toHaveValue(String(value - 1))

  // From one of the four builds, picking the other character swaps the build:
  // one tap has to produce a character rather than a setting.
  await page.getByRole('button', { name: '여성', exact: true }).click()
  await page.getByRole('button', { name: '곡선', exact: true }).click()
  await page.getByRole('button', { name: '남성', exact: true }).click()
  await reads('어깨', 7)
  await pressed('남성')

  /*
   * But a figure somebody set row by row is theirs. Swapping character after
   * that changes the character and nothing else — the old behaviour threw the
   * whole figure away to make its point.
   */
  // Neither of these is what the female build would set, so a figure that came
  // back matching it would be the build overwriting the rows, not keeping them.
  await page.getByLabel('어깨', { exact: true }).fill('3')
  await page.getByLabel('엉덩이', { exact: true }).fill('1')
  await page.getByRole('button', { name: '여성', exact: true }).click()
  await pressed('여성')
  await reads('어깨', 4)
  await reads('엉덩이', 2)
})

test('the sheet floats over the preview, and the character stays clear of it', async ({ page }) => {
  // A phone. Wider than 860px the panel is a column beside the preview and
  // there is no sheet to float, which is the point of the two layouts.
  await page.setViewportSize({ width: 390, height: 844 })
  await openStudio(page, '체형')
  const grip = page.getByRole('slider', { name: /패널 높이/ })
  const silhouette = silhouetteOf(page)

  /*
   * A sheet, not a panel: it stands over the preview rather than taking a share
   * of the column, so the stage runs the full height of the screen behind it.
   */
  const laid = await page.evaluate(() => {
    const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect()
    return { studio: box('.anime-studio'), stage: box('.studio-stage'), sheet: box('.studio-edit') }
  })
  expect(laid.stage.bottom - laid.studio.bottom, 'the stage stops where the sheet starts')
    .toBeGreaterThan(-1)
  expect(laid.sheet.top, 'the sheet does not overlap the preview').toBeLessThan(laid.stage.bottom - 40)

  /*
   * And the character is framed in what is left showing. The camera is told how
   * much of its canvas the sheet hides; without that the legs stand behind it,
   * which is the failure that makes a floating sheet unusable.
   */
  const clear = async () => {
    const shot = await silhouette()
    expect(shot, 'nothing was drawn to measure').not.toBeNull()
    return page.evaluate(() => {
      const canvas = document.querySelector('.studio-stage canvas') as HTMLCanvasElement
      const copy = document.createElement('canvas')
      copy.width = canvas.width
      copy.height = canvas.height
      copy.getContext('2d')!.drawImage(canvas, 0, 0)
      const data = copy.getContext('2d')!.getImageData(0, 0, copy.width, copy.height).data
      const back = [data[0]!, data[1]!, data[2]!]
      let lowest = -1
      for (let y = 0; y < copy.height; y++)
        for (let x = 0; x < copy.width; x++) {
          const i = (y * copy.width + x) * 4
          if (Math.abs(data[i]! - back[0]!) + Math.abs(data[i + 1]! - back[1]!) + Math.abs(data[i + 2]! - back[2]!) > 24) {
            lowest = y
            break
          }
        }
      // Where the character's feet are, and where the sheet's top edge falls,
      // both as a fraction of the canvas.
      const stage = document.querySelector('.studio-stage')!.getBoundingClientRect()
      const sheet = document.querySelector('.studio-edit')!.getBoundingClientRect()
      return { feet: lowest / copy.height, edge: (sheet.top - stage.top) / stage.height }
    })
  }

  // Four stops, arriving part-way up and coming back round, so a thumb that
  // keeps tapping never gets stuck and never lands on a screen with no controls.
  for (const stop of [2, 3, 4, 1]) {
    await expect(grip).toHaveAttribute('aria-valuenow', String(stop))
    const { feet, edge } = await clear()
    expect(feet, `at stop ${stop} the character reaches under the sheet`).toBeLessThan(edge)
    await grip.click()
    await page.waitForTimeout(400)
  }
  await expect(grip).toHaveAttribute('aria-valuenow', '2')

  /*
   * And shut it is off the screen but for the bar it is pulled back up by,
   * which is the state the preview is there for: a sheet that only ever gets
   * shorter is a panel that can be resized.
   */
  await grip.click()
  await grip.click()
  await grip.click()
  await expect(grip).toHaveAttribute('aria-valuenow', '1')
  await page.waitForTimeout(400)
  const shut = await page.evaluate(() => {
    const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect()
    const sheet = box('.studio-edit')
    return {
      left: sheet.height,
      word: getComputedStyle(document.querySelector('.studio-sheet-word')!).opacity,
      hidden: getComputedStyle(document.querySelector('.studio-tabs')!).visibility,
      floor: box('.studio-stage').bottom,
      screen: innerHeight,
    }
  })
  expect(shut.left, 'the shut sheet is the grip and nothing more').toBeLessThan(70)
  expect(shut.left, 'and the grip is still there to take hold of').toBeGreaterThan(40)
  expect(Number(shut.word), 'which says what it opens').toBeGreaterThan(0.5)
  expect(shut.hidden, 'with the editing put away behind it').toBe('hidden')
  expect(shut.screen - shut.floor, 'and the preview runs to the screen\'s own floor')
    .toBeLessThan(2)
})

/**
 * A sheet on a phone has exactly two gestures, and they share one finger: the
 * list scrolls and the sheet moves. These are the rules that decide between
 * them, plus the two things that made the sheet feel wrong before there were
 * any rules — a vertical drag the browser took for itself, and a scroll window
 * ninety-seven pixels tall with a row of tools pinned under it.
 */
test.describe('the sheet under a thumb', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })

  /** A finger, dragged. Playwright's touchscreen only taps. */
  async function swipe(page: Page, x: number, from: number, to: number): Promise<void> {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: from }] })
    for (let step = 1; step <= 6; step++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: from + ((to - from) * step) / 6 }],
      })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
    await page.waitForTimeout(450)
  }

  const resting = (page: Page) =>
    page.getByRole('slider', { name: /패널 높이/ }).getAttribute('aria-valuenow')

  test('the whole sheet under the tabs scrolls, tools and all', async ({ page }) => {
    await openStudio(page, '체형')
    const laid = await page.evaluate(() => {
      const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect()
      const list = document.querySelector('.studio-controls') as HTMLElement
      const tabs = box('.studio-tabs')
      return {
        window: list.clientHeight,
        sheet: box('.studio-edit').height,
        toolsUnderTabs: box('.studio-sheet-foot').top > tabs.bottom,
        toolsInside: list.contains(document.querySelector('.studio-sheet-foot')),
        creditInside: list.contains(document.querySelector('.studio-credit')),
        stuck: getComputedStyle(document.querySelector('.studio-tabs')!).position,
        over: list.scrollHeight - list.clientHeight,
        more: list.dataset.more ?? null,
        // The gesture on the character is the character's, not the page's.
        canvas: getComputedStyle(document.querySelector('.studio-stage canvas')!).touchAction,
      }
    })
    expect(laid.toolsInside, 'the tools scroll with the list rather than holding its floor').toBe(true)
    expect(laid.creditInside, 'and so does the credit under them').toBe(true)
    expect(laid.stuck, 'the tab bar stays put while they do').toBe('sticky')
    // It used to be 97 of a 292px sheet: the tab bar, a slot, and a pinned row.
    expect(laid.window, 'the scroll window is most of the sheet').toBeGreaterThan(laid.sheet * 0.7)
    expect(laid.over, 'there is more below on this tab').toBeGreaterThan(0)
    expect(laid.more, 'so the cut at the foot is shown fading').toBe('')
    expect(laid.canvas, 'and a drag on the character never pans the page').toBe('none')
  })

  test('the list gives up the gesture at its top, and takes it back below', async ({ page }) => {
    await openStudio(page, '색상')
    expect(await resting(page)).toBe('2')

    // At the top with somewhere to go, a pull up is the sheet's.
    await swipe(page, 195, 760, 640)
    expect(await resting(page), 'pulling up from the top raises the sheet').toBe('3')
    await swipe(page, 195, 700, 560)
    expect(await resting(page), 'and again, to the tallest stop').toBe('4')

    // At the top with a pull down, there is nothing left to scroll, so it goes
    // — one stop, for a pull the length of one gap between them.
    await swipe(page, 195, 450, 550)
    expect(await resting(page), 'pulling down from the top lowers it').toBe('3')

  })

  test('a pull that covers a third of the way is taken as meant', async ({ page }) => {
    await openStudio(page, '체형')
    // 90px of a 768px screen: a quarter of the sheet, a third of the gap below.
    await swipe(page, 195, 700, 790)
    expect(await resting(page), 'it goes down rather than springing back').toBe('1')
    // And a smaller one does spring back, or nothing would ever hold still.
    await page.getByRole('slider', { name: /패널 높이/ }).click()
    await page.waitForTimeout(450)
    expect(await resting(page)).toBe('2')
    await swipe(page, 195, 700, 735)
    expect(await resting(page), 'a wobble is not a pull').toBe('2')

    /*
     * And once the list is scrolled it keeps the gesture: the sheet moving
     * under a finger that meant to scroll back up is the other half of the
     * same failure.
     */
    const scrolled = await page.evaluate(() => {
      const list = document.querySelector('.studio-controls') as HTMLElement
      list.scrollTop = 40
      return list.scrollTop
    })
    expect(scrolled, 'this tab has more than the stop can hold').toBeGreaterThan(0)
    await swipe(page, 195, 700, 790)
    expect(await resting(page), 'so the sheet stays where it is').toBe('2')
    expect(await page.evaluate(() => (document.querySelector('.studio-controls') as HTMLElement).scrollTop),
      'and the list is what moved').toBeLessThan(scrolled)
  })
})
