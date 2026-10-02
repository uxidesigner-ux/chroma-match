import { BackSide, BufferAttribute, BufferGeometry, FrontSide, Mesh, SkinnedMesh } from 'three'
import type { Material, Object3D } from 'three'
import type { MToonMaterial, VRM } from '@pixiv/three-vrm'
import type { AnimeSpec } from './anime-spec.ts'
import { buildWardrobe, wardrobeColour, wardrobeKey, wardrobeShade } from './wardrobe.ts'
import type { WardrobePaint } from './wardrobe.ts'

/** One fitted wardrobe, bound to the very same bones/inverses as the body. */
export class WardrobeRig {
  private key = ''
  private meshes: SkinnedMesh[] = []
  private paint = new Map<WardrobePaint, MToonMaterial[]>()
  private originals: { mesh: Mesh; visible: boolean }[] = []
  private template: SkinnedMesh
  private skinPaint: Material[]
  private clothPaint: MToonMaterial[]
  private parent: Object3D
  private restY: number
  heelAngle = 0

  constructor(private vrm: VRM, private source: ArrayBuffer) {
    let template: SkinnedMesh | undefined, cloth: Mesh | undefined
    vrm.scene.traverse(node => {
      if (!(node instanceof Mesh)) return
      const materials = Array.isArray(node.material) ? node.material : [node.material]
      if (node.name.startsWith('wear') && materials[0]?.name === 'body_bake' && node instanceof SkinnedMesh) template = node
      if (node.name.startsWith('wear') && materials[0]?.name === 'huku_bake') cloth = node
      if (/^wear_[1234]$/.test(node.name)) this.originals.push({ mesh: node, visible: node.visible })
    })
    if (!template || !cloth) throw new Error('Missing fitted wardrobe template')
    this.template = template
    this.parent = template.parent ?? vrm.scene
    this.skinPaint = Array.isArray(template.material) ? template.material : [template.material]
    this.clothPaint = (Array.isArray(cloth.material) ? cloth.material : [cloth.material]) as MToonMaterial[]
    this.restY = vrm.scene.position.y
  }

  apply(spec: AnimeSpec): void {
    const key = wardrobeKey(spec), active = key !== 'seed'
    for (const { mesh, visible } of this.originals) mesh.visible = active ? false : visible
    // A badge printed on the retired tunic is not a floating visor accessory.
    this.vrm.scene.traverse(node => { if (node.name === 'wear_12') node.visible = !active && spec.visor })
    if (key !== this.key) {
      this.key = key
      this.clear()
      const wardrobe = buildWardrobe(this.source, spec)
      this.heelAngle = wardrobe?.heelAngle ?? 0
      this.vrm.scene.position.y = this.restY + (wardrobe?.lift ?? 0)
      for (const part of wardrobe?.parts ?? []) {
        const geometry = new BufferGeometry()
        geometry.setAttribute('position', new BufferAttribute(part.positions, 3))
        geometry.setAttribute('normal', new BufferAttribute(part.normals, 3))
        geometry.setAttribute('uv', new BufferAttribute(part.uv, 2))
        geometry.setAttribute('skinIndex', new BufferAttribute(part.joints, 4))
        geometry.setAttribute('skinWeight', new BufferAttribute(part.weights, 4))
        geometry.setIndex(new BufferAttribute(part.index, 1))
        const paints = part.paint === 'skin' ? this.skinPaint : this.materials(part.paint)
        for (let i = 0; i < paints.length; i++) geometry.addGroup(0, part.index.length, i)
        const mesh = new SkinnedMesh(geometry, paints)
        mesh.name = part.name
        mesh.frustumCulled = false
        mesh.bind(this.template.skeleton, this.template.bindMatrix)
        this.parent.add(mesh)
        this.meshes.push(mesh)
      }
    }
    for (const [role, materials] of this.paint) {
      const colour = wardrobeColour(role, spec)
      for (const material of materials) {
        material.color.fromArray(colour)
        material.shadeColorFactor.fromArray(wardrobeShade(role, spec))
      }
    }
  }

  private materials(role: WardrobePaint): MToonMaterial[] {
    let materials = this.paint.get(role)
    if (materials) return materials
    const template = role === 'armSkin' ? this.skinPaint as MToonMaterial[] : this.clothPaint
    materials = template.map(original => {
      const material = original.clone()
      material.name = `wardrobe_${role}${original.isOutline ? ' (Outline)' : ''}`
      material.map = null
      material.shadeMultiplyTexture = null
      material.shadingShiftTexture = null
      material.outlineWidthMultiplyTexture = null
      material.normalMap = null
      material.emissiveMap = null
      material.matcapTexture = null
      material.rimMultiplyTexture = null
      material.side = original.isOutline ? BackSide : FrontSide
      material.transparent = false
      material.opacity = 1
      material.outlineWidthFactor = role === 'armSkin' ? .001 : .0015
      material.needsUpdate = true
      return material
    })
    this.paint.set(role, materials)
    return materials
  }

  private clear(): void {
    for (const mesh of this.meshes) { mesh.removeFromParent(); mesh.geometry.dispose() }
    this.meshes = []
  }
  dispose(): void {
    this.clear()
    for (const materials of this.paint.values()) for (const material of materials) material.dispose()
    this.paint.clear()
  }
}
