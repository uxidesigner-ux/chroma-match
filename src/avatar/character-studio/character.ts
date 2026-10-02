/**
 * Focused adaptation of CharacterStudio's load-utils.loadVRM and
 * CharacterManager._VRMBaseSetup, _modelBaseSetup and _disposeTrait.
 * Upstream: M3-org/CharacterStudio@293182b, MIT / Atlas Foundation (2022).
 * Preserves VRM/MToon loading, per-material palette changes and disposal;
 * replaces wallet/manifest globals with a fixed, versioned licensed catalogue.
 */
import { BufferAttribute, BufferGeometry, CanvasTexture, Color, Mesh, SRGBColorSpace, Vector3 } from 'three'
import type { Object3D } from 'three'
import type { Material, Texture } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import type { VRM, MToonMaterial } from '@pixiv/three-vrm'
import type { AnimeSpec } from '../anime-spec.ts'
import { EXPRESSIONS } from '../anime-spec.ts'
import { CHEST_HIGH, CHEST_LOW, SEAT_HIGH, SEAT_LOW, HAIR_SHAPE, RIGID, SCULPTED, applyFigure, bustAmount, sculptChest, sculptSeat } from '../body-shape.ts'
import type { ShapeNode, ShapedBone } from '../body-shape.ts'
import { hairGeometry, hairShading } from '../hair-strands.ts'
import { exportSeed } from '../studio-export.ts'
import { BlinkManager } from './blink.ts'
import { armPose, GESTURE_SECONDS, gestureWeight } from './gesture-pose.ts'
import { WardrobeRig } from '../wardrobe-rig.ts'

type Toon = Material &
  Partial<Pick<MToonMaterial, 'color' | 'shadeColorFactor' | 'map' | 'shadeMultiplyTexture'>>


