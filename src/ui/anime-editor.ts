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
import { Sheet } from './sheet.ts'

type Category = 'looks' | 'hair' | 'gear' | 'colours' | 'expression' | 'library'

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
  private discard = document.createElement('dialog')
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
  private files: Sheet | null = null
  private filesBody: HTMLElement = document.createElement('div')

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
    this.files?.hide()
    if (this.discard.open) this.discard.close()
    this.closed = true
    this.busy = false
    this.generation++
    this.renderer?.dispose()
    this.renderer = null
    this.ready = false
  }

  /**
   * The one question in the editor that can lose work, asked as a real dialog.
   *
   * It used to be a div unhidden in the middle of the scrolling column: no
   * focus trap, no Escape, and the editor stayed live behind it, so the player
   * could keep changing the character they had just been asked about.
   */
  requestLeave(leave: () => void = this.exit): void {
    if (encodeAnime(this.draft) === this.initial) {
      leave()
      return
    }
    const copy = animeCopy()
    this.discard.replaceChildren()
    const message = document.createElement('p')
    message.textContent = copy.discard
    const keep = this.button(copy.keep, () => this.discard.close())
    const actions = document.createElement('div')
    actions.className = 'studio-discard-actions'
    actions.append(keep, this.button(copy.leave, leave, 'studio-button studio-discard-leave'))
    this.discard.append(message, actions)
    this.discard.showModal()
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

  private icon(
    label: string,
    icon: string,
    action: () => void,
    className = 'studio-button studio-icon',
  ): HTMLButtonElement {
    const button = this.button('', action, className)
    button.setAttribute('aria-label', label)
    button.title = label
    const mark = document.createElement('span')
    mark.className = `hud-ico hud-ico-${icon}`
    mark.setAttribute('aria-hidden', 'true')
    button.replaceChildren(mark)
    return button
  }

  /**
   * An icon with its name under it.
   *
   * The editor used to be eighteen unlabelled circles: every control carried
   * its name in `title`, which a touch device never shows, so on a phone the
   * whole screen was guesswork. Anything the player has to understand before
   * pressing it says what it is on the button.
   */
  private labelled(
    label: string,
    icon: string,
    action: () => void,
    className = 'studio-button studio-icon',
  ): HTMLButtonElement {
    const button = this.icon(label, icon, action, `${className} studio-labelled`)
    const text = document.createElement('span')
    text.className = 'studio-button-label'
    text.textContent = label
    button.append(text)
    return button
  }

  /**
   * A stage control with no glyph at all.
   *
   * Framing and direction are the two clusters where a 20px icon could not
   * carry the distinction — front, side and back were one head-and-shoulders
   * silhouette separated by a five-pixel line, and the framing face was the
   * same drawing as the expression tab. Two Korean characters fit the same
   * 44px circle and are unambiguous.
   */
  private word(label: string, action: () => void, className = ''): HTMLButtonElement {
    const button = this.button(label, action, `studio-button studio-word ${className}`.trim())
    button.title = label
    return button
  }

  /**
   * Every control the editor owns, including the ones that moved into the
   * sheet. The export buttons wait on the model and are disabled during a
   * download, and both of those used to be a query rooted at the editor — which
   * stopped finding them the moment they left it.
   */
  private everyControl<T extends HTMLElement>(selector: string): T[] {
    return [
      ...this.root.querySelectorAll<T>(selector),
      ...this.filesBody.querySelectorAll<T>(selector),
    ]
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
    toolbar.className = 'studio-hud'
    const framing = document.createElement('div')
    framing.className = 'studio-view-switch studio-hud-cluster studio-hud-framing'
    framing.setAttribute('role', 'group')
    framing.setAttribute('aria-label', copy.framing)
    for (const face of [false, true]) {
      const button = this.word(face ? copy.portrait : copy.full, () => {
        this.face = face
        this.root.dataset.framing = face ? 'face' : 'full'
        this.renderer?.framePortrait(face)
        for (const item of framing.querySelectorAll('button')) {
          item.setAttribute('aria-pressed', String(item === button))
        }
      }, 'studio-control')
      button.setAttribute('aria-pressed', String(this.face === face))
      button.dataset.requiresModel = ''
      button.disabled = true
      framing.append(button)
    }
    const direction = document.createElement('div')
    direction.className = 'studio-direction studio-hud-cluster studio-hud-orbit'
    direction.setAttribute('role', 'group')
    direction.setAttribute('aria-label', copy.direction)
    for (const [label, yaw] of [
      [copy.front, 0],
      [copy.side, Math.PI / 2],
      [copy.back, Math.PI],
    ] as const) {
      const button = this.word(label, () => this.renderer?.faceDirection(yaw), 'studio-control')
      button.dataset.requiresModel = ''
      button.disabled = true
      direction.append(button)
    }
    const random = this.icon(copy.random, 'shuffle', () => {
      const pick = (): AnimeSpec => ANIME_LOOKS[Math.floor(Math.random() * ANIME_LOOKS.length)]!
      const kit = pick()
      this.update({
        ...pick(),
        hairColour: pick().hairColour,
        eyeColour: pick().eyeColour,
        outfitColour: pick().outfitColour,
        hair: Math.random() < 0.5 ? 'bob' : 'tails',
        pack: kit.pack,
        arms: kit.arms,
        visor: kit.visor,
        expression: EXPRESSIONS[Math.floor(Math.random() * EXPRESSIONS.length)]!,
      })
      this.paintOptions()
    })
    const gestures = document.createElement('div')
    gestures.className = 'studio-direction studio-hud-cluster studio-hud-gestures'
    for (const kind of ['wave', 'cheer', 'pose'] as const) {
      const button = this.word(playCopy()[kind], () => this.renderer?.gesture(kind), 'studio-control')
      button.dataset.requiresModel = ''
      button.disabled = true
      gestures.append(button)
    }
    const pause = this.icon(tools.pause, 'pause', () => {
      this.paused = !this.paused
      pause.setAttribute('aria-pressed', String(this.paused))
      this.renderer?.pause(this.paused)
    }, 'studio-button studio-icon studio-control')
    pause.setAttribute('aria-pressed', 'false')
    pause.classList.add('studio-hud-pause')
    random.classList.add('studio-hud-shuffle', 'studio-control')
    for (const button of [pause, random]) {
      button.dataset.requiresModel = ''
      button.disabled = true
    }
    /*
     * Direction sits under the preview rather than on it.
     *
     * Ten floating controls covered roughly a quarter of a 240px stage, which
     * is a lot of the character to hide behind buttons. Turning the model is
     * also what dragging already does, so of the ten these are the three that
     * lose least by moving off the figure and gain a caption by doing it.
     */
    toolbar.append(framing, gestures, pause, random)
    this.stage.append(toolbar)
    const hint = document.createElement('p')
    hint.id = 'studio-rotate-help'
    hint.className = 'studio-hint'
    hint.textContent = `${copy.rotate} ${tools.gaze}`
    // Written long ago and never put on screen: the one line that says the
    // framing buttons move the camera and not what gets saved.
    const portraitNote = document.createElement('p')
    portraitNote.className = 'studio-hint studio-note'
    portraitNote.textContent = copy.portraitNote
    const controls = document.createElement('div')
    controls.className = 'studio-controls'
    this.tabs = document.createElement('div')
    this.tabs.className = 'studio-tabs'
    this.tabs.setAttribute('role', 'tablist')
    this.tabs.setAttribute('aria-label', copy.description)
    /*
     * Equipment used to live inside the hair tab, behind a hairstyle glyph and
     * no text — the backpack, arm gear and visor were unreachable unless you
     * pressed a picture of hair on the off chance. They get their own tab, and
     * every tab says its name.
     */
    const tabs: ReadonlyArray<readonly [Category, string, string]> = [
      ['looks', 'looks', copy.looks],
      ['hair', 'hair', copy.hair],
      ['gear', 'pack', copy.equipment],
      ['colours', 'colours', copy.colours],
      ['expression', 'expression', copy.expression],
      ['library', 'library', tools.library],
    ]
    for (const [key, icon, label] of tabs) {
      const button = this.labelled(label, icon, () => {
        this.category = key
        this.paintOptions()
      }, 'studio-tab studio-icon')
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
    this.undo = this.labelled(tools.undo, 'undo', () => this.restoreHistory(false))
    this.redo = this.labelled(tools.redo, 'redo', () => this.restoreHistory(true))
    history.append(this.undo, this.redo, this.labelled(tools.reset, 'reset', () => {
      this.update(DEFAULT_ANIME)
      this.paintOptions()
    }))
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
    this.discard = document.createElement('dialog')
    this.discard.className = 'studio-discard'
    this.discard.addEventListener('close', () => {
      if (!this.save.disabled) this.save.focus()
    })
    const credit = document.createElement('a')
    credit.href = new URL('licenses/anime-assets.html', document.baseURI).href
    credit.target = '_blank'
    credit.rel = 'noopener'
    credit.className = 'studio-credit'
    credit.textContent = copy.credit
    const viewer = document.createElement('div')
    viewer.className = 'studio-viewer'
    direction.classList.remove('studio-hud-cluster', 'studio-hud-orbit')
    direction.classList.add('studio-below-stage')
    viewer.append(this.stage, direction, hint, portraitNote)
    const edit = document.createElement('div')
    edit.className = 'studio-edit'
    edit.append(heading, controls, this.discard, footer, this.buildFilesButton(), credit)
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
      for (const button of this.everyControl<HTMLButtonElement>('[data-requires-model]')) {
        button.disabled = false
      }
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
    for (const button of this.everyControl<HTMLButtonElement>('[data-requires-model]')) {
      button.disabled = true
    }
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
    if (this.discard.open) this.discard.close()
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
    if (this.discard.open) this.discard.close()
    this.paintOptions()
  }

  private paintOptions(): void {
    const copy = animeCopy()
    const tools = studioToolsCopy()
    this.refreshHistory()
    const active = document.activeElement as HTMLElement | null
    const focused = this.panel.contains(active)
      ? active?.getAttribute('aria-label') || active?.textContent
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
      const names = ['mint', 'ember', 'frost', 'rose', 'copper', 'ink', 'violet', 'lime'] as const
      ANIME_LOOKS.forEach((look, index) => {
        const name = names[index]!
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
        const button = this.labelled(label, value, () => {
          this.update({ ...this.draft, [slot]: value })
          this.paintOptions()
        }, 'studio-button studio-icon studio-trait')
        button.setAttribute('aria-pressed', String(this.draft[slot] === value))
        group.append(button)
      }
    } else if (this.category === 'gear') {
      const traitGroup = document.createElement('div')
      traitGroup.className = 'studio-choice-group studio-traits'
      traitGroup.setAttribute('role', 'group')
      traitGroup.setAttribute('aria-label', copy.equipment)
      for (const [key, icon] of [
        ['pack', 'pack'],
        ['arms', 'arms'],
        ['visor', 'visor'],
      ] as const) {
        const on = this.draft[key]
        const button = this.labelled(copy[key], icon, () => {
          this.update({ ...this.draft, [key]: !on })
          this.paintOptions()
        }, 'studio-button studio-icon studio-trait')
        button.setAttribute('aria-pressed', String(on))
        traitGroup.append(button)
      }
      const kit = document.createElement('div')
      kit.className = 'studio-choice-group'
      kit.setAttribute('role', 'group')
      kit.setAttribute('aria-label', copy.equipment)
      const allOn = this.draft.pack && this.draft.arms && this.draft.visor
      const allOff = !this.draft.pack && !this.draft.arms && !this.draft.visor
      for (const [label, icon, next] of [
        [copy.none, 'none', { pack: false, arms: false, visor: false }],
        [copy.gear, 'gear', { pack: true, arms: true, visor: true }],
      ] as const) {
        const button = this.labelled(label, icon, () => {
          this.update({ ...this.draft, ...next })
          this.paintOptions()
        }, 'studio-button studio-icon studio-trait')
        button.setAttribute('aria-pressed', String(icon === 'gear' ? allOn : allOff))
        kit.append(button)
      }
      this.panel.append(traitGroup, kit)
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
        .find((button) => (button.getAttribute('aria-label') || button.textContent) === focused)
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

  /**
   * One button where nine controls used to sit.
   *
   * Exporting a .vrm, restoring a .json, deciding whether a PNG keeps its
   * background: real features, and all of them below the fold of what someone
   * came here to do, which is choose a face. They live in a sheet now — the
   * same move the launch screen made with the daily reward — so the editor
   * reads as a character editor and the file tools are still one tap away.
   */
  private buildFilesButton(): HTMLElement {
    const tools = studioToolsCopy()
    this.files ??= new Sheet('sheet-studio-files')
    this.filesBody = document.getElementById('studio-files-body') as HTMLElement
    this.filesBody.replaceChildren(this.buildDownloads())
    const row = document.createElement('div')
    row.className = 'studio-files-open'
    row.append(this.button(tools.openFiles, () => this.files?.show()))
    return row
  }

  private buildDownloads(): HTMLElement {
    const copy = studioToolsCopy()
    const section = document.createElement('div')
    section.className = 'studio-files'
    // The sheet is already the disclosure; a second one inside it would make a
    // player open two things to reach one button.
    const group = (title: string, note: string): HTMLElement => {
      const block = document.createElement('section')
      block.className = 'studio-file-group'
      const heading = document.createElement('h3')
      heading.textContent = title
      const text = document.createElement('p')
      text.className = 'studio-file-note'
      text.textContent = note
      block.append(heading, text)
      section.append(block)
      return block
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
    const controls = this.everyControl<HTMLButtonElement | HTMLInputElement>('button, input')
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
      if (this.discard.open) this.discard.close()
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
