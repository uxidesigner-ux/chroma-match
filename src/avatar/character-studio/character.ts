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
import type { AnimeSpec, FigureStep, HairStyle } from '../anime-spec.ts'
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

/*
 * Where the chest is, in the model's own metres: between the chest bone and the
 * neck bone. Both the search for sculptable geometry and the sculpt itself work
 * in these coordinates, because a skinned mesh's vertices are stored in bind
 * space and this model stands in its bind pose at the origin.
 */
const CHEST_LOW = 1.06
const CHEST_HIGH = 1.29
/*
 * The centre of one breast, and the point it domes away from.
 *
 * That point sits well back inside the ribcage on purpose. Put it just under
 * the surface and the shape pushes sideways as readily as forward, widening the
 * body instead of rounding it; set deep, the direction is dominated by forward
 * and the sideways part only rounds the edges, which is the shape wanted.
 */
const BUST_Y = 1.155
const BUST_X = 0.062
const BUST_ANCHOR_Z = -0.11
/*
 * How wide each side reaches, and how much further it reaches downward.
 *
 * The width matters more than it looks: a dome as tall as it is wide comes to a
 * point, so the base is kept well over half again the height the amount can add.
 * Below the centre the distance counts for less, which carries the shape on
 * down and lets it run out into the ribcage rather than stopping on a rim — a
 * breast is not symmetric about its own middle.
 */
const BUST_REACH = 0.105
const BUST_UNDER = 1.6
/*
 * The body, the clothing on it, and the badge printed on that clothing — which
 * has to ride the surface it sits on or it tears a hole through the front.
 * Equipment merely crossing the same space, the backpack straps above all, is
 * left where it was: gear that swells with the body under it reads as a fault.
 */
const SCULPTED = new Set(['body_bake', 'body_nm', 'huku_bake', 'anim_logo'])
/*
 * What moves whole rather than vertex by vertex. The badge straddles the
 * middle of the shape — measured, y 1.071 to 1.172 against a centre at 1.155 —
 * so the field would push its top out five centimetres and its bottom nothing,
 * shearing a stiff printed shape. It takes the displacement at its own middle
 * and keeps its proportions, which is what a badge on a garment does.
 */
const RIGID = new Set(['anim_logo'])

/*
 * Whether the ponytail is drawn, and how long it runs as a multiple of the
 * length the model ships with.
 *
 * The rest of the hair cannot be styled from here: it is one mesh weighted
 * almost entirely to the head bone, so scaling the strand chains around it
 * moves a few dozen vertices at the tips and nothing else. Only the ponytail
 * is rigged to be moved, and only these three are offered because only these
 * three are real.
 */
