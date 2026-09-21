/**
 * Focused adaptation of CharacterStudio's load-utils.loadVRM and
 * CharacterManager._VRMBaseSetup, _modelBaseSetup and _disposeTrait.
 * Upstream: M3-org/CharacterStudio@293182b, MIT / Atlas Foundation (2022).
 * Preserves VRM/MToon loading, per-material palette changes and disposal;
 * replaces wallet/manifest globals with a fixed, versioned licensed catalogue.
 */
import { CanvasTexture, Color, Mesh, SRGBColorSpace } from 'three'
import type { Material, Texture } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import type { VRM, MToonMaterial } from '@pixiv/three-vrm'
import type { AnimeSpec } from '../anime-spec.ts'
import { BlinkManager } from './blink.ts'

type Toon = Material &
  Partial<Pick<MToonMaterial, 'color' | 'shadeColorFactor' | 'map' | 'shadeMultiplyTexture'>>

export class StudioCharacter {
  readonly vrm: VRM
  private blink = new BlinkManager()
  private materials = new Map<string, Toon[]>()
  private tails: Mesh[] = []
  private equipment: Mesh[] = []
  private time = 0
  private gesture: 'wave' | 'cheer' | 'pose' | null = null
  private gestureTime = 0
  private expression: AnimeSpec['expression'] = 'neutral'

  private constructor(vrm: VRM) {
    this.vrm = vrm
    VRMUtils.rotateVRM0(vrm)
    vrm.scene.traverse((node) => {
      node.frustumCulled = false
      if (!(node instanceof Mesh)) return
      if (node.name.startsWith('hair_tail')) this.tails.push(node)
      const mats = (Array.isArray(node.material) ? node.material : [node.material]) as Toon[]
      if (
        node.name.startsWith('robo_arm') ||
        mats.every((mat) =>
          /^(backpack_|armgear_|robo_face|glass|anim_logo|green_emit)/.test(mat.name),
        )
      )
        this.equipment.push(node)
      for (const material of (Array.isArray(node.material)
        ? node.material
        : [node.material]) as Toon[]) {
        const list = this.materials.get(material.name) ?? []
        if (!list.includes(material)) list.push(material)
        this.materials.set(material.name, list)
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

  static async load(signal: AbortSignal): Promise<StudioCharacter> {
    const url = new URL('avatars/seed-v1/seed-san.vrm', document.baseURI)
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error(`Model: HTTP ${response.status}`)
    const bytes = await response.arrayBuffer()
    signal.throwIfAborted()
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))
    const gltf = await loader.parseAsync(bytes, url.href.slice(0, url.href.lastIndexOf('/') + 1))
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
      return new StudioCharacter(vrm)
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
    this.tails.forEach((mesh) => {
      mesh.visible = spec.hair === 'tails'
    })
    this.equipment.forEach((mesh) => {
      mesh.visible = spec.equipment === 'gear'
    })
    for (const name of ['happy', 'relaxed'])
      this.vrm.expressionManager?.setValue(name, spec.expression === name ? 0.7 : 0)
    this.tick(0, false)
  }

  perform(gesture: 'wave' | 'cheer' | 'pose'): void {
    this.gesture = gesture
    this.gestureTime = 0
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
    this.vrm.expressionManager?.setValue('happy', Math.max(this.expression === 'happy' ? .7 : 0, envelope * .75))
    this.blink.update(this.vrm, delta, motion)
    this.vrm.update(delta)
  }

  dispose(): void {
    this.vrm.scene.removeFromParent()
    VRMUtils.deepDispose(this.vrm.scene)
  }
}
