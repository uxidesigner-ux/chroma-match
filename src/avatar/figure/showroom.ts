/**
 * A live figure: one scene, one model, kept alive.
 *
 * This is deliberately not an image generator. Turning the figure or changing
 * a colour must not rebuild anything — it updates a camera or a material and
 * redraws. The previous pass built every geometry on every call, which cost
 * most of a second a frame and made rotation impossible; it also opened a
 * WebGL context per canvas, and a browser keeps about sixteen.
 *
 * Still images come off the same live scene: `capture` draws it once into a
 * 2D canvas at whatever size the caller wants, so a thumbnail costs a draw
 * rather than a load.
 */

import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  type Object3D,
  VSMShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/** Which material a part uses, and so which colour control moves it. */
export type Slot = 'skin' | 'hair' | 'cloth' | 'eye'

/** The eye colour is fixed rather than a look, so it needs somewhere to live. */
const EYE_COLOUR = '#2B2220'

/**
 * Which authored material names the showroom is allowed to take over.
 *
 * The rule, so that assets made later do not quietly lose their surfacing: the
 * showroom substitutes its own material only where the GLB's material is named
 * as one of these slots. A part that arrives with any other material — an
 * authored one with maps on it, say — keeps what it was exported with, and is
 * simply not tintable from the colour controls. Anything that wants to be
 * recoloured has to opt in by being named.
 */
const OWNED_MATERIALS = new Set(['skin', 'hair', 'cloth', 'eye'])

const SLOT_OF: { test: RegExp; slot: Slot }[] = [
  { test: /^eye/, slot: 'eye' },
  { test: /^(hair|scalp|crown|band|lock|sweep|front|side|back)/, slot: 'hair' },
  { test: /^top/, slot: 'cloth' },
  { test: /^(head|body|ear)/, slot: 'skin' },
]

function slotFor(name: string): Slot {
  for (const entry of SLOT_OF) if (entry.test.test(name)) return entry.slot
  return 'skin'
}

export interface Look {
  skin: string
  hair: string
  cloth: string
  backdrop: string
}

export interface ShowroomOptions {
  url: string
  look: Look
  /** Rendering resolution of the live canvas. */
  width: number
  height: number
}

export class Showroom {
  readonly renderer: WebGLRenderer
  readonly scene: Scene
  readonly camera: PerspectiveCamera
  private readonly figure = new Group()
  private readonly materials = new Map<Slot, MeshPhysicalMaterial>()
  private readonly parts = new Map<string, Object3D>()
  /** Authored materials the showroom left alone, for reporting. */
  readonly kept = new Set<string>()
  private yaw = 0
  private pitch = 0
  private distance = 6
  private lookTarget = new Vector3(0, -0.35, 0)
  private target: WebGLRenderTarget | null = null
  private buffer: Uint8Array | null = null
  private scratch: HTMLCanvasElement | null = null

  private look: Look

