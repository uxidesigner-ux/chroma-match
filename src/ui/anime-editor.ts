import { ANIME_LOOKS, DEFAULT_ANIME, encodeAnime } from '../avatar/anime-spec.ts'
import type { AnimeSpec } from '../avatar/anime-spec.ts'
import { myAvatar, setMyAvatar } from '../avatar/store.ts'
import { cachePortrait } from '../avatar/anime-portrait.ts'
import { account } from '../leaderboard/session.ts'
import type { AnimeRenderer } from '../avatar/anime-renderer.ts'
import { animeCopy } from './anime-copy.ts'

type Category = 'looks' | 'hair' | 'colours' | 'expression'

/** An explicit draft: navigating away cannot silently overwrite the profile. */
export class AnimeEditor {
  private draft: AnimeSpec = { ...DEFAULT_ANIME }
  private initial = ''
  private category: Category = 'looks'
  private renderer: AnimeRenderer | null = null
  private canvas = document.createElement('canvas')
  private stage = document.createElement('div')
  private loading = document.createElement('div')
  private panel = document.createElement('div')
  private tabs = document.createElement('div')
  private status = document.createElement('p')
  private save = document.createElement('button')
  private discard = document.createElement('div')
  private generation = 0
  private ready = false
  private busy = false
  private face = window.innerWidth < 860
  private closed = true

  constructor(
    private root: HTMLElement,
    private changed: () => Promise<void>,
    private exit: () => void,
  ) {}

  open(): void {
    this.closed = false
    this.draft = { ...(myAvatar().anime ?? DEFAULT_ANIME) }
    this.initial = encodeAnime(this.draft)
    this.build()
    void this.load()
  }

  close(): void {
    this.closed = true
    this.busy = false
    this.generation++
    this.renderer?.dispose()
    this.renderer = null
    this.ready = false
  }

  requestLeave(leave: () => void = this.exit): void {
    if (encodeAnime(this.draft) === this.initial) {
      leave()
      return
    }
    const copy = animeCopy()
    this.discard.replaceChildren()
    const message = document.createElement('p')
    message.textContent = copy.discard
    const keep = this.button(copy.keep, () => {
      this.discard.hidden = true
      this.save.focus()
    })
    this.discard.append(message, keep, this.button(copy.leave, leave))
    this.discard.hidden = false
    keep.focus()
  }

