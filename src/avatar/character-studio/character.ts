/**
 * Focused adaptation of CharacterStudio's load-utils.loadVRM and
 * CharacterManager._VRMBaseSetup, _modelBaseSetup and _disposeTrait.
 * Upstream: M3-org/CharacterStudio@293182b, MIT / Atlas Foundation (2022).
 * Preserves VRM/MToon loading, per-material palette changes and disposal;
 * replaces wallet/manifest globals with a fixed, versioned licensed catalogue.
 */
import { CanvasTexture, Color, Mesh, SRGBColorSpace, Vector3 } from 'three'
import type { BufferGeometry } from 'three'
import type { Object3D } from 'three'
import type { Material, Texture } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import type { VRM, MToonMaterial } from '@pixiv/three-vrm'
import type { AnimeSpec } from '../anime-spec.ts'
import { EXPRESSIONS } from '../anime-spec.ts'
import { CHEST_HIGH, CHEST_LOW, HAIR_SHAPE, RIGID, SCULPTED, applyFigure, bustAmount, sculptChest } from '../body-shape.ts'
import type { ShapeNode, ShapedBone } from '../body-shape.ts'
import { exportSeed } from '../studio-export.ts'
import { BlinkManager } from './blink.ts'

type Toon = Material &
  Partial<Pick<MToonMaterial, 'color' | 'shadeColorFactor' | 'map' | 'shadeMultiplyTexture'>>


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
  /** The root of the ponytail chain — the one part of the hair that is rigged to move. */
  private tailBone: Object3D | null = null
  /** Every node the figure moves, as the model shipped it. */
  private restPose = new Map<Object3D, [number, number, number]>()
  /*
   * The chest is sculpted, not scaled, so the untouched geometry has to be kept
   * to sculpt from: each pass rewrites the vertices from the model's own, never
   * from the previous pass's, which is what lets the amount go back down again.
   */
  private restChest: {
    geometry: BufferGeometry
    position: Float32Array
    normal: Float32Array
    /** A printed badge is small and stiff: it rides the surface whole, or it shears. */
    rigid: boolean
  }[] = []

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
    /*
     * Reached through the humanoid rather than by node name: the loader
     * rewrites names that carry a space, and this model's head node has one.
     */
    this.tailBone = (vrm.humanoid.getRawBoneNode('head')?.children ?? [])
      .find((node) => node.name === 'hair_tail_1') ?? null
    /*
     * Only the meshes that actually carry geometry across the chest are kept.
     * The head's skin shares a material name with the body's but sits entirely
     * above the neck, and it holds the forty-three expression morphs, which
     * rewriting base vertices underneath would quietly corrupt.
     */
    const seen = new Set<BufferGeometry>()
    vrm.scene.traverse((node) => {
      if (!(node instanceof Mesh) || node.morphTargetInfluences?.length) return
      /*
       * Skin, the clothing over it and what is printed on that clothing. The
       * backpack straps cross the same space — measured, 576 and 528 vertices
       * of them — and gear that swells with the body under it reads as a fault.
       */
      const mats = (Array.isArray(node.material) ? node.material : [node.material]) as Toon[]
      if (!mats.some((mat) => SCULPTED.has(mat.name))) return
      const { position, normal } = node.geometry.attributes
      if (!position || !normal || seen.has(node.geometry)) return
      for (let i = 0; i < position.count; i++) {
        const y = position.getY(i)
        if (y <= CHEST_LOW || y >= CHEST_HIGH || position.getZ(i) <= 0) continue
        seen.add(node.geometry)
        this.restChest.push({
          geometry: node.geometry,
          position: Float32Array.from(position.array),
          normal: Float32Array.from(normal.array),
          rigid: mats.every((mat) => RIGID.has(mat.name)),
        })
        return
      }
    })
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
    const hair = HAIR_SHAPE[spec.hair] ?? HAIR_SHAPE.tails
    this.tails.forEach((mesh) => {
      mesh.visible = hair.ponytail
    })
    this.tailBone?.scale.setScalar(hair.tail)
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
    applyFigure(spec, this.skeleton)
    const amount = bustAmount(spec)
    for (const { geometry, rigid, ...rest } of this.restChest) {
      const position = geometry.attributes.position!
      const normal = geometry.attributes.normal!
      sculptChest(amount, rigid, rest, {
        setPosition: (i, x, y, z) => position.setXYZ(i, x, y, z),
        setNormal: (i, x, y, z) => normal.setXYZ(i, x, y, z),
      })
      position.needsUpdate = true
      normal.needsUpdate = true
    }
    this.tick(0, false)
  }

  perform(gesture: 'wave' | 'cheer' | 'pose'): void {
    this.gesture = gesture
    this.gestureTime = 0
  }

  /*
   * The three.js half of the shared shape rule. Rest translations are the
   * model's own, captured once, because the shoulders move by translation and a
   * pass reading back the previous pass's numbers would drift further out each
   * time.
   */
  private get skeleton() {
    const wrap = (node: Object3D | null | undefined): ShapeNode | null => {
      if (!node) return null
      let rest = this.restPose.get(node)
      if (!rest) {
        rest = [node.position.x, node.position.y, node.position.z]
        this.restPose.set(node, rest)
      }
      return {
        key: node,
        rest,
        setScale: (x, y, z) => node.scale.set(x, y, z),
        setTranslation: (x, y, z) => node.position.set(x, y, z),
        children: () => node.children.map((child) => wrap(child)!),
      }
    }
    return { bone: (name: ShapedBone) => wrap(this.vrm.humanoid.getRawBoneNode(name)) }
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