  constructor(private readonly options: ShowroomOptions) {
    this.look = { ...options.look }
    // preserveDrawingBuffer so a still can be copied out of the live canvas.
    // Without it the browser has to reproduce the frame for every drawImage,
    // and a 74px thumbnail measured at 760ms against 1.1ms for a full redraw.
    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    })
    this.renderer.setSize(options.width, options.height, false)
    this.renderer.setPixelRatio(1)
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.shadowMap.enabled = true
    // PCFSoftShadowMap was removed in three r186. VSM is the one that still
    // takes a blur radius, and a blurred shadow map is the whole reason this
    // moved off the ray marcher.
    this.renderer.shadowMap.type = VSMShadowMap
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05

    this.scene = new Scene()
    this.scene.background = new Color(options.look.backdrop)
    const pmrem = new PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture
    this.scene.environmentIntensity = 0.18
    pmrem.dispose()

    this.camera = new PerspectiveCamera(24, options.width / options.height, 0.4, 60)

    const key = new DirectionalLight(0xfff3ea, 2.5)
    key.position.set(-3.4, 4.6, 6.0)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.radius = 5
    key.shadow.blurSamples = 16
    key.shadow.bias = -0.0008
    const shadow = key.shadow.camera
    shadow.left = -5
    shadow.right = 5
    shadow.top = 5
    shadow.bottom = -5
    shadow.near = 0.5
    shadow.far = 24
    const fill = new DirectionalLight(0xd9e4ff, 0.6)
    fill.position.set(4.5, 0.8, 3.2)
    const rim = new DirectionalLight(0xffffff, 0.8)
    rim.position.set(1.2, 2.0, -5.0)
    this.scene.add(key, fill, rim, this.figure)

    this.materials.set('skin', new MeshPhysicalMaterial({
      roughness: 0.74, clearcoat: 0.14, clearcoatRoughness: 0.66,
      sheen: 0.45, sheenColor: new Color('#FF9E86'), sheenRoughness: 0.85,
    }))
    this.materials.set('hair', new MeshPhysicalMaterial({ roughness: 0.56, clearcoat: 0.0 }))
    this.materials.set('cloth', new MeshPhysicalMaterial({ roughness: 0.94, sheen: 0.30, sheenRoughness: 0.80 }))
    this.materials.set('eye', new MeshPhysicalMaterial({
      color: new Color(EYE_COLOUR), roughness: 0.85, clearcoat: 0.0, clearcoatRoughness: 1.0,
      metalness: 0.0, envMapIntensity: 0.0,
    }))
    this.recolour(options.look)
  }

  /** Load the parts once. Everything after this is a camera or a material. */
  async load(): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(this.options.url)
    gltf.scene.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const authored = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      const name = authored?.name ?? ''
      if (OWNED_MATERIALS.has(name)) {
        mesh.material = this.materials.get(slotFor(mesh.name))!
      } else {
        this.kept.add(name || mesh.name)
      }
    })
    for (const child of [...gltf.scene.children]) {
      this.parts.set(child.name, child)
      this.figure.add(child)
    }
    this.frameOn(new Vector3(0, -0.35, 0), 2.6)
  }

  /**
   * Load a second GLB into the same scene, keeping its authored materials.
   *
   * Used to lay the design's flow curves over the figure. They arrive with
   * materials the showroom does not own, so the rule above leaves them alone
   * and they keep the colours they were exported with.
   */
  async overlay(url: string): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(url)
    gltf.scene.traverse((object) => {
      const mesh = object as Mesh
      if (mesh.isMesh) {
        mesh.castShadow = false
        mesh.receiveShadow = false
      }
    })
    for (const child of [...gltf.scene.children]) {
      this.parts.set(child.name, child)
      this.figure.add(child)
    }
  }

  /**
   * What each wardrobe category needs the camera to show.
   *
   * Every item in a grid of identical small full-body thumbnails looks the
   * same, because the part being chosen is a dozen pixels of it. A category
   * frames the region its parts actually occupy: choosing hair shows the head,
   * choosing shoes shows the feet.
   *
   * Heights and centres are in head units — the skull is 2.0 tall, centred on
   * the origin — so they hold whatever the figure turns out to be.
   */
  static readonly FOCUS: Record<string, { centre: [number, number, number]; height: number }> = {
    face: { centre: [0, -0.15, 0], height: 2.5 },
    hair: { centre: [0, -0.55, 0], height: 4.0 },
    top: { centre: [0, -2.35, 0], height: 3.4 },
    outer: { centre: [0, -2.35, 0], height: 3.8 },
    bottom: { centre: [0, -4.60, 0], height: 3.4 },
    shoes: { centre: [0, -6.10, 0], height: 1.8 },
    accessory: { centre: [0, -0.30, 0], height: 2.8 },
    full: { centre: [0, -3.20, 0], height: 8.4 },
  }

  /**
   * Frame a category, keeping the direction the viewer is looking from.
   *
   * Turning and zooming are the viewer's; the category only decides what is in
   * shot. Resetting the angle every time a category changed would throw away
   * the three-quarter view someone had just turned to in order to judge a
   * collar.
   */
  focus(category: string): void {
    const f = Showroom.FOCUS[category] ?? Showroom.FOCUS.full!
    this.frameOn(new Vector3(...f.centre), f.height)
  }

  /**
   * Fit the camera to a height in model units, centred on a point.
   *
   * Only the target and the distance move; the yaw and pitch the viewer set are
   * kept, which is what makes changing a part or a category leave them looking
   * from where they were.
   */
  frameOn(target: Vector3, heightUnits: number): void {
    this.lookTarget.copy(target)
    this.distance = heightUnits / (2 * Math.tan((this.camera.fov * Math.PI) / 360))
    this.place()
  }

  /** World-space centre of a named part, or null if it is not on the figure. */
  partCentre(name: string): Vector3 | null {
    const part = this.parts.get(name)
    if (!part) return null
    const box = new Box3().setFromObject(part)
    if (box.isEmpty()) return null
    return box.getCenter(new Vector3())
  }

  /**
   * The two eyes, from the loaded mesh, not from a remembered constant.
   *
   * Framing a comparison against a measured crop has to use where this model
   * actually put the eyes. A number copied out of an older script is how the
   * last review ended up matching the wrong face size.
   */
  eyeCentres(): { left: Vector3; right: Vector3 } | null {
    const left = this.partCentre('eye_l')
    const right = this.partCentre('eye_r')
    if (!left || !right) return null
    return { left, right }
  }

  /** The whole figure, whatever it turns out to be. */
  frameAll(margin = 1.08): void {
    const box = new Box3().setFromObject(this.figure)
    const size = new Vector3()
    const centre = new Vector3()
    box.getSize(size)
    box.getCenter(centre)
    this.frameOn(centre, Math.max(size.y, size.x / this.camera.aspect) * margin)
  }

  /** Turn the figure. No geometry is touched. */
  orbit(yaw: number, pitch: number): void {
    this.yaw = yaw
    this.pitch = Math.max(-0.9, Math.min(0.9, pitch))
    this.place()
  }

  private place(): void {
    const { yaw, pitch, distance, lookTarget: target } = this
    this.camera.position.set(
      target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
      target.y + Math.sin(pitch) * distance,
      target.z + Math.cos(yaw) * Math.cos(pitch) * distance,
    )
    this.camera.lookAt(target)
  }

  /** Change colours. Materials are shared, so this is four assignments. */
  recolour(look: Partial<Look>): void {
    this.look = { ...this.look, ...look }
    if (look.skin) this.materials.get('skin')!.color.set(look.skin)
    if (look.hair) this.materials.get('hair')!.color.set(look.hair)
    if (look.cloth) {
      const cloth = this.materials.get('cloth')!
      cloth.color.set(look.cloth)
      // The sheen is tinted towards the cloth's own colour: a white sheen over
      // a dark colour lifts the whole garment to grey.
      cloth.sheenColor.set(look.cloth)
      cloth.sheenColor.lerp(new Color('#FFFFFF'), 0.30)
    }
    if (look.backdrop) (this.scene.background as Color).set(look.backdrop)
  }

  /**
   * Put every part in the same neutral clay.
   *
   * Form first, colour second. A dark hair colour hides a bad join and a warm
   * skin tone flatters a shape that has nothing in it; one grey across the
   * whole figure shows where the surfaces actually are.
   */
  setNeutral(on: boolean): void {
    for (const [slot, material] of this.materials) {
      if (on) {
        material.color.set('#B9B4AE')
        material.sheen = 0
        material.clearcoat = slot === 'eye' ? 0.5 : 0.05
        material.roughness = 0.62
      } else {
        this.restore(slot, material)
      }
    }
  }

  private restore(slot: Slot, material: MeshPhysicalMaterial): void {
    if (slot === 'skin') {
      material.roughness = 0.74
      material.clearcoat = 0.14
      material.clearcoatRoughness = 0.66
      material.sheen = 0.45
      material.sheenColor.set('#FF9E86')
      material.sheenRoughness = 0.85
    } else if (slot === 'hair') {
      material.roughness = 0.56
      material.clearcoat = 0
      material.sheen = 0
    } else if (slot === 'cloth') {
      material.roughness = 0.94
      material.clearcoat = 0
      material.sheen = 0.30
      material.sheenRoughness = 0.80
    } else {
      material.roughness = 0.85
      material.clearcoat = 0.0
      material.clearcoatRoughness = 1.0
      material.sheen = 0
      material.metalness = 0
      material.envMapIntensity = 0
      // The eye is not part of the look, so recolour() will not put it back.
      material.color.set(EYE_COLOUR)
    }
    this.recolour(this.look)
  }

  /** Show or hide a part by name. This is what a wardrobe swap is. */
  setVisible(name: string, visible: boolean): void {
    const part = this.parts.get(name)
    if (part) part.visible = visible
  }

  partNames(): string[] {
    return [...this.parts.keys()]
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  /** A still, off the live scene, at whatever size the caller wants. */
  capture(canvas: HTMLCanvasElement, width: number, height: number): void {
    // Rendered into an offscreen target and read back as pixels, not copied
    // out of the live canvas with drawImage.
    //
    // Measured, because the first two guesses were both wrong. Resizing the
    // renderer per capture is not the cost and neither is preserveDrawingBuffer:
    // a render followed by a finish is 0.7ms, a one-pixel readPixels is 0.4ms,
    // and a single drawImage from the WebGL canvas into a 2D one is 3797ms.
    // Reading pixels is cheap; asking the browser to hand over the canvas as an
    // image is not. That figure is from a software rasteriser and may not hold
    // on a real GPU, but this path is the cheaper one either way.
    const scale = 2
    const w = width * scale
    const h = height * scale
    if (!this.target || this.target.width !== w || this.target.height !== h) {
      this.target?.dispose()
      this.target = new WebGLRenderTarget(w, h, { colorSpace: SRGBColorSpace })
      this.buffer = new Uint8Array(w * h * 4)
    }
    const aspect = this.camera.aspect
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setRenderTarget(this.target)
    this.renderer.render(this.scene, this.camera)
    this.renderer.readRenderTargetPixels(this.target, 0, 0, w, h, this.buffer!)
    this.renderer.setRenderTarget(null)
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()

    const full = new ImageData(w, h)
    // readPixels hands back rows bottom to top.
    for (let y = 0; y < h; y++) {
      const from = (h - 1 - y) * w * 4
      full.data.set(this.buffer!.subarray(from, from + w * 4), y * w * 4)
    }
    const scratch = this.scratch ?? (this.scratch = document.createElement('canvas'))
    scratch.width = w
    scratch.height = h
    scratch.getContext('2d')?.putImageData(full, 0, 0)
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(scratch, 0, 0, width, height)
    }
  }

  dispose(): void {
    this.figure.traverse((object) => {
      const mesh = object as Mesh
      if (mesh.isMesh) mesh.geometry.dispose()
    })
    for (const material of this.materials.values()) material.dispose()
    this.target?.dispose()
    this.renderer.dispose()
  }
}
