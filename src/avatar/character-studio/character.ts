/**
 * Focused adaptation of CharacterStudio's load-utils.loadVRM and
 * CharacterManager._VRMBaseSetup, _modelBaseSetup and _disposeTrait.
 * Upstream: M3-org/CharacterStudio@293182b, MIT / Atlas Foundation (2022).
 * Preserves VRM/MToon loading, per-material palette changes and disposal;
 * replaces wallet/manifest globals with a fixed, versioned licensed catalogue.
 */
import { CanvasTexture, Color, Mesh, SRGBColorSpace, Vector3 } from 'three'
import type { Object3D } from 'three'
import type { Material, Texture } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import type { VRM, MToonMaterial } from '@pixiv/three-vrm'
import type { AnimeSpec, FigureStep } from '../anime-spec.ts'
import { EXPRESSIONS } from '../anime-spec.ts'
import { exportSeed } from '../studio-export.ts'
import { BlinkManager } from './blink.ts'

type Toon = Material &
  Partial<Pick<MToonMaterial, 'color' | 'shadeColorFactor' | 'map' | 'shadeMultiplyTexture'>>


/**
 * How wide a figure axis draws, as a multiplier on the bone's own width.
 *
 * Step 3 is exactly 1, so a character saved before the studio could change a
 * figure comes back the shape it was. The range is deliberately modest — this
 * is one body reproportioned, and a bone scaled much past a quarter either way
 * starts to tear the clothing mesh away from the skin under it.
 */
function figureScale(step: FigureStep, reach: number): number {
  return 1 + ((step - 3) / 3) * reach
}

export class StudioCharacter {
  readonly vrm: VRM
  private blink = new BlinkManager()
  private materials = new Map<string, Toon[]>()
  private tails: Mesh[] = []
  private pack: Mesh[] = []
  private arms: Mesh[] = []
  private visor: Mesh[] = []
  private time = 0
  private gesture: 'wave' | 'cheer' | 'pose' | null = null
  private gestureTime = 0
  private expression: AnimeSpec['expression'] = 'neutral'
  private gaze = { x: 0, y: 0 }
  private gazeTarget = { x: 0, y: 0 }
  /*
   * The shoulders move by translation rather than scale, so their own resting
   * offsets have to be kept: applying a figure is idempotent only if each pass
   * starts from the model's numbers instead of the previous pass's.
   */
  private restShoulder: { node: Object3D; rest: Vector3; lengthwise: boolean }[] = []
  /** Seed-san's skin is shaded warm, not grey; a tint multiplies that rather than replacing it. */
  private restSkinShade = new Map<Toon, [number, number, number]>()