  private button(
    label: string,
    action: () => void,
    className = 'studio-button',
  ): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = className
    button.textContent = label
    button.addEventListener('click', action)
    return button
  }

  private build(): void {
    const copy = animeCopy()
    this.root.replaceChildren()
    this.root.className = 'anime-studio'
    const heading = document.createElement('div')
    heading.className = 'studio-heading'
    const title = document.createElement('h3')
    title.textContent = copy.intro
    const description = document.createElement('p')
    description.textContent = copy.description
    heading.append(title, description)
    this.stage = document.createElement('div')
    this.stage.className = 'studio-stage'
    this.canvas = document.createElement('canvas')
    this.canvas.tabIndex = 0
    this.canvas.setAttribute('aria-label', copy.preview)
    this.canvas.setAttribute('aria-describedby', 'studio-rotate-help')
    this.loading = document.createElement('div')
    this.loading.className = 'studio-loading'
    this.loading.setAttribute('role', 'status')
    const modelName = document.createElement('span')
    modelName.className = 'studio-model-name'
    modelName.textContent = copy.starter
    this.stage.append(this.canvas, modelName, this.loading)
    const toolbar = document.createElement('div')
    toolbar.className = 'studio-toolbar'
    const left = this.button('↶', () => this.renderer?.rotate(-1))
    left.setAttribute('aria-label', copy.left)
    const right = this.button('↷', () => this.renderer?.rotate(1))
    right.setAttribute('aria-label', copy.right)
    const frame = this.button(this.face ? copy.full : copy.portrait, () => {
      this.face = !this.face
      this.renderer?.framePortrait(this.face)
      frame.textContent = this.face ? copy.full : copy.portrait
    })
    const random = this.button(copy.random, () => {
      const look = ANIME_LOOKS[Math.floor(Math.random() * ANIME_LOOKS.length)]!
      this.update({ ...look, hair: Math.random() < 0.5 ? 'bob' : 'tails' })
      this.paintOptions()
    })
    toolbar.append(left, frame, right, random)
    const hint = document.createElement('p')
    hint.id = 'studio-rotate-help'
    hint.className = 'studio-hint'
    hint.textContent = copy.rotate
    const controls = document.createElement('div')
    controls.className = 'studio-controls'
    this.tabs = document.createElement('div')
    this.tabs.className = 'studio-tabs'
    this.tabs.setAttribute('role', 'tablist')
    this.tabs.setAttribute('aria-label', copy.description)
    for (const key of ['looks', 'hair', 'colours', 'expression'] as const) {
      const button = this.button(
        copy[key],
        () => {
          this.category = key
          this.paintOptions()
        },
        'studio-tab',
      )
      button.id = `studio-tab-${key}`
      button.dataset.category = key
      button.setAttribute('role', 'tab')
      button.setAttribute('aria-controls', 'studio-options')
      this.tabs.append(button)
    }
    this.tabs.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const tabs = Array.from(this.tabs.querySelectorAll('button'))
      const current = tabs.indexOf(document.activeElement as HTMLButtonElement)
      const index =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabs.length - 1
            : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
      tabs[index]?.click()
      tabs[index]?.focus()
    })
    this.panel = document.createElement('div')
    this.panel.id = 'studio-options'
    this.panel.className = 'studio-options'
    this.panel.setAttribute('role', 'tabpanel')
    controls.append(this.tabs, this.panel)
    const footer = document.createElement('div')
    footer.className = 'studio-footer'
    this.status = document.createElement('p')
    this.status.className = 'studio-status'
    this.status.setAttribute('role', 'status')
    this.status.textContent = copy.ready
    this.save = this.button(copy.apply, () => void this.apply(), 'btn btn-primary studio-apply')
    this.save.disabled = true
    footer.append(this.status, this.save)
    this.discard = document.createElement('div')
    this.discard.className = 'studio-discard'
    this.discard.setAttribute('role', 'group')
    this.discard.hidden = true
    const credit = document.createElement('a')
    credit.href = new URL('licenses/anime-assets.html', document.baseURI).href
    credit.target = '_blank'
    credit.rel = 'noopener'
    credit.className = 'studio-credit'
    credit.textContent = copy.credit
    const viewer = document.createElement('div')
    viewer.className = 'studio-viewer'
    viewer.append(this.stage, toolbar, hint)
    const edit = document.createElement('div')
    edit.className = 'studio-edit'
    edit.append(heading, controls, this.discard, footer, credit)
    this.root.append(viewer, edit)
    this.paintOptions()
  }

  private async load(): Promise<void> {
    const mine = ++this.generation
    this.ready = false
    this.save.disabled = true
    this.root.dataset.state = 'loading'
    this.loading.hidden = false
    this.loading.textContent = `${animeCopy().loading} ${animeCopy().loadingNote}`
    this.renderer?.dispose()
    this.renderer = null
    // A lost WebGL context cannot reliably be reused for the Retry action.
    const freshCanvas = this.canvas.cloneNode(false) as HTMLCanvasElement
    this.canvas.replaceWith(freshCanvas)
    this.canvas = freshCanvas
    let candidate: AnimeRenderer | null = null
    try {
      const { AnimeRenderer } = await import('../avatar/anime-renderer.ts')
      if (mine !== this.generation || this.closed) return
      candidate = new AnimeRenderer(this.canvas)
      this.renderer = candidate
      await candidate.load(this.draft)
      if (mine !== this.generation || this.closed) {
        candidate.dispose()
        return
      }
      candidate.apply(this.draft)
      candidate.attach(this.stage, () => this.failed())
      candidate.framePortrait(this.face)
      this.loading.hidden = true
      this.root.dataset.state = 'ready'
      this.ready = true
      this.save.disabled = false
    } catch (error) {
      candidate?.dispose()
      if (mine !== this.generation || this.closed) return
      console.warn('Character studio could not load', error)
      this.failed()
    }
  }

  private failed(): void {
    this.ready = false
    this.save.disabled = true
    this.root.dataset.state = 'error'
    this.loading.hidden = false
    const message = document.createElement('p')
    message.textContent = animeCopy().failed
    this.loading.replaceChildren(
      message,
      this.button(animeCopy().retry, () => void this.load()),
    )
  }

  private update(spec: AnimeSpec): void {
    this.draft = { ...spec }
    this.renderer?.apply(this.draft)
    this.status.textContent = animeCopy().ready
    this.discard.hidden = true
  }

  private paintOptions(): void {
    const copy = animeCopy()
    const focused = this.panel.contains(document.activeElement)
      ? document.activeElement?.textContent
      : null
    for (const tab of this.tabs.querySelectorAll<HTMLButtonElement>('button')) {
      const active = tab.dataset.category === this.category
      tab.setAttribute('aria-selected', String(active))
      tab.tabIndex = active ? 0 : -1
    }
    this.panel.setAttribute('aria-labelledby', `studio-tab-${this.category}`)
    this.panel.replaceChildren()
    this.panel.dataset.category = this.category
    if (this.category === 'looks') {
      ANIME_LOOKS.forEach((look, index) => {
        const name = (['mint', 'ember', 'frost', 'rose'] as const)[index]!
        const button = this.button(
          copy[name],
          () => {
            this.update(look)
            this.paintOptions()
          },
          'studio-look',
        )
        const palette = document.createElement('span')
        palette.className = 'studio-look-palette'
        palette.setAttribute('aria-hidden', 'true')
        for (const hex of [look.hairColour, look.eyeColour, look.outfitColour]) {
          const swatch = document.createElement('i')
          swatch.style.background = `#${hex}`
          palette.append(swatch)
        }
        button.prepend(palette)
        button.setAttribute('aria-pressed', String(encodeAnime(look) === encodeAnime(this.draft)))
        this.panel.append(button)
      })
    } else if (this.category === 'hair' || this.category === 'expression') {
      const group = document.createElement('div')
      group.className = 'studio-choice-group'
      group.setAttribute('role', 'group')
      group.setAttribute('aria-label', this.category === 'hair' ? copy.hairstyle : copy.expression)
      this.panel.append(group)
      const options =
        this.category === 'hair'
          ? (['tails', 'bob'] as const)
          : (['neutral', 'happy', 'relaxed'] as const)
      for (const value of options) {
        const slot = this.category
        const button = this.button(copy[value], () => {
          this.update({ ...this.draft, [slot]: value })
          this.paintOptions()
        })
        button.setAttribute('aria-pressed', String(this.draft[slot] === value))
        group.append(button)
      }
      if (this.category === 'hair') {
        const equipmentGroup = document.createElement('div')
        equipmentGroup.className = 'studio-choice-group'
        equipmentGroup.setAttribute('role', 'group')
        equipmentGroup.setAttribute('aria-label', copy.equipment)
        for (const equipment of ['none', 'gear'] as const) {
          const button = this.button(copy[equipment], () => {
            this.update({ ...this.draft, equipment })
            this.paintOptions()
          })
          button.setAttribute('aria-pressed', String(this.draft.equipment === equipment))
          equipmentGroup.append(button)
        }
        this.panel.append(equipmentGroup)
      }
    } else {
      for (const key of ['hairColour', 'eyeColour', 'outfitColour', 'backdrop'] as const) {
        const label = document.createElement('label')
        label.className = 'studio-colour'
        const name = document.createElement('span')
        name.textContent = copy[key]
        const input = document.createElement('input')
        input.type = 'color'
        input.value = `#${this.draft[key]}`
        input.setAttribute('aria-label', copy[key])
        input.addEventListener('input', () =>
          this.update({ ...this.draft, [key]: input.value.slice(1).toUpperCase() }),
        )
        label.append(name, input)
        this.panel.append(label)
      }
    }
    if (focused)
      Array.from(this.panel.querySelectorAll('button'))
        .find((button) => button.textContent === focused)
        ?.focus({ preventScroll: true })
  }

  private async apply(): Promise<void> {
    if (!this.ready || !this.renderer || this.busy) return
    const copy = animeCopy()
    this.busy = true
    this.save.disabled = true
    this.root
      .querySelectorAll<HTMLButtonElement | HTMLInputElement>(
        '.studio-button, .studio-look, .studio-tab, input',
      )
      .forEach((node) => {
        node.disabled = true
      })
    const mine = this.generation
    try {
      const png = this.renderer.portrait()
      if (!setMyAvatar({ ...myAvatar(), anime: { ...this.draft } })) {
        this.status.textContent = copy.storageFailed
        return
      }
      cachePortrait(this.draft, png)
      this.initial = encodeAnime(this.draft)
      this.discard.hidden = true
      const online = account()?.kind === 'google'
      this.status.textContent = online ? copy.syncing : copy.saved
      await this.changed()
      if (mine === this.generation) this.status.textContent = online ? copy.synced : copy.saved
    } catch {
      if (mine === this.generation) this.status.textContent = copy.syncFailed
    } finally {
      if (mine === this.generation) {
        this.busy = false
        this.root
          .querySelectorAll<HTMLButtonElement | HTMLInputElement>(
            '.studio-button, .studio-look, .studio-tab, input',
          )
          .forEach((node) => {
            node.disabled = false
          })
        this.save.disabled = !this.ready
      }
    }
  }
}