export class StudioCharacter {
  readonly vrm: VRM
  private wardrobe: WardrobeRig
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
  /** One dedicated shell, sharing palette factors with the original fringe. */
  private hairMesh: Mesh | null = null
  private hairPaint: Toon | null = null
  private hairTexture: CanvasTexture | null = null
  private hairKey: string | null = null
  /** Every node the figure moves, as the model shipped it. */
  private restPose = new Map<Object3D, [number, number, number]>()
  /*
   * Chest/seat sculpting starts from the model's untouched geometry on every
   * apply, never from the previous pass's, so volume cannot accumulate.
   */
  private restBody: {
    geometry: BufferGeometry
    position: Float32Array
    normal: Float32Array
    joints: ArrayLike<number>
    weights: ArrayLike<number>
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
     * Only the meshes carrying chest/seat geometry are kept.
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
        if (!(y > CHEST_LOW && y < CHEST_HIGH && position.getZ(i) > 0) && !(y > SEAT_LOW && y < SEAT_HIGH && position.getZ(i) < -.008)) continue
        const joints = node.geometry.attributes.skinIndex, weights = node.geometry.attributes.skinWeight
        if (!joints || !weights) continue
        seen.add(node.geometry)
        this.restBody.push({
          geometry: node.geometry,
          position: Float32Array.from(position.array),
          normal: Float32Array.from(normal.array),
          joints: joints.array,
          weights: weights.array,
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
    this.wardrobe = new WardrobeRig(vrm, source)
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
    this.standHair(spec)
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
    for (const { geometry, rigid, ...rest } of this.restBody) {
      const position = geometry.attributes.position!
      const normal = geometry.attributes.normal!
      const into = {
        setPosition: (i: number, x: number, y: number, z: number) => { position.setXYZ(i, x, y, z) },
        setNormal: (i: number, x: number, y: number, z: number) => { normal.setXYZ(i, x, y, z) },
      }
      sculptChest(amount, rigid, rest, into)
      if (!rigid) sculptSeat(rest, into)
      position.needsUpdate = true
      normal.needsUpdate = true
    }
    this.wardrobe.apply(spec)
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
    if (spec.hair !== 'tails') {
      const canvas = this.shellTexture().image as HTMLCanvasElement
      const png = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]!), c => c.charCodeAt(0))
      palettes.push({ name: 'hair_shape', colour: [], shade: [], png })
    }
    return exportSeed(this.source, spec, palettes)
  }

  tick(delta: number, motion: boolean): void {
    if (motion) this.time += delta
    const sway = motion ? Math.sin(this.time * 1.5) * 0.014 : 0
    const weight = motion ? Math.sin(this.time * .55) * .022 : 0
    if (motion && this.gesture) this.gestureTime += delta
    if (this.gestureTime >= GESTURE_SECONDS) this.gesture = null
    const active = motion ? this.gesture : null
    const envelope = active ? gestureWeight(this.gestureTime) : 0
    const humanoid = this.vrm.humanoid
    for (const side of ['left', 'right'] as const) {
      const arm = armPose(side, active, this.gestureTime, weight)
      humanoid.getNormalizedBoneNode(`${side}UpperArm`)?.quaternion.copy(arm.upper)
      humanoid.getNormalizedBoneNode(`${side}LowerArm`)?.quaternion.copy(arm.lower)
      humanoid.getNormalizedBoneNode(`${side}Hand`)?.quaternion.copy(arm.wrist)
      humanoid.getNormalizedBoneNode(`${side}Foot`)?.rotation.set(this.wardrobe.heelAngle, 0, 0)
      humanoid.getNormalizedBoneNode(`${side}Toes`)?.rotation.set(-this.wardrobe.heelAngle, 0, 0)
    }
    // Counter-rotation shifts weight without translating the feet or changing
    // customized body offsets. Every frame starts from these absolute values.
    humanoid.getNormalizedBoneNode('hips')?.rotation.set(0, 0, weight)
    humanoid.getNormalizedBoneNode('leftUpperLeg')?.rotation.set(0, 0, -weight)
    humanoid.getNormalizedBoneNode('rightUpperLeg')?.rotation.set(0, 0, -weight)
    humanoid.getNormalizedBoneNode('chest')?.rotation.set(sway, 0, 0)
    humanoid.getNormalizedBoneNode('spine')?.rotation.set(0, motion ? Math.sin(this.time * .65) * .025 : 0, sway * .6 - weight * .5)
    humanoid.getNormalizedBoneNode('head')?.rotation.set(sway * .5, motion ? Math.sin(this.time * .45) * .07 : 0, sway)
    if (active === 'pose') {
      humanoid.getNormalizedBoneNode('chest')?.rotation.set(sway, envelope * .2, envelope * .08)
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

  /** Keep one shell; palette drags never rebuild geometry. */
  private standHair(spec: AnimeSpec): void {
    const key = `${spec.hair}:${Number(spec.pack)}`
    if (key === this.hairKey) return
    this.hairKey = key
    this.hairMesh?.removeFromParent()
    this.hairMesh?.geometry.dispose()
    this.hairMesh = null
    const shape = hairGeometry(spec.hair, spec.pack)
    const head = this.vrm.humanoid.getRawBoneNode('head')
    const original = this.materials.get('hair')?.[0]
    if (!shape || !head || !original) return
    if (!this.hairPaint) {
      this.hairPaint = original.clone() as Toon
      // Own grayscale strands, not reused UVs into an unrelated ponytail map.
      this.hairPaint.map = this.shellTexture()
      this.hairPaint.shadeMultiplyTexture = this.hairTexture
      this.hairPaint.name = 'hair_shape'
      this.hairPaint.needsUpdate = true
      this.materials.get('hair')!.push(this.hairPaint)
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(shape.positions, 3))
    geometry.setAttribute('normal', new BufferAttribute(shape.normals, 3))
    geometry.setAttribute('uv', new BufferAttribute(shape.uv, 2))
    geometry.setIndex(new BufferAttribute(shape.index, 1))
    this.hairMesh = new Mesh(geometry, this.hairPaint)
    this.hairMesh.name = 'hair_shape'
    this.hairMesh.frustumCulled = false
    head.add(this.hairMesh)
  }

  /** Exporting a different cut can create the map without changing the preview. */
  private shellTexture(): CanvasTexture {
    if (!this.hairTexture) {
      const pixels = hairShading()
      const canvas = document.createElement('canvas')
      canvas.width = pixels.width; canvas.height = pixels.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas unavailable')
      context.putImageData(new ImageData(pixels.rgba, pixels.width, pixels.height), 0, 0)
      this.hairTexture = new CanvasTexture(canvas)
      this.hairTexture.flipY = false
      this.hairTexture.colorSpace = SRGBColorSpace
    }
    return this.hairTexture
  }

  dispose(): void {
    this.wardrobe.dispose()
    this.hairMesh?.removeFromParent()
    this.hairMesh?.geometry.dispose()
    this.hairMesh = null
    this.hairPaint?.dispose()
    this.hairPaint = null
    this.hairTexture?.dispose()
    this.hairTexture = null
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
