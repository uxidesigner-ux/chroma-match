import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { StudioCharacter } from './character-studio/character.ts'
import type { AnimeSpec } from './anime-spec.ts'
import { fitFullBody } from './anime-camera.ts'
import { SEED_CREDIT } from './studio-library.ts'

/** One renderer per editor (or serial portrait queue), never one per list row. */
export class AnimeRenderer {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(30, 1, 0.01, 30)
  private character: StudioCharacter | null = null
  private abort = new AbortController()
  private disposed = false
  private observer: ResizeObserver | undefined
  private frame = 0
  private lastTime = 0
  private reduced = matchMedia('(prefers-reduced-motion: reduce)')
  private angle = 0
  private portraitMode = false
  private height = 1.6
  private focusY = 1.4
  /** What fraction of the canvas foot the sheet hides. */
  private covered = 0
  private bounds = new Box3()
  private silhouette = ''
  private yawStart: number | null = null
  private width = 256
  private canvasHeight = 256
  private paused = false
  private onContextLoss: ((event: Event) => void) | undefined
  private onMotionChange = (): void => {
    if (this.reduced.matches) { this.character?.tick(0, false); this.draw() }
  }

  constructor(private canvas: HTMLCanvasElement, private transparent = false) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75))
    this.scene.add(new AmbientLight(0xffffff, 1.5))
    const light = new DirectionalLight(0xfff5eb, 2.0)
    light.position.set(-1, 2, 3)
    this.scene.add(light)
    const fill = new DirectionalLight(0xc9e4ff, 0.8)
    fill.position.set(2, 1, -2)
    this.scene.add(fill)
    this.reduced.addEventListener('change', this.onMotionChange)
  }

  async load(spec: AnimeSpec, onProgress?: (ratio: number) => void): Promise<void> {
    const timeout = setTimeout(() => this.abort.abort(), 25000)
    try {
      const character = await StudioCharacter.load(this.abort.signal, onProgress)
      if (this.disposed) {
        character.dispose()
        return
      }
      this.character = character
      this.scene.add(character.vrm.scene)
      character.apply(spec)
      const head = character.vrm.humanoid.getNormalizedBoneNode('head')
      this.focusY = head?.getWorldPosition(new Vector3()).y ?? this.height * 0.88
      this.apply(spec)
    } finally {
      clearTimeout(timeout)
    }
  }

  apply(spec: AnimeSpec): void {
    if (this.disposed) return
    this.scene.background = this.transparent ? null : new Color(`#${spec.backdrop}`)
    this.character?.apply(spec)
    const silhouette = `${spec.hair}:${Number(spec.pack)}${Number(spec.arms)}${Number(spec.visor)}`
    if (this.character && this.silhouette !== silhouette) {
      this.silhouette = silhouette
      this.bounds.copy(this.measureBounds())
      this.height = this.bounds.max.y - this.bounds.min.y
    }
    this.draw()
  }

  private measureBounds(): Box3 {
    const bounds = new Box3()
    this.character?.vrm.scene.updateMatrixWorld(true)
    this.character?.vrm.scene.traverseVisible(node => {
      if (node instanceof Mesh) bounds.expandByObject(node, true)
    })
    return bounds
  }

  attach(stage: HTMLElement, onLost: () => void): void {
    this.observer = new ResizeObserver(() => this.resize(stage.clientWidth, stage.clientHeight))
    this.observer.observe(stage)
    this.resize(stage.clientWidth, stage.clientHeight)
    this.onContextLoss = (event) => {
      event.preventDefault()
      this.stop()
      onLost()
    }
    this.canvas.addEventListener('webglcontextlost', this.onContextLoss)
    this.canvas.addEventListener('pointerdown', this.pointerDown)
    this.canvas.addEventListener('pointermove', this.pointerMove)
    this.canvas.addEventListener('pointerup', this.pointerUp)
    this.canvas.addEventListener('pointercancel', this.pointerUp)
    this.canvas.addEventListener('pointerleave', this.pointerLeave)
    this.canvas.addEventListener('keydown', this.keyDown)
    this.start()
  }

  private pointerDown = (e: PointerEvent): void => {
    this.yawStart = e.clientX
    this.canvas.setPointerCapture(e.pointerId)
  }
  private pointerMove = (e: PointerEvent): void => {
    if (this.yawStart === null) {
      if (e.pointerType === 'mouse' && !this.reduced.matches && !this.paused) {
        const rect = this.canvas.getBoundingClientRect()
        this.character?.look((e.clientX - rect.left) / rect.width * 2 - 1, (e.clientY - rect.top) / rect.height * 2 - 1)
      }
      return
    }
    this.character?.look(0, 0)
    this.angle += (e.clientX - this.yawStart) * 0.012
    this.yawStart = e.clientX
    this.draw()
  }
  private pointerUp = (): void => {
    this.yawStart = null
  }
  private pointerLeave = (): void => { this.character?.look(0, 0) }
  private keyDown = (e: KeyboardEvent): void => {
    if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(e.key)) return
    e.preventDefault()
    if (e.key === 'Home') this.angle = 0
    else this.angle += e.key === 'ArrowLeft' ? -0.2 : 0.2
    this.draw()
  }

  rotate(direction: number): void {
    this.angle += direction * 0.3
    this.draw()
  }
  gesture(kind: 'wave' | 'cheer' | 'pose'): void {
    this.character?.perform(kind)
    // Explicit requests become a still pose when the player reduces motion.
    if (this.reduced.matches || this.paused) {
      this.character?.tick(.75, true)
      this.bounds.union(this.measureBounds())
      this.draw()
    }
  }
  pause(value: boolean): void {
    this.paused = value
    this.character?.tick(0, false)
    this.draw()
  }
  framePortrait(portrait: boolean): void {
    this.portraitMode = portrait
    this.angle = 0
    this.draw()
  }

  faceDirection(yaw: number): void {
    this.angle = yaw
    this.draw()
  }

  private resize(width: number, height: number): void {
    if (this.disposed) return
    this.width = Math.max(1, width)
    this.canvasHeight = Math.max(1, height)
    this.renderer.setSize(this.width, this.canvasHeight, false)
    this.draw()
  }

  /**
   * How much of the canvas's foot is hidden behind something else, 0 to 1.
   *
   * The editing sheet floats over the preview rather than sitting beside it, so
   * the canvas runs the full height of the screen and its lower part is covered.
   * Shrinking the canvas to match would make the sheet a panel again, so the
   * camera is told instead: it renders as though its frame were taller than the
   * canvas and shows only the top of that frame, which lifts the character into
   * the band that is actually visible.
   */
  cover(fraction: number): void {
    const next = Math.max(0, Math.min(0.7, fraction))
    if (Math.abs(next - this.covered) < 0.004) return
    this.covered = next
    this.draw()
  }

  private draw(): void {
    if (this.disposed) return
    /*
     * The frame keeps its size; only its middle moves.
     *
     * Shifting the frustum down by half the hidden fraction lifts whatever is
     * centred on the camera's target into the middle of the band still showing,
     * and standing back by the reciprocal of what is left makes it fit there.
     * An earlier attempt rendered into a taller frame instead, which narrowed
     * the field by the same factor it stood back by, and the two cancelled: the
     * character moved and never shrank.
     */
    const aspect = this.width / this.canvasHeight
    this.camera.aspect = aspect
    if (this.covered > 0.004)
      this.camera.setViewOffset(
        this.width,
        this.canvasHeight,
        0,
        (this.canvasHeight * this.covered) / 2,
        this.width,
        this.canvasHeight,
      )
    else this.camera.clearViewOffset()
    this.camera.updateProjectionMatrix()
    const back = 1 / (1 - this.covered)
    if (!this.portraitMode && !this.bounds.isEmpty()) {
      const { target, distance } = fitFullBody(
        { min: this.bounds.min.toArray(), max: this.bounds.max.toArray() },
        aspect,
        this.angle,
      )
      const reach = distance * back
      this.camera.position.set(
        target[0] + Math.sin(this.angle) * reach,
        target[1],
        target[2] + Math.cos(this.angle) * reach,
      )
      this.camera.lookAt(...target)
      this.renderer.render(this.scene, this.camera)
      return
    }
    const visibleHeight = this.height * 0.42
    const distance =
      (visibleHeight / (2 * Math.tan(Math.PI / 12))) * Math.max(1, 0.65 / aspect) * back
    const y = this.portraitMode ? this.focusY * 1.02 : this.height * 0.52
    this.camera.position.set(Math.sin(this.angle) * distance, y, Math.cos(this.angle) * distance)
    this.camera.lookAt(0, y, 0)
    this.renderer.render(this.scene, this.camera)
  }

  private start(): void {
    const tick = (time: number): void => {
      if (this.disposed) return
      const delta = Math.min(0.05, Math.max(0, (time - this.lastTime) / 1000))
      if (!document.hidden && time - this.lastTime >= 32) {
        this.lastTime = time
        if (!this.reduced.matches && !this.paused) {
          this.character?.tick(delta, true)
          this.draw()
        }
      }
      this.frame = requestAnimationFrame(tick)
    }
    this.frame = requestAnimationFrame(tick)
  }

  private stop(): void {
    cancelAnimationFrame(this.frame)
  }

  /** Capture the same character, front-facing, with open eyes and fixed framing. */
  portrait(): string {
    const previous = {
      angle: this.angle,
      mode: this.portraitMode,
      width: this.width,
      height: this.canvasHeight,
    }
    this.angle = 0
    this.portraitMode = true
    this.character?.tick(0, false)
    this.resize(256, 256)
    const output = document.createElement('canvas')
    output.width = output.height = 256
    output.getContext('2d')!.drawImage(this.canvas, 0, 0, 256, 256)
    const data = output.toDataURL('image/png')
    this.angle = previous.angle
    this.portraitMode = previous.mode
    this.resize(previous.width, previous.height)
    return data
  }

  exportModel(spec: AnimeSpec): ArrayBuffer {
    if (!this.character || this.disposed) throw new Error('Character unavailable')
    return this.character.export(spec)
  }

  /** Bounded screenshot/turntable export. Always restore the interactive camera. */
  screenshot(kind: 'face' | 'body' | 'sheet', transparent: boolean): string {
    if (!this.character || this.disposed) throw new Error('Character unavailable')
    const previous = { angle: this.angle, mode: this.portraitMode, width: this.width,
      height: this.canvasHeight, background: this.scene.background, ratio: this.renderer.getPixelRatio(),
      bounds: this.bounds.clone() }
    const width = 512, height = kind === 'face' ? 512 : 768
    const output = document.createElement('canvas')
    output.width = kind === 'sheet' ? width * 2 : width
    output.height = (kind === 'sheet' ? height * 2 : height) + 36
    const ctx = output.getContext('2d')!
    try {
      this.renderer.setPixelRatio(1)
      if (transparent) this.scene.background = null
      this.portraitMode = kind === 'face'
      // Paused/reduced-motion previews already have a still pose. Re-ticking
      // constraints here would change that pose during a supposedly still capture.
      if (!this.reduced.matches && !this.paused) this.character.tick(0, false)
      // A gesture can extend above/beyond the idle silhouette (e.g. raised hands).
      // Measure once per capture, not every animation frame, and fit all four views.
      if (kind !== 'face') this.bounds.copy(this.measureBounds())
      for (let index = 0; index < (kind === 'sheet' ? 4 : 1); index++) {
        this.angle = kind === 'sheet' ? index * Math.PI / 2 : previous.angle
        this.resize(width, height)
        ctx.drawImage(this.canvas, (index % 2) * width, Math.floor(index / 2) * height, width, height)
      }
      ctx.fillStyle = '#17202e'
      ctx.fillRect(0, output.height - 36, output.width, 36)
      ctx.fillStyle = '#ffffff'
      ctx.font = '10px sans-serif'
      ctx.fillText(SEED_CREDIT, 8, output.height - 14, output.width - 16)
      return output.toDataURL('image/png')
    } finally {
      this.angle = previous.angle
      this.portraitMode = previous.mode
      this.scene.background = previous.background
      this.bounds.copy(previous.bounds)
      this.renderer.setPixelRatio(previous.ratio)
      this.resize(previous.width, previous.height)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.abort.abort()
    this.stop()
    this.observer?.disconnect()
    this.reduced.removeEventListener('change', this.onMotionChange)
    if (this.onContextLoss) this.canvas.removeEventListener('webglcontextlost', this.onContextLoss)
    this.canvas.removeEventListener('pointerdown', this.pointerDown)
    this.canvas.removeEventListener('pointermove', this.pointerMove)
    this.canvas.removeEventListener('pointerup', this.pointerUp)
    this.canvas.removeEventListener('pointercancel', this.pointerUp)
    this.canvas.removeEventListener('pointerleave', this.pointerLeave)
    this.canvas.removeEventListener('keydown', this.keyDown)
    this.character?.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }
}
