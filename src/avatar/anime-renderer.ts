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
  private bounds = new Box3()
  private silhouette = ''
  private yawStart: number | null = null
  private width = 256
  private canvasHeight = 256
  private onContextLoss: ((event: Event) => void) | undefined

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
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
  }

  async load(spec: AnimeSpec): Promise<void> {
    const timeout = setTimeout(() => this.abort.abort(), 25000)
    try {
      const character = await StudioCharacter.load(this.abort.signal)
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
    this.scene.background = new Color(`#${spec.backdrop}`)
    this.character?.apply(spec)
    const silhouette = `${spec.hair}:${spec.equipment}`
    if (this.character && this.silhouette !== silhouette) {
      this.silhouette = silhouette
      this.bounds.makeEmpty()
      this.character.vrm.scene.updateMatrixWorld(true)
      this.character.vrm.scene.traverseVisible((node) => {
        if (node instanceof Mesh) this.bounds.expandByObject(node, true)
      })
      this.height = this.bounds.max.y - this.bounds.min.y
    }
    this.draw()
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
    this.canvas.addEventListener('keydown', this.keyDown)
    this.start()
  }

  private pointerDown = (e: PointerEvent): void => {
    this.yawStart = e.clientX
    this.canvas.setPointerCapture(e.pointerId)
  }
  private pointerMove = (e: PointerEvent): void => {
    if (this.yawStart === null) return
    this.angle += (e.clientX - this.yawStart) * 0.012
    this.yawStart = e.clientX
    this.draw()
  }
  private pointerUp = (): void => {
    this.yawStart = null
  }
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

  private draw(): void {
    if (this.disposed) return
    this.camera.aspect = this.width / this.canvasHeight
    this.camera.updateProjectionMatrix()
    if (!this.portraitMode && !this.bounds.isEmpty()) {
      const { target, distance } = fitFullBody(
        { min: this.bounds.min.toArray(), max: this.bounds.max.toArray() },
        this.camera.aspect,
        this.angle,
      )
      this.camera.position.set(
        target[0] + Math.sin(this.angle) * distance,
        target[1],
        target[2] + Math.cos(this.angle) * distance,
      )
      this.camera.lookAt(...target)
      this.renderer.render(this.scene, this.camera)
      return
    }
    const visibleHeight = this.height * 0.42
    const distance =
      (visibleHeight / (2 * Math.tan(Math.PI / 12))) * Math.max(1, 0.65 / this.camera.aspect)
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
        if (!this.reduced.matches) {
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

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.abort.abort()
    this.stop()
    this.observer?.disconnect()
    if (this.onContextLoss) this.canvas.removeEventListener('webglcontextlost', this.onContextLoss)
    this.canvas.removeEventListener('pointerdown', this.pointerDown)
    this.canvas.removeEventListener('pointermove', this.pointerMove)
    this.canvas.removeEventListener('pointerup', this.pointerUp)
    this.canvas.removeEventListener('pointercancel', this.pointerUp)
    this.canvas.removeEventListener('keydown', this.keyDown)
    this.character?.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }
}
