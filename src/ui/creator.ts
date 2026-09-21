import { myAvatar, paintAvatar, setMyAvatar } from '../avatar/store.ts'
import { CLOTH_SWATCHES, catalogueFor, isColourSlot } from '../avatar/spec.ts'
import type { AvatarSpec, ColourSlot, PartSlot, Slot } from '../avatar/spec.ts'
import type { Part } from '../avatar/parts.ts'
import { onLanguageChange, t } from '../i18n/index.ts'
import type { StringKey } from '../i18n/index.ts'
import { partName } from '../i18n/parts.ts'
import { animeCopy } from './anime-copy.ts'
import type { AnimeEditor } from './anime-editor.ts'

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}

/**
 * A category, and how its options are shown.
 *
 * `full` decides whether a swatch is a whole figure or a bust, and it is per
 * category because that is where the difference is: a pair of trousers on a
 * bust is invisible, and a hairstyle on a full-length figure is forty pixels
 * of head. Every swatch is the player's own avatar wearing the option, which
 * is the entire reason the renderer is a renderer rather than a folder of
 * pictures.
 */
interface Tab {
  slot: Slot
  label: StringKey
  /** Show the whole figure in the swatches rather than the head and shoulders. */
  full: boolean
  /** Colour chips rather than worn previews. */
  chips?: boolean
}

const TABS: readonly Tab[] = [
  { slot: 'build', label: 'tabBuild', full: true },
  { slot: 'hair', label: 'tabHair', full: false },
  { slot: 'hairColour', label: 'tabHairColour', full: false, chips: true },
  { slot: 'skin', label: 'tabSkin', full: false, chips: true },
  { slot: 'outfit', label: 'tabOutfit', full: true },
  { slot: 'topColour', label: 'tabTopColour', full: true, chips: true },
  { slot: 'bottom', label: 'tabBottom', full: true },
  { slot: 'bottomColour', label: 'tabBottomColour', full: true, chips: true },
  { slot: 'outer', label: 'tabOuter', full: true },
  { slot: 'outerColour', label: 'tabOuterColour', full: true, chips: true },
  { slot: 'shoes', label: 'tabShoes', full: true },
  { slot: 'shoeColour', label: 'tabShoeColour', full: true, chips: true },
  { slot: 'accessory', label: 'tabAccessory', full: false },
  { slot: 'backdrop', label: 'tabBackdrop', full: false, chips: true },
]

/** Two to three: a standing figure, not a figure with sky above it. */
const FULL_ASPECT = 1.5
const SWATCH_FULL = 74
const SWATCH_BUST = 72

/**
 * The wardrobe.
 *
 * Everything is applied on the tap and there is no Save button, which is a
 * decision rather than an omission: the figure above the grid is the
 * confirmation, and a customiser that can be left half-applied is one more
 * state to get wrong for no benefit anybody asked for. The row at the top says
 * so once, so that "nothing happened when I pressed save" never has to be
 * anybody's reading of it.
 */
export class Creator {
  private figure = el<HTMLCanvasElement>('creator-figure')
  private tabStrip = el('creator-tabs')
  private options = el('creator-options')
  private saved = el('creator-saved')
  private slot: Slot = 'build'
  private listeners: Array<() => void | Promise<void>> = []
  private anime: AnimeEditor | null = null
  private animeMode = false
  private opened = false
  private styleGeneration = 0
  private savedTimer = 0
  /** The figure is sized to the space it has, not to a number chosen here. */
  private figureSize = 240
  /** Bumped on every repaint so a half-finished row of swatches gives up. */
  private generation = 0

  constructor(private onBack: () => void) {
    el('creator-back').addEventListener('click', () => {
      if (this.animeMode && this.anime) this.anime.requestLeave(() => this.leave())
      else this.leave()
    })

    for (const tab of TABS) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'creator-tab'
      button.setAttribute('role', 'tab')
      button.dataset.slot = tab.slot
      button.dataset.i18n = tab.label
      button.textContent = t(tab.label)
      button.addEventListener('click', () => this.show(tab.slot))
      this.tabStrip.append(button)
    }

    onLanguageChange(() => { if (this.opened) this.paintStyles(); if (!this.animeMode) this.paint() })

