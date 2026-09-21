import { ANIME_LOOKS, DEFAULT_ANIME, EXPRESSIONS, encodeAnime } from '../avatar/anime-spec.ts'
import type { AnimeSpec } from '../avatar/anime-spec.ts'
import { myAvatar, setMyAvatar } from '../avatar/store.ts'
import { cachePortrait } from '../avatar/anime-portrait.ts'
import { account } from '../leaderboard/session.ts'
import type { AnimeRenderer } from '../avatar/anime-renderer.ts'
import { animeCopy } from './anime-copy.ts'
import { playCopy } from './play-copy.ts'
import { studioToolsCopy } from './studio-tools-copy.ts'
import { LIBRARY_LIMIT, LookHistory, lookFile, parseLookFile, readLibrary, writeLibrary } from '../avatar/studio-library.ts'
import { decodeSpec, encodeSpec } from '../avatar/spec.ts'

type Category = 'looks' | 'hair' | 'colours' | 'expression' | 'library'

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
  private face = false
  private closed = true
  private history = new LookHistory()
  private undo = document.createElement('button')
  private redo = document.createElement('button')
  private paused = false
  private transparent = false

  constructor(
    private root: HTMLElement,
    private changed: () => Promise<void>,
    private exit: () => void,
  ) {}

  open(): void {
    this.closed = false
    this.draft = { ...myAvatar() }
    this.initial = encodeAnime(this.draft)
    this.history = new LookHistory()
    this.paused = false
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
    const tools = studioToolsCopy()
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
    this.root.dataset.framing = this.face ? 'face' : 'full'
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
    const framing = document.createElement('div')
    framing.className = 'studio-view-switch'
    framing.setAttribute('role', 'group')
    framing.setAttribute('aria-label', copy.framing)
    for (const face of [false, true]) {
      const button = this.button(face ? copy.portrait : copy.full, () => {
        this.face = face
        this.root.dataset.framing = face ? 'face' : 'full'
        this.renderer?.framePortrait(face)
        for (const item of framing.querySelectorAll('button')) {
          item.setAttribute('aria-pressed', String(item === button))
        }
      })
      button.setAttribute('aria-pressed', String(this.face === face))
      framing.append(button)
    }
    const direction = document.createElement('div')
    direction.className = 'studio-direction'
    direction.setAttribute('role', 'group')
    direction.setAttribute('aria-label', copy.direction)
    for (const [label, yaw] of [
      [copy.front, 0],
      [copy.side, Math.PI / 2],
      [copy.back, Math.PI],
    ] as const) {
      const button = this.button(label, () => this.renderer?.faceDirection(yaw))
      button.dataset.requiresModel = ''
      button.disabled = true
      direction.append(button)
    }
    const random = this.button(copy.random, () => {
      const pick = (): AnimeSpec => ANIME_LOOKS[Math.floor(Math.random() * ANIME_LOOKS.length)]!
      this.update({ ...pick(), hairColour: pick().hairColour, eyeColour: pick().eyeColour,
        outfitColour: pick().outfitColour, hair: Math.random() < 0.5 ? 'bob' : 'tails',
        equipment: Math.random() < 0.5 ? 'none' : 'gear',
        expression: EXPRESSIONS[Math.floor(Math.random() * EXPRESSIONS.length)]! })
      this.paintOptions()
    })
    toolbar.append(framing, direction)
    const gestures = document.createElement('div')
    gestures.className = 'studio-direction'
    for (const kind of ['wave', 'cheer', 'pose'] as const) {
      const button = this.button(playCopy()[kind], () => this.renderer?.gesture(kind))
      button.dataset.requiresModel = ''
      button.disabled = true
      gestures.append(button)
    }
    toolbar.append(gestures)
    const pause = this.button(tools.pause, () => {
      this.paused = !this.paused
      pause.setAttribute('aria-pressed', String(this.paused))
      this.renderer?.pause(this.paused)
    })
    pause.setAttribute('aria-pressed', 'false')
    toolbar.append(pause)
    const hint = document.createElement('p')
    hint.id = 'studio-rotate-help'
    hint.className = 'studio-hint'
    hint.textContent = `${copy.rotate} ${tools.gaze}`
    const portraitNote = document.createElement('p')
    portraitNote.className = 'studio-hint'
    portraitNote.textContent = copy.portraitNote
    const controls = document.createElement('div')
    controls.className = 'studio-controls'
    this.tabs = document.createElement('div')
    this.tabs.className = 'studio-tabs'
    this.tabs.setAttribute('role', 'tablist')
    this.tabs.setAttribute('aria-label', copy.description)
    for (const key of ['looks', 'hair', 'colours', 'expression', 'library'] as const) {
      const button = this.button(
        key === 'library' ? tools.library : copy[key],
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
    const history = document.createElement('div')
    history.className = 'studio-choice-group studio-history'
    this.undo = this.button(tools.undo, () => this.restoreHistory(false))
    this.redo = this.button(tools.redo, () => this.restoreHistory(true))
    history.append(this.undo, this.redo, this.button(tools.reset, () => {
      this.update(DEFAULT_ANIME)
      this.paintOptions()
    }), random)
    controls.append(this.tabs, this.panel, history)
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
    viewer.append(this.stage, toolbar, hint, portraitNote)
    const edit = document.createElement('div')
    edit.className = 'studio-edit'
    edit.append(heading, controls, this.discard, footer, this.buildDownloads(), credit)
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
      candidate.pause(this.paused)
      this.loading.hidden = true
      this.root.dataset.state = 'ready'
      this.ready = true
      this.save.disabled = false
      this.root.querySelectorAll<HTMLButtonElement>('[data-requires-model]').forEach((button) => {
        button.disabled = false
      })
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
    this.root.querySelectorAll<HTMLButtonElement>('[data-requires-model]').forEach((button) => {
      button.disabled = true
    })
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
    if (this.busy) return
    this.history.push(this.draft, spec)
    this.draft = { ...spec }
    this.renderer?.apply(this.draft)
    this.status.textContent = animeCopy().ready
    this.discard.hidden = true
    this.refreshHistory()
  }

  private refreshHistory(): void {
    this.undo.disabled = this.busy || !this.history.canUndo
    this.redo.disabled = this.busy || !this.history.canRedo
  }

  private restoreHistory(redo: boolean): void {
    if (this.busy) return
    this.draft = redo ? this.history.redo(this.draft) : this.history.undo(this.draft)
    this.renderer?.apply(this.draft)
    this.status.textContent = animeCopy().ready
    this.discard.hidden = true
    this.paintOptions()
  }

  private paintOptions(): void {
    const copy = animeCopy()
    const tools = studioToolsCopy()
    this.refreshHistory()
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
    } else if (this.category === 'library') {
      this.paintLibrary()
    } else if (this.category === 'hair' || this.category === 'expression') {
      const group = document.createElement('div')
      group.className = 'studio-choice-group'
      group.setAttribute('role', 'group')
      group.setAttribute('aria-label', this.category === 'hair' ? copy.hairstyle : copy.expression)
      this.panel.append(group)
      const options =
        this.category === 'hair'
          ? (['tails', 'bob'] as const)
          : EXPRESSIONS
      for (const value of options) {
        const slot = this.category
        const label = value === 'angry' || value === 'sad' || value === 'surprised' ? tools[value] : copy[value]
        const button = this.button(label, () => {
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

  private paintLibrary(): void {
    const copy = studioToolsCopy()
    const looks = readLibrary(localStorage)
    const note = document.createElement('p')
    note.className = 'studio-file-note'
    note.textContent = copy.local
    const form = document.createElement('form')
    form.className = 'studio-library-form'
    const label = document.createElement('label')
    label.textContent = copy.name
    const input = document.createElement('input')
    input.type = 'text'
    input.maxLength = 32
    input.required = true
    input.autocomplete = 'off'
    label.append(input)
    const save = this.button(copy.saveLook, () => {})
    save.type = 'submit'
    form.append(label, save)
    form.addEventListener('submit', event => {
      event.preventDefault()
      if (this.busy) return
      const name = input.value.trim()
      if (!name) { this.status.textContent = copy.nameRequired; input.focus(); return }
      const current = readLibrary(localStorage)
      if (current.length >= LIBRARY_LIMIT) { this.status.textContent = copy.full; return }
      const next = [...current, { id: crypto.randomUUID(), name, code: encodeSpec(this.draft) }]
      if (!writeLibrary(localStorage, next)) { this.status.textContent = animeCopy().storageFailed; return }
      this.paintOptions()
      this.status.textContent = copy.savedLook
      this.panel.querySelector('input')?.focus()
    })
    this.panel.append(note, form)
    if (!looks.length) {
      const empty = document.createElement('p')
      empty.className = 'studio-file-note'
      empty.textContent = copy.empty
      this.panel.append(empty)
    }
    const list = document.createElement('ul')
    list.className = 'studio-saved-list'
    for (const look of looks) {
      const row = document.createElement('li')
      const name = document.createElement('span')
      name.textContent = look.name
      const load = this.button(copy.load, () => {
        this.update(decodeSpec(look.code))
        this.paintOptions()
        this.status.textContent = copy.loaded
      })
      load.setAttribute('aria-label', `${copy.load}: ${look.name}`)
      const remove = this.button(copy.remove, () => {
        if (remove.dataset.confirm !== 'true') {
          remove.dataset.confirm = 'true'
          remove.textContent = copy.confirm
          remove.setAttribute('aria-label', `${copy.confirm}: ${look.name}`)
          return
        }
        if (writeLibrary(localStorage, readLibrary(localStorage).filter(item => item.id !== look.id))) {
          this.paintOptions()
          this.status.textContent = copy.removed
          this.panel.querySelector('input')?.focus()
        } else this.status.textContent = animeCopy().storageFailed
      })
      remove.setAttribute('aria-label', `${copy.remove}: ${look.name}`)
      row.append(name, load, remove)
      list.append(row)
    }
    this.panel.append(list)
  }

  private buildDownloads(): HTMLElement {
    const copy = studioToolsCopy()
    const section = document.createElement('div')
    section.className = 'studio-files'
    const group = (title: string, note: string): HTMLDetailsElement => {
      const details = document.createElement('details')
      const summary = document.createElement('summary')
      summary.textContent = title
      const text = document.createElement('p')
      text.className = 'studio-file-note'
      text.textContent = note
      details.append(summary, text)
      section.append(details)
      return details
    }
    const files = group(copy.files, copy.fileHelp)
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.setAttribute('aria-label', copy.importLook)
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file || this.busy) return
      const mine = this.generation
      const before = encodeSpec(this.draft)
      void (async () => {
        try {
          if (file.size > 16384) throw new Error('File too large')
          const spec = parseLookFile(await file.text())
          if (this.closed || this.busy || mine !== this.generation || before !== encodeSpec(this.draft)) return
          this.update(spec)
          this.paintOptions()
          this.status.textContent = copy.loaded
        } catch {
          if (!this.closed && mine === this.generation) this.status.textContent = copy.invalid
        } finally { input.value = '' }
      })()
    })
    const label = document.createElement('label')
    label.className = 'studio-import'
    label.append(copy.importLook, input)
    files.append(this.button(copy.exportLook, () => void this.download('json')), label)
    const images = group(copy.downloads, copy.modelNote)
    const transparent = document.createElement('label')
    transparent.className = 'studio-transparent'
    const check = document.createElement('input')
    check.type = 'checkbox'
    check.checked = this.transparent
    check.addEventListener('change', () => { this.transparent = check.checked })
    transparent.append(check, copy.transparent)
    images.append(transparent)
    const actions = document.createElement('div')
    actions.className = 'studio-choice-group'
    for (const kind of ['face', 'body', 'sheet', 'vrm', 'glb'] as const) {
      const button = this.button(copy[kind], () => void this.download(kind))
      button.dataset.requiresModel = ''
      button.disabled = true
      actions.append(button)
    }
    images.append(actions)
    return section
  }

  private async download(kind: 'json' | 'face' | 'body' | 'sheet' | 'vrm' | 'glb'): Promise<void> {
    if (this.busy || (kind !== 'json' && (!this.ready || !this.renderer))) return
    const copy = studioToolsCopy()
    this.busy = true
    this.status.textContent = copy.working
    const controls = [...this.root.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input')]
    const disabled = controls.map(control => control.disabled)
    controls.forEach(control => { control.disabled = true })
    const mine = this.generation
    try {
      await new Promise(resolve => setTimeout(resolve, 0))
      if (this.closed || mine !== this.generation) return
      let blob: Blob
      let extension: string = kind
      if (kind === 'json') blob = new Blob([lookFile(this.draft)], { type: 'application/json' })
      else if (kind === 'vrm' || kind === 'glb') blob = new Blob([this.renderer!.exportModel(this.draft)], { type: 'model/gltf-binary' })
      else {
        const png = this.renderer!.screenshot(kind, this.transparent)
        blob = new Blob([Uint8Array.from(atob(png.split(',')[1]!), c => c.charCodeAt(0))], { type: 'image/png' })
        extension = `${kind}.png`
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `chroma-character.${extension}`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 30000)
      this.status.textContent = copy.downloaded
    } catch { this.status.textContent = copy.failed }
    finally {
      if (mine === this.generation) {
        this.busy = false
        controls.forEach((control, index) => { control.disabled = disabled[index]! })
        if (!this.ready) this.failed()
      }
    }
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
      if (!setMyAvatar({ ...this.draft })) {
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
        this.refreshHistory()
        if (!this.ready) this.failed()
      }
    }
  }
}