  private constructor(vrm: VRM, private source: ArrayBuffer) {
    this.vrm = vrm
    VRMUtils.rotateVRM0(vrm)
    vrm.scene.traverse((node) => {
      node.frustumCulled = false
      if (!(node instanceof Mesh)) return
      const mats = (Array.isArray(node.material) ? node.material : [node.material]) as Toon[]
      const names = mats.map((mat) => mat.name)
      if (node.name.startsWith('hair_tail')) this.tails.push(node)
      else if (
        node.name.startsWith('robo_arm') ||
        names.some((name) => name.startsWith('armgear_') || name === 'arm_mat' || name === 'arm_plastic')
      )
        this.arms.push(node)
      else if (names.some((name) => name.startsWith('backpack_'))) this.pack.push(node)
      else if (names.some((name) => /^(robo_face|glass|anim_logo)$/.test(name))) this.visor.push(node)
      else if (names.includes('green_emit') && !names.includes('body_bake')) this.visor.push(node)
      for (const material of mats) {
        const list = this.materials.get(material.name) ?? []
        if (!list.includes(material)) list.push(material)
        this.materials.set(material.name, list)
      }
    })
    /*
     * Shoulder width is two offsets, not one. The shoulder joint sits out to
     * the side of the spine, and the collarbone under it runs from there to
     * the arm — in this rig along its own axis rather than along X, so it is
     * lengthened as a whole vector while the joint moves sideways only.
     */
    for (const [name, lengthwise] of [
      ['leftShoulder', false],
      ['rightShoulder', false],
      ['leftUpperArm', true],
      ['rightUpperArm', true],
    ] as const) {
      const node = vrm.humanoid.getRawBoneNode(name)
      if (node) this.restShoulder.push({ node, rest: node.position.clone(), lengthwise })
    }
    for (const mat of this.materials.get('body_bake') ?? [])
      this.restSkinShade.set(mat, (mat.shadeColorFactor?.toArray() ?? [1, 1, 1]) as [number, number, number])
    // Preserve texture shading while removing the original green hue so an
    // orange swatch really produces orange. These generated maps are owned.
    const textures = new Map<Texture, CanvasTexture>()
    for (const name of ['hair', 'eye', 'huku_bake'])
      for (const mat of this.materials.get(name) ?? []) {
        for (const key of ['map', 'shadeMultiplyTexture'] as const) {
          const source = mat[key]
          if (!source) continue
          let gray = textures.get(source)
          if (!gray) {
            const picture = source.image as HTMLImageElement
            const canvas = document.createElement('canvas')
            canvas.width = picture.width
            canvas.height = picture.height
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            if (!ctx) throw new Error('Canvas unavailable')
            ctx.drawImage(picture, 0, 0)
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
            for (let i = 0; i < data.data.length; i += 4) {
              const light = Math.max(data.data[i]!, data.data[i + 1]!, data.data[i + 2]!)
              const value = name === 'hair' ? 150 + light * 0.41 : light
              data.data[i] = data.data[i + 1] = data.data[i + 2] = value
            }
            ctx.putImageData(data, 0, 0)
            gray = new CanvasTexture(canvas)
            gray.flipY = source.flipY
            gray.colorSpace = SRGBColorSpace
            gray.wrapS = source.wrapS
            gray.wrapT = source.wrapT
            gray.offset.copy(source.offset)
            gray.repeat.copy(source.repeat)
            gray.rotation = source.rotation
            textures.set(source, gray)
          }
          mat[key] = gray
          mat.needsUpdate = true
        }
      }
    // Original maps are no longer used by these three material groups.
    // deepDispose owns every remaining texture; released sources are disposed here.
    for (const texture of textures.keys()) texture.dispose()
  }