    // The stage is whatever is left after the header and the picker, and that
    // is a different number on a small phone, a large one and a rotated one.
    // A fixed preview is too small on most of them and clipped on the rest.
    const stage = el('creator-stage')
    new ResizeObserver(() => {
      if (this.animeMode || !this.opened) return
      // Width is whichever of the two the aspect makes the binding one.
      const next = Math.max(
        150,
        Math.min(stage.clientWidth, stage.clientHeight / FULL_ASPECT),
      )
      if (Math.abs(next - this.figureSize) < 6) return
      this.figureSize = next
      const { anime: _anime, ...classic } = myAvatar()
      paintAvatar(this.figure, classic, next, { full: true, aspect: FULL_ASPECT })
    }).observe(stage)
  }

  /** Fires after anything changed, so the card and the boards can repaint. */
  onChange(listener: () => void | Promise<void>): void {
    this.listeners.push(listener)
  }

  open(): void {
    this.opened = true
    this.animeMode = Boolean(myAvatar().anime)
    this.paintStyles()
    void this.showStyle()
  }

  close(): void {
    this.opened = false
    this.styleGeneration++
    this.anime?.close()
    this.generation++
    document.querySelector('.app')?.classList.remove('has-studio')
  }

  private leave(): void {
    this.close()
    this.onBack()
    document.getElementById('profile-face')?.focus()
  }

  private paintStyles(): void {
    const root = el('creator-styles')
    root.replaceChildren()
    for (const mode of ['classic', 'anime'] as const) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'studio-button'
      button.textContent = animeCopy()[mode]
      button.setAttribute('aria-pressed', String(this.animeMode === (mode === 'anime')))
      button.addEventListener('click', () => {
        if (this.animeMode === (mode === 'anime')) return
        const change = (): void => {
          this.animeMode = mode === 'anime'
          this.paintStyles()
          void this.showStyle()
        }
        if (this.animeMode && this.anime) this.anime.requestLeave(change)
        else change()
      })
      root.append(button)
    }
  }

  private async showStyle(): Promise<void> {
    const mine = ++this.styleGeneration
    this.generation++
    const root = el('anime-studio')
    root.hidden = !this.animeMode
    for (const id of ['creator-stage', 'creator-tabs', 'creator-options']) el(id).hidden = this.animeMode
    this.saved.hidden = this.animeMode
    document.querySelector('.app')?.classList.toggle('has-studio', this.animeMode)
    if (!this.animeMode) { this.anime?.close(); this.paint(); return }
    try {
      const { AnimeEditor } = await import('./anime-editor.ts')
      if (mine !== this.styleGeneration || !this.opened) return
      this.anime ??= new AnimeEditor(root, async () => {
        await Promise.all(this.listeners.map(listener => listener()))
      }, () => this.leave())
      this.anime.open()
    } catch {
      if (mine !== this.styleGeneration) return
      root.textContent = animeCopy().failed
      const retry = document.createElement('button')
      retry.type = 'button'
      retry.className = 'studio-button'
      retry.textContent = animeCopy().retry
      retry.addEventListener('click', () => void this.showStyle())
      root.append(retry)
    }
  }

  private show(slot: Slot): void {
    this.slot = slot
    this.paint()
    // The chosen category scrolls into view, because tapping the last visible
    // chip on a narrow phone otherwise leaves it half off the edge.
    this.tabStrip
      .querySelector<HTMLElement>(`[data-slot="${slot}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }

  paint(): void {
    const { anime: _anime, ...spec } = myAvatar()
    paintAvatar(this.figure, spec, this.figureSize, { full: true, aspect: FULL_ASPECT })
    for (const tab of this.tabStrip.querySelectorAll<HTMLButtonElement>('.creator-tab')) {
      const on = tab.dataset.slot === this.slot
      tab.classList.toggle('is-on', on)
      tab.setAttribute('aria-selected', String(on))
    }
    this.paintOptions(spec)
  }

  private paintOptions(spec: AvatarSpec): void {
    const tab = TABS.find((entry) => entry.slot === this.slot)
    if (!tab) return
    this.options.replaceChildren()
    this.options.classList.toggle('is-chips', tab.chips === true)

    if (isColourSlot(this.slot)) {
      this.paintColours(spec, this.slot)
      return
    }

    const slot = this.slot as PartSlot
    const pending: Array<() => void> = []
    for (const part of catalogueFor(slot)) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'creator-option'
      const shown = partName(slot, part.id, part.name)
      button.title = shown
      if (spec[slot] === part.id) button.classList.add('is-on')

      if (tab.chips) {
        const chip = document.createElement('span')
        chip.className = 'option-chip'
        chip.style.background = (part as Part & { colour?: string }).colour ?? '#888'
        button.append(chip)
      } else {
        // Worn, not named. A list of words makes the player try each one to
        // find out what it is, which is the customiser doing none of its job.
        //
        // Queued rather than drawn here. Eight of these is eight ray-marched
        // renders, and doing them in the handler means the tab does not change
        // until the last one lands — on a slow device that is seconds of a
        // screen that looks frozen. The button appears at once and fills in.
        const size = tab.full ? SWATCH_FULL : SWATCH_BUST
        const canvas = document.createElement('canvas')
        canvas.className = 'avatar'
        canvas.setAttribute('aria-hidden', 'true')
        canvas.style.width = `${size}px`
        canvas.style.height = `${size * (tab.full ? FULL_ASPECT : 1)}px`
        button.append(canvas)
        pending.push(() =>
          paintAvatar(canvas, { ...spec, [slot]: part.id }, size, {
            round: !tab.full,
            full: tab.full,
            ...(tab.full ? { aspect: FULL_ASPECT } : {}),
          }),
        )
      }

      const label = document.createElement('span')
      label.className = 'option-name'
      label.textContent = shown
      button.append(label)

      if (part.lock !== 'free') {
        button.classList.add('is-locked')
        button.disabled = true
        button.title = t('lockedSuffix', { name: shown, how: lockWord(part) })
      }
      button.addEventListener('click', () => this.choosePart(slot, part))
      this.options.append(button)
    }
    this.drain(pending)
  }

  /**
   * Paints the queued swatches, one per frame, and stops if the tab moved on.
   *
   * One per frame rather than all at once so the browser gets to draw between
   * them: the row fills in left to right instead of appearing all together
   * after a freeze, and a player who taps straight through three categories
   * never waits for swatches they have already navigated past.
   */
  private drain(queue: Array<() => void>): void {
    const mine = ++this.generation
    let index = 0
    const step = (): void => {
      if (mine !== this.generation) return
      const job = queue[index++]
      if (!job) return
      job()
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  /**
   * A colour slot: sixteen starting points and a picker.
   *
   * The swatches are there because most people want a colour rather than *a
   * specific* colour, and a grid answers that in one tap. The picker is there
   * because the ones who do want a specific one are exactly the ones a fixed
   * palette turns away — and it is the platform's own, so it is a colour wheel
   * on a phone and an eyedropper on a desktop without either being built here.
   */
  private paintColours(spec: AvatarSpec, slot: ColourSlot): void {
    const current = `#${spec[slot]}`
    for (const swatch of CLOTH_SWATCHES) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'creator-option'
      button.title = swatch
      if (swatch.toUpperCase() === current.toUpperCase()) button.classList.add('is-on')
      const chip = document.createElement('span')
      chip.className = 'option-chip'
      chip.style.background = swatch
      button.append(chip)
      button.addEventListener('click', () => this.chooseColour(slot, swatch))
      this.options.append(button)
    }

    const custom = document.createElement('label')
    custom.className = 'creator-option creator-picker'
    const input = document.createElement('input')
    input.type = 'color'
    input.value = current
    input.setAttribute('aria-label', t('pickColour'))
    input.addEventListener('input', () => this.chooseColour(slot, input.value))
    const label = document.createElement('span')
    label.className = 'option-name'
    label.textContent = t('pickColour')
    custom.append(input, label)
    this.options.append(custom)
  }

  private choosePart(slot: PartSlot, part: Part): void {
    if (part.lock !== 'free') return
    this.apply({ ...myAvatar(), [slot]: part.id })
  }

  private chooseColour(slot: ColourSlot, hex: string): void {
    this.apply({ ...myAvatar(), [slot]: hex.replace('#', '').toUpperCase() })
  }

  private apply(spec: AvatarSpec): void {
    const { anime: _anime, ...classic } = spec
    if (!setMyAvatar(classic)) {
      this.saved.textContent = animeCopy().storageFailed
      this.saved.classList.add('is-on')
      return
    }
    this.paint()
    this.flagSaved()
    for (const listener of this.listeners) void Promise.resolve(listener()).catch(() => {
      this.saved.textContent = animeCopy().syncFailed
      this.saved.classList.add('is-on')
    })
  }

  /** Says it landed, then gets out of the way. */
  private flagSaved(): void {
    this.saved.textContent = t('savedNote')
    this.saved.classList.add('is-on')
    window.clearTimeout(this.savedTimer)
    this.savedTimer = window.setTimeout(() => this.saved.classList.remove('is-on'), 1400)
  }
}

function lockWord(part: Part): string {
  if (part.lock === 'paid') return t('lockedShop')
  if (part.lock === 'quest') return t('lockedQuest')
  return t('lockedEvent')
}