const HAIR_SHAPE: Record<HairStyle, { tail: number; ponytail: boolean }> = {
  tails: { tail: 1, ponytail: true },
  bob: { tail: 1, ponytail: false },
  long: { tail: 1.5, ponytail: true },
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
  /** The root of the ponytail chain — the one part of the hair that is rigged to move. */
  private tailBone: Object3D | null = null
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
    this.shape(spec)
    this.sculpt(spec)
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

  /**
   * Sculpts a bust onto the chest, or takes it back off.
   *
   * The five figure axes are bone work, and a bone cannot do this: scaling the
   * chest widens the whole ribcage, front and back alike, which reads as a
   * barrel rather than a bust. The model carries no morph target for it either
   * — its forty-three are all facial — so the geometry is moved directly.
   *
   * Two domes, one per side. How far a vertex moves falls off with its distance
   * from the centre of its side measured across the body, so the shape tapers
   * into the chest instead of ending on a rim; it moves away from a point set
   * back inside the ribcage, which is what makes it round rather than sheared.
   * Only vertices in front of the spine move, so the back is left flat.
   *
   * Every pass rewrites from the model's own vertices, never from the previous
   * pass's, so the amount goes back down as readily as it goes up and landing
   * on male leaves the mesh bit-for-bit as its author shipped it. The skin and
   * the clothing over it take the same field, which is what keeps the shirt
   * outside the body rather than through it.
   */
  private sculpt(spec: AnimeSpec): void {
    // Zero for a male character, and never a fixed size for a female one: the
    // chest axis still says how much, so the two controls do not fight.
    const amount = spec.sex === 'female' ? 0.022 + spec.bust * 0.007 : 0

    /*
     * How far the surface moves at one point, and how strongly. Nothing behind
     * the spine moves at all; in front, a vertex leaves a point set back inside
     * the ribcage, which is what rounds the shape rather than shearing it, by
     * an amount that falls off with its distance from the centre of its own
     * side measured across the body. The falloff is flat at both ends, so
     * neither the peak nor the rim creases.
     */
    const field = (x: number, y: number, z: number, out: number[]): number => {
      out[0] = out[1] = out[2] = 0
      if (amount <= 0 || z <= 0) return 0
      // Below the centre the distance counts for less, so the shape carries on
      // down and runs out into the ribcage instead of ending on a rim.
      const dy = y - BUST_Y
      const rise = dy < 0 ? dy / BUST_UNDER : dy
      let strongest = 0
      for (const side of [-BUST_X, BUST_X]) {
        const across = Math.hypot(x - side, rise)
        if (across >= BUST_REACH) continue
        const t = 1 - across / BUST_REACH
        /*
         * Smoothstep squared. Plain smoothstep is already flat at the peak, but
         * it sheds height too quickly on the way out and leaves a shape that
         * reads as a cone; squaring it holds the top rounder and spends the
         * falloff over the outer half, which is where a breast actually curves.
         */
        const smooth = t * t * (3 - 2 * t)
        /*
         * And held back over the breastbone, which does not come forward on
         * anybody. Without this the neckline's own slit is pulled open from
         * inside and shows two gaps through the front of the shirt.
         */
        const inner = Math.min(1, Math.abs(x) / BUST_X)
        const sternum = 0.3 + 0.7 * inner * inner * (3 - 2 * inner)
        const fall = smooth * smooth * (3 - 2 * smooth) * sternum
        /*
         * The nearer side wins rather than the two being added. Summed, the
         * pair merge into one shelf across the sternum; taken one at a time
         * they stay two, with the valley between them that makes them read as
         * two.
         */
        if (fall <= strongest) continue
        strongest = fall
        let ox = x - side
        let oy = dy
        let oz = z - BUST_ANCHOR_Z
        const reach = Math.hypot(ox, oy, oz) || 1
        out[0] = (ox / reach) * amount * fall
        out[1] = (oy / reach) * amount * fall
        out[2] = (oz / reach) * amount * fall
      }
      return strongest
    }

    const move = [0, 0, 0]
    const centre = [0, 0, 0]
    for (const { geometry, position, normal, rigid } of this.restChest) {
      const pos = geometry.attributes.position!
      const nrm = geometry.attributes.normal!
      if (rigid) {
        // One displacement for the whole badge, taken at its own middle.
        centre[0] = centre[1] = centre[2] = 0
        for (let i = 0; i < pos.count; i++)
          for (let axis = 0; axis < 3; axis++) centre[axis]! += position[i * 3 + axis]! / pos.count
        field(centre[0]!, centre[1]!, centre[2]!, move)
        for (let i = 0; i < pos.count; i++) {
          const o = i * 3
          pos.setXYZ(i, position[o]! + move[0]!, position[o + 1]! + move[1]!, position[o + 2]! + move[2]!)
        }
        pos.needsUpdate = true
        continue
      }
      for (let i = 0; i < pos.count; i++) {
        const o = i * 3
        const px = position[o]!
        const py = position[o + 1]!
        const pz = position[o + 2]!
        const fall = field(px, py, pz, move)
        pos.setXYZ(i, px + move[0]!, py + move[1]!, pz + move[2]!)
        if (fall <= 0) {
          nrm.setXYZ(i, normal[o]!, normal[o + 1]!, normal[o + 2]!)
          continue
        }
        /*
         * Shading has to follow the new surface or the bust reads flat. The
         * normal leans the way the vertex moved; it leans further than the
         * surface itself turns because this model is shaded in toon bands, and
         * a lean that does not carry a normal across a band edge produces a
         * shape that is there in the silhouette and invisible from the front.
         */
        const length = Math.hypot(move[0]!, move[1]!, move[2]!) || 1
        const lean = fall * 1.4
        let nx = normal[o]! + (move[0]! / length) * lean
        let ny = normal[o + 1]! + (move[1]! / length) * lean
        let nz = normal[o + 2]! + (move[2]! / length) * lean
        const unit = Math.hypot(nx, ny, nz) || 1
        nx /= unit
        ny /= unit
        nz /= unit
        nrm.setXYZ(i, nx, ny, nz)
      }
      pos.needsUpdate = true
      nrm.needsUpdate = true
    }
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