  static async load(signal: AbortSignal, onProgress?: (ratio: number) => void): Promise<StudioCharacter> {
    const url = new URL('avatars/seed-v1/seed-san.vrm', document.baseURI)
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error(`Model: HTTP ${response.status}`)
    const bytes = await readBody(response, (ratio) => onProgress?.(ratio * 0.9), signal)
    onProgress?.(0.92)
    signal.throwIfAborted()
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))
    const gltf = await loader.parseAsync(bytes, url.href.slice(0, url.href.lastIndexOf('/') + 1))
    onProgress?.(1)
    const vrm = gltf.userData.vrm as VRM | undefined
    if (!vrm) {
      VRMUtils.deepDispose(gltf.scene)
      throw new Error('Invalid VRM')
    }
    if (signal.aborted) {
      VRMUtils.deepDispose(vrm.scene)
      signal.throwIfAborted()
    }
    try {
      return new StudioCharacter(vrm, bytes)
    } catch (error) {
      VRMUtils.deepDispose(vrm.scene)
      throw error
    }
  }

  apply(spec: AnimeSpec): void {
    this.expression = spec.expression
    for (const [name, hex] of [
      ['hair', spec.hairColour],
      ['eye', spec.eyeColour],
      ['huku_bake', spec.outfitColour],
    ]) {
      for (const mat of this.materials.get(name!) ?? []) {
        mat.color?.set(`#${hex}`)
        mat.shadeColorFactor?.copy(new Color(`#${hex}`).multiplyScalar(0.8))
      }
    }
    /*
     * Skin is a tint, not a repaint. The texture keeps its baked detail and the
     * material keeps the warm falloff it ships with, both multiplied by the
     * chosen colour — so white leaves the model exactly as its author drew it,
     * which is what every appearance saved before this existed asks for.
     */
    const skin = new Color(`#${/^[0-9a-f]{6}$/i.test(spec.skinColour) ? spec.skinColour : 'FFFFFF'}`)
    for (const [mat, rest] of this.restSkinShade) {
      mat.color?.copy(skin)
      mat.shadeColorFactor?.set(rest[0] * skin.r, rest[1] * skin.g, rest[2] * skin.b)
    }
    this.tails.forEach((mesh) => {
      mesh.visible = spec.hair === 'tails'
    })
    this.pack.forEach((mesh) => {
      mesh.visible = spec.pack
    })
    this.arms.forEach((mesh) => {
      mesh.visible = spec.arms
    })
    this.visor.forEach((mesh) => {
      mesh.visible = spec.visor
    })
    for (const name of EXPRESSIONS)
      this.vrm.expressionManager?.setValue(name, spec.expression === name ? 0.7 : 0)
    this.shape(spec)
    this.tick(0, false)
  }

  /**
   * Reproportions the one body along five axes.
   *
   * The torso is a single chain — hips, spine, chest — and a bone's scale
   * carries down to everything under it, so widening the hips would widen the
   * legs and the whole upper body with them. Each bone therefore gets the
   * scale its own region needs divided by whatever it has already inherited,
   * and the parts that should not change shape — thighs, neck and head,
   * shoulders and arms, the backpack — are divided back out to one.
   *
   * Shoulder width is the exception: an arm scaled sideways bends wrongly, so
   * the shoulders are moved apart instead, along the one axis that separates
   * them. Head size is the other, and it is the only scale allowed to carry
   * down, because the hair and the eyes under it should grow with it.
   *
   * Only width, depth and the head move. Nothing here changes how tall the
   * character stands, which keeps the camera framing and every exported image
   * the size it was.
   */
  private shape(spec: AnimeSpec): void {
    const raw = (name: Parameters<typeof this.vrm.humanoid.getRawBoneNode>[0]) =>
      this.vrm.humanoid.getRawBoneNode(name)
    const hip = figureScale(spec.hip, 0.26)
    const waist = figureScale(spec.waist, 0.22)
    const bust = figureScale(spec.bust, 0.24)

    const flat = (node: Object3D | null | undefined, value: number) => node?.scale.set(value, 1, value)

    const hips = raw('hips')
    const spine = raw('spine')
    const chest = raw('chest')
    flat(hips, hip)
    flat(chest, bust / waist)
    // Whatever hangs off a widened bone is divided back out to its own shape,
    // by walking the children rather than naming them: the legs under the
    // hips, and the neck, both shoulders and the backpack under the chest.
    for (const child of hips?.children ?? []) flat(child, child === spine ? waist / hip : 1 / hip)
    for (const child of chest?.children ?? []) flat(child, 1 / bust)

    // The chest already carries the shoulders outward as it widens, so this is
    // the amount on top of that, which is what makes the two axes separable.
    // It reaches further than the scaled axes because moving a joint does not
    // pull the clothing mesh off the skin the way widening a bone does.
    const shoulder = figureScale(spec.shoulder, 0.45)
    for (const { node, rest, lengthwise } of this.restShoulder)
      if (lengthwise) node.position.copy(rest).multiplyScalar(shoulder)
      else node.position.set(rest.x * shoulder, rest.y, rest.z)
    raw('head')?.scale.setScalar(figureScale(spec.head, 0.2))
  }

  perform(gesture: 'wave' | 'cheer' | 'pose'): void {
    this.gesture = gesture
    this.gestureTime = 0
  }

  /** Bounded, canvas-local equivalent of CharacterStudio's LookAtManager. */
  look(x: number, y: number): void {
    this.gazeTarget = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }
  }

  export(spec: AnimeSpec): ArrayBuffer {
    const palettes = ['hair', 'eye', 'huku_bake'].map(name => {
      const material = this.materials.get(name)?.[0]
      if (!material?.color || !material.shadeColorFactor || !material.map) throw new Error('Missing material')
      const canvas = material.map.image as HTMLCanvasElement
      const png = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]!), c => c.charCodeAt(0))
      return { name, colour: material.color.toArray(), shade: material.shadeColorFactor.toArray(), png }
    })
    return exportSeed(this.source, spec, palettes)
  }

  tick(delta: number, motion: boolean): void {
    if (motion) this.time += delta
    const sway = motion ? Math.sin(this.time * 1.5) * 0.014 : 0
    if (motion && this.gesture) this.gestureTime += delta
    if (this.gestureTime > 2.8) this.gesture = null
    const envelope = motion && this.gesture
      ? Math.min(1, this.gestureTime / .3, (2.8 - this.gestureTime) / .5) : 0
    const humanoid = this.vrm.humanoid
    // Relax the T-pose using normalized humanoid bones, shared by future packs.
    humanoid.getNormalizedBoneNode('leftUpperArm')?.rotation.set(0, 0, -1.12)
    humanoid.getNormalizedBoneNode('rightUpperArm')?.rotation.set(0, 0, 1.12)
    humanoid.getNormalizedBoneNode('leftLowerArm')?.rotation.set(0, 0, -0.12)
    humanoid.getNormalizedBoneNode('rightLowerArm')?.rotation.set(0, 0, 0.12)
    humanoid.getNormalizedBoneNode('chest')?.rotation.set(sway, 0, 0)
    humanoid.getNormalizedBoneNode('spine')?.rotation.set(0, motion ? Math.sin(this.time * .65) * .025 : 0, sway * .6)
    humanoid.getNormalizedBoneNode('head')?.rotation.set(sway * .5, motion ? Math.sin(this.time * .45) * .07 : 0, sway)
    if (this.gesture === 'wave') {
      humanoid.getNormalizedBoneNode('rightUpperArm')?.rotation.set(0, 0, 1.12 - envelope * 1.8)
      humanoid.getNormalizedBoneNode('rightLowerArm')?.rotation.set(0, 0, .12 - envelope * (1 + Math.sin(this.gestureTime * 12) * .2))
    } else if (this.gesture === 'cheer') {
      humanoid.getNormalizedBoneNode('leftUpperArm')?.rotation.set(0, 0, -1.12 + envelope * 1.9)
      humanoid.getNormalizedBoneNode('rightUpperArm')?.rotation.set(0, 0, 1.12 - envelope * 1.9)
      humanoid.getNormalizedBoneNode('leftLowerArm')?.rotation.set(0, 0, -.12 + envelope * .9)
      humanoid.getNormalizedBoneNode('rightLowerArm')?.rotation.set(0, 0, .12 - envelope * .9)
    } else if (this.gesture === 'pose') {
      humanoid.getNormalizedBoneNode('chest')?.rotation.set(sway, envelope * .2, envelope * .08)
      humanoid.getNormalizedBoneNode('leftLowerArm')?.rotation.set(-envelope * .8, 0, -.12 + envelope * .9)
      humanoid.getNormalizedBoneNode('head')?.rotation.set(0, -envelope * .2, -envelope * .1)
    }
    const cheering = envelope > .5
    for (const name of EXPRESSIONS)
      this.vrm.expressionManager?.setValue(name, (cheering ? name === 'happy' : name === this.expression) ? .7 : 0)
    const smoothing = 1 - Math.exp(-delta * 8)
    this.gaze.x = motion ? this.gaze.x + (this.gazeTarget.x - this.gaze.x) * smoothing : 0
    this.gaze.y = motion ? this.gaze.y + (this.gazeTarget.y - this.gaze.y) * smoothing : 0
    const head = humanoid.getNormalizedBoneNode('head')
    if (head) { head.rotation.y += this.gaze.x * .16; head.rotation.x += this.gaze.y * .08 }
    for (const [name, value] of [
      ['lookLeft', Math.max(0, this.gaze.x) * .2], ['lookRight', Math.max(0, -this.gaze.x) * .2],
      ['lookDown', Math.max(0, this.gaze.y) * .15], ['lookUp', Math.max(0, -this.gaze.y) * .15],
    ] as const) this.vrm.expressionManager?.setValue(name, value)
    this.blink.update(this.vrm, delta, motion)
    this.vrm.update(delta)
  }

  dispose(): void {
    this.vrm.scene.removeFromParent()
    VRMUtils.deepDispose(this.vrm.scene)
  }
}

/** Streams the model so the splash bar can track real bytes, not a guessed clock. */
async function readBody(
  response: Response,
  onProgress: (ratio: number) => void,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  const total = Number(response.headers.get('content-length'))
  if (!response.body || !Number.isFinite(total) || total <= 0) {
    const bytes = await response.arrayBuffer()
    onProgress(1)
    return bytes
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    signal.throwIfAborted()
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    chunks.push(value)
    loaded += value.byteLength
    onProgress(Math.min(1, loaded / total))
  }
  const out = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out.buffer
}
