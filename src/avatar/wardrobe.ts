/**
 * Fitted, original wardrobe for the pinned Seed rig. Geometry and weights are
 * shared by the live renderer and the template-preserving VRM/GLB writer.
 * Tops/trousers are tailored from the licensed body's actual surface, including
 * its arm underlay. Clipping interpolates bone influences, not just positions.
 * Covered skin is removed with the same cut, and openings have real thickness.
 */
import { BufferAttribute, BufferGeometry, Matrix4, Object3D, Quaternion, Ray, Triangle, Vector3 } from 'three'
import { VRMHumanoid } from '@pixiv/three-vrm'
import type { VRMHumanBones } from '@pixiv/three-vrm'
import type { AnimeSpec } from './anime-spec.ts'
import { hasWardrobe } from './anime-spec.ts'
import { applyFigure, bustAmount, sculptChest } from './body-shape.ts'
import type { ShapeNode } from './body-shape.ts'

type V3 = [number, number, number]
type V4 = [number, number, number, number]
export type WardrobePaint = 'skin' | 'armSkin' | 'top' | 'bottom' | 'shoe' | 'sole' | 'topTrim' | 'bottomTrim' | 'shoeTrim'
export interface WardrobeGeometry {
  name: string
  paint: WardrobePaint
  positions: Float32Array
  normals: Float32Array
  uv: Float32Array
  joints: Uint16Array
  weights: Float32Array
  index: Uint32Array
}
export interface Wardrobe {
  skin: number
  parts: WardrobeGeometry[]
  lift: number
  /** Normalized foot plantar flexion; toes counter-rotate to stay supported. */
  heelAngle: number
  rotations: { node: number; rotation: V4 }[]
}

interface Vertex { p: V3; n: V3; uv: [number, number]; joints: V4; weights: V4 }
interface SourceNode { name?: string; children?: number[]; mesh?: number; skin?: number; translation?: V3; rotation?: V4; scale?: V3; matrix?: number[] }
interface SourceDocument {
  accessors: { bufferView: number; byteOffset?: number; type: string; componentType: number; count: number; normalized?: boolean }[]
  bufferViews: { byteOffset?: number; byteStride?: number }[]
  materials: { name: string }[]
  meshes: { name?: string; primitives: { material: number; attributes: Record<string, number>; indices?: number }[] }[]
  nodes: SourceNode[]
  skins: { joints: number[]; inverseBindMatrices: number }[]
  extensions: { VRMC_vrm: { humanoid: { humanBones: Record<string, { node: number }> } } }
}
interface Source {
  document: SourceDocument
  skin: number
  body: Vertex[][]
  arm: Vertex[][]
  points: Vertex[]
  fitPoints: Vertex[]
  joint: Record<string, number>
  inverses: Matrix4[]
  looks: Map<string, Wardrobe>
  clothes: Map<string, WardrobeGeometry[]>
}
const sources = new WeakMap<ArrayBuffer, Source>()
const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t) }

function sourceData(buffer: ArrayBuffer): Source {
  const cached = sources.get(buffer)
  if (cached) return cached
  const header = new DataView(buffer)
  const length = header.getUint32(12, true)
  const document = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length))) as SourceDocument
  const binary = new DataView(buffer, 28 + length)
  const wear = document.nodes.find(node => node.name === 'wear')
  if (wear?.skin === undefined || wear.mesh === undefined) throw new Error('Missing Seed wardrobe rig')
  const skin = document.skins[wear.skin]!
  const read = (at: number | undefined): number[][] => {
    if (at === undefined) throw new Error('Missing skinned surface data')
    const a = document.accessors[at]!
    const v = document.bufferViews[a.bufferView]!
    const size = a.componentType === 5121 ? 1 : a.componentType === 5123 ? 2 : 4
    const width = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 } as Record<string, number>)[a.type]!
    const result: number[][] = []
    for (let i = 0; i < a.count; i++) {
      const row: number[] = []
      for (let k = 0; k < width; k++) {
        const offset = (v.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (v.byteStride ?? size * width) + k * size
        let value = a.componentType === 5126 ? binary.getFloat32(offset, true) : size === 1 ? binary.getUint8(offset) : size === 2 ? binary.getUint16(offset, true) : binary.getUint32(offset, true)
        if (a.normalized) value /= size === 1 ? 255 : 65535
        row.push(value)
      }
      result.push(row)
    }
    return result
  }
  const body: Vertex[][] = [], arm: Vertex[][] = [], points: Vertex[] = []
  for (const primitive of document.meshes[wear.mesh]!.primitives) {
    const material = document.materials[primitive.material]!.name
    if (!['body_bake', 'body_nm'].includes(material)) continue
    const p = read(primitive.attributes.POSITION), n = read(primitive.attributes.NORMAL)
    const uv = read(primitive.attributes.TEXCOORD_0), joints = read(primitive.attributes.JOINTS_0), weights = read(primitive.attributes.WEIGHTS_0)
    const vertices: Vertex[] = p.map((position, i) => ({ p: position as V3, n: n[i] as V3, uv: uv[i] as [number, number], joints: joints[i] as V4, weights: weights[i] as V4 }))
    points.push(...vertices)
    const indices = primitive.indices === undefined ? vertices.map((_, i) => i) : read(primitive.indices).map(row => row[0]!)
    const triangles = material === 'body_bake' ? body : arm
    for (let i = 0; i < indices.length; i += 3) triangles.push(indices.slice(i, i + 3).map(index => vertices[index]!))
  }
  const joint = Object.fromEntries(Object.entries(document.extensions.VRMC_vrm.humanoid.humanBones).map(([name, bone]) => [name, skin.joints.indexOf(bone.node)]))
  const fitPoints = points.filter(v => Math.abs(v.p[0]) < .18 && v.p[1] > .63 && v.p[1] < .99)
  const inverses = read(skin.inverseBindMatrices).map(values => new Matrix4().fromArray(values))
  const result = { document, skin: wear.skin, body, arm, points, fitPoints, joint, inverses, looks: new Map<string, Wardrobe>(), clothes: new Map<string, WardrobeGeometry[]>() }
  sources.set(buffer, result)
  return result
}

/** Blend and re-normalize up to four influences at every newly cut edge. */
function between(a: Vertex, b: Vertex, t: number): Vertex {
  const influences = new Map<number, number>()
  for (const [v, amount] of [[a, 1 - t], [b, t]] as const)
    for (let i = 0; i < 4; i++) influences.set(v.joints[i]!, (influences.get(v.joints[i]!) ?? 0) + v.weights[i]! * amount)
  const sorted = [...influences].filter(([, w]) => w > 1e-9).sort((a, b) => b[1] - a[1]).slice(0, 4)
  const total = sorted.reduce((sum, [, w]) => sum + w, 0)
  const mix = (x: number, y: number) => x + (y - x) * t
  const normal = new Vector3(...a.n).lerp(new Vector3(...b.n), t).normalize().toArray() as V3
  return { p: a.p.map((v, i) => mix(v, b.p[i]!)) as V3, n: normal, uv: a.uv.map((v, i) => mix(v, b.uv[i]!)) as [number, number], joints: [0, 1, 2, 3].map(i => sorted[i]?.[0] ?? 0) as V4, weights: [0, 1, 2, 3].map(i => (sorted[i]?.[1] ?? 0) / total) as V4 }
}

type Cut = (v: Vertex) => number
function split(polygon: Vertex[], cut: Cut): [Vertex[], Vertex[]] {
  const inside: Vertex[] = [], outside: Vertex[] = []
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!
    const av = cut(a), bv = cut(b)
    ;(av >= 0 ? inside : outside).push(a)
    if ((av >= 0) !== (bv >= 0)) {
      const edge = between(a, b, av / (av - bv))
      inside.push(edge); outside.push(edge)
    }
  }
  return [inside, outside]
}
const triangulate = (polygon: Vertex[]): Vertex[][] => polygon.slice(1, -1).map((v, i) => [polygon[0]!, v, polygon[i + 2]!])
function keep(triangle: Vertex[], cuts: Cut[]): Vertex[][] {
  let polygon = triangle
  for (const cut of cuts) { polygon = split(polygon, cut)[0]; if (polygon.length < 3) return [] }
  return triangulate(polygon)
}
/** Difference of an intersection: keep each outside piece, not just whole triangles. */
function uncover(triangle: Vertex[], cuts: Cut[]): Vertex[][] {
  let polygon = triangle
  const result: Vertex[][] = []
  for (const cut of cuts) {
    const [inside, outside] = split(polygon, cut)
    result.push(...triangulate(outside))
    polygon = inside
    if (polygon.length < 3) break
  }
  return result
}

class Surface {
  vertices: Vertex[] = []
  indices: number[] = []
  private keys = new Map<string, number>()
  private vertex(v: Vertex): number {
    const key = [...v.p, ...v.n, ...v.uv, ...v.joints, ...v.weights].map(n => Math.round(n * 1e6)).join(',')
    const previous = this.keys.get(key)
    if (previous !== undefined) return previous
    const at = this.vertices.length; this.vertices.push(v); this.keys.set(key, at)
    return at
  }
  face(a: Vertex, b: Vertex, c: Vertex): void {
    const cross = new Vector3(...b.p).sub(new Vector3(...a.p)).cross(new Vector3(...c.p).sub(new Vector3(...a.p)))
    if (cross.lengthSq() < 1e-15) return
    this.indices.push(this.vertex(a), this.vertex(b), this.vertex(c))
  }
  triangles(triangles: Vertex[][]): void { for (const t of triangles) this.face(t[0]!, t[1]!, t[2]!) }
  calculateNormals(): void {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(Float32Array.from(this.vertices.flatMap(v => v.p)), 3))
    geometry.setIndex(this.indices); geometry.computeVertexNormals()
    const normal = geometry.attributes.normal!
    this.vertices.forEach((v, i) => { v.n = [normal.getX(i), normal.getY(i), normal.getZ(i)] })
    geometry.dispose()
  }
  shape(name: string, paint: WardrobePaint, recompute = false): WardrobeGeometry {
    const positions = Float32Array.from(this.vertices.flatMap(v => v.p))
    let normals = Float32Array.from(this.vertices.flatMap(v => v.n))
    const index = Uint32Array.from(this.indices)
    if (recompute) {
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new BufferAttribute(positions, 3)); geometry.setIndex(new BufferAttribute(index, 1))
      geometry.computeVertexNormals(); normals = Float32Array.from(geometry.attributes.normal!.array); geometry.dispose()
    }
    return { name, paint, positions, normals, uv: Float32Array.from(this.vertices.flatMap(v => v.uv)), joints: Uint16Array.from(this.vertices.flatMap(v => v.joints)), weights: Float32Array.from(this.vertices.flatMap(v => v.weights)), index }
  }
}

/** Actual cut edges only; coincident UV seams are welded for boundary counting. */
function bindEdges(surface: Surface): [Vertex, Vertex][] {
  const edges = new Map<string, { count: number; a: Vertex; b: Vertex }>()
  const key = (v: Vertex) => v.p.map(n => Math.round(n * 100000)).join(',')
  for (let i = 0; i < surface.indices.length; i += 3)
    for (let j = 0; j < 3; j++) {
      const a = surface.vertices[surface.indices[i + j]!]!, b = surface.vertices[surface.indices[i + (j + 1) % 3]!]!
      const ends = [key(a), key(b)].sort().join('/')
      const found = edges.get(ends)
      if (found) found.count++
      else edges.set(ends, { count: 1, a, b })
    }
  return [...edges.values()].filter(edge => edge.count === 1).map(edge => [edge.a, edge.b])
}
function finishOpening(surface: Surface, trim: Surface, thickness = .004): void {
  for (const [a, b] of bindEdges(surface)) {
    const inner = (v: Vertex): Vertex => ({ ...v, p: v.p.map((n, i) => n - v.n[i]! * thickness) as V3 })
    const ai = inner(a), bi = inner(b)
    trim.face(a, ai, bi); trim.face(a, bi, b)
    // A narrow exterior binding reads as a finished collar/cuff/hem, with its
    // thickness closing the opening rather than a flat painted outline.
    const tangent = new Vector3(...b.p).sub(new Vector3(...a.p)).normalize()
    const normal = new Vector3(...a.n).add(new Vector3(...b.n)).normalize()
    const inset = normal.clone().cross(tangent).multiplyScalar(.0045)
    const band = (v: Vertex, inside: boolean): Vertex => ({ ...v, p: new Vector3(...v.p).addScaledVector(new Vector3(...v.n), .0007).add(inside ? inset : new Vector3()).toArray() as V3 })
    const ao = band(a, false), bo = band(b, false), ab = band(a, true), bb = band(b, true)
    trim.face(ao, bo, bb); trim.face(ao, bb, ab)
  }
}

function topCuts(spec: AnimeSpec, source: Source): Cut[] {
  const long = spec.top === 'roundLong' || spec.top === 'vLong'
  const vneck = spec.top === 'vShort' || spec.top === 'vLong'
  const arms = ['left', 'right'].map(side => {
    const point = (bone: string) => new Vector3().setFromMatrixPosition(source.inverses[source.joint[`${side}${bone}`]!]!.clone().invert())
    const shoulder = point('UpperArm'), elbow = point('LowerArm'), wrist = point('Hand')
    const direction = (long ? wrist.clone().sub(elbow) : elbow.clone().sub(shoulder)).normalize()
    const end = long ? wrist.addScaledVector(direction, -.024) : shoulder.lerp(elbow, .53)
    return { direction, end }
  })
  const armWeight = (v: Vertex) => v.weights.reduce((sum, w, i) => sum + (v.joints[i]! >= 30 && v.joints[i]! <= 78 && v.joints[i] !== 37 ? w : 0), 0)
  return [
    v => armWeight(v) > .1 ? 1 : v.p[1] - .927,
    v => {
      if (armWeight(v) <= .1) return 1
      const arm = arms[v.p[0] >= 0 ? 0 : 1]!
      return new Vector3(...v.p).sub(arm.end).dot(arm.direction) * -1
    },
    v => {
      const x = Math.abs(v.p[0]) / .087
      if (x >= 1) return 1.31 - v.p[1]
      const front = smooth((v.p[2] + .012) / .045)
      const depth = vneck ? .106 * (1 - x) : .055 * Math.sqrt(Math.max(0, 1 - x * x))
      return 1.277 - (.018 * (1 - front) + depth * front) - v.p[1]
    },
  ]
}
function bottomCuts(spec: AnimeSpec): Cut[] {
  const skirt = spec.bottom === 'skirtLong' || spec.bottom === 'skirtShort'
  const hem = spec.bottom === 'shorts' ? .602 : spec.bottom === 'skirtShort' ? .567 : spec.bottom === 'skirtLong' ? .175 : spec.shoes === 'heels' ? .155 : .107
  return [v => .949 - v.p[1], v => v.p[1] - hem, v => (skirt ? .20 : .19) - Math.abs(v.p[0])]
}

function sculpt(source: Source, spec: AnimeSpec): Map<Vertex, Vertex> {
  const amount = bustAmount(spec)
  const positions = Float32Array.from(source.points.flatMap(v => v.p)), normals = Float32Array.from(source.points.flatMap(v => v.n))
  const result = new Map<Vertex, Vertex>()
  sculptChest(amount, false, { position: positions, normal: normals }, {
    setPosition: (i, x, y, z) => positions.set([x, y, z], i * 3),
    setNormal: (i, x, y, z) => normals.set([x, y, z], i * 3),
  })
  source.points.forEach((v, i) => result.set(v, { ...v, p: Array.from(positions.subarray(i * 3, i * 3 + 3)) as V3, n: Array.from(normals.subarray(i * 3, i * 3 + 3)) as V3 }))
  return result
}

function nearest(source: Source, p: V3): Vertex {
  let best = source.points[0]!, distance = Infinity
  for (const v of source.fitPoints) {
    const d = (v.p[0] - p[0]) ** 2 + (v.p[1] - p[1]) ** 2 + (v.p[2] - p[2]) ** 2
    if (d < distance) { best = v; distance = d }
  }
  return { ...best, p, n: [0, 0, 0], uv: [0, 0] }
}

/** The skirt waist shares the body's actual surface/influences, not an ellipse
 * merely close to it. This keeps a tucked shirt outside the skin and inside
 * the waistband even when hips and waist are scaled independently. */
function waistSurface(source: Source, y: number, a: number): Vertex | null {
  const ray = new Ray(new Vector3(0, y, .007), new Vector3(Math.cos(a), 0, Math.sin(a)))
  const hit = new Vector3(), bary = new Vector3()
  for (const t of source.body) {
    if (t.every(v => v.p[1] < y) || t.every(v => v.p[1] > y) || t.some(v => Math.abs(v.p[0]) > .20)) continue
    const [p, q, r] = t.map(v => new Vector3(...v.p)) as [Vector3, Vector3, Vector3]
    if (!ray.intersectTriangle(p, q, r, false, hit)) continue
    Triangle.getBarycoord(hit, p, q, r, bary)
    const pq = bary.x + bary.y
    const vertex = between(pq > 1e-8 ? between(t[0]!, t[1]!, bary.y / pq) : t[0]!, t[2]!, bary.z)
    vertex.p = hit.clone().addScaledVector(new Vector3(...vertex.n), .020).toArray() as V3
    return vertex
  }
  return null
}

function skirt(source: Source, spec: AnimeSpec, cloth: Surface, trim: Surface): void {
  const long = spec.bottom === 'skirtLong', hem = long ? .175 : .567
  const around = 64, rows = 22
  const rings: Vertex[][] = []
  for (let row = 0; row <= rows; row++) {
    const t = row / rows, y = .949 + (hem - .949) * t
    const hip = smooth(Math.min(1, (.949 - y) / .135))
    const flare = Math.max(0, (t - .22) / .78)
    const rx = .132 + hip * .02 + flare * (long ? .126 : .076)
    const rz = .085 + hip * .004 + flare * (long ? .104 : .058)
    const ring: Vertex[] = []
    for (let i = 0; i <= around; i++) {
      const a = i / around * Math.PI * 2, fold = Math.cos(a * 10) * .0035 * flare
      const target: V3 = [(rx + fold) * Math.cos(a), y, (rz + fold) * Math.sin(a) + .007]
      const fitted = y > .84 ? waistSurface(source, y, a) : null
      const v = fitted ?? nearest(source, [target[0], Math.max(.66, y), target[2]])
      const p = fitted ? new Vector3(...fitted.p).lerp(new Vector3(...target), smooth((.949 - y) / .109)).toArray() as V3 : target
      // Lower fabric follows the legs gently, with a smooth centre panel instead
      // of switching rigidly at the centre seam. Idle/gesture leg motion is bounded.
      if (t > .2) {
        const left = smooth((Math.cos(a) + .28) / .56), leg = smooth((t - .2) / .5) * .7
        v.joints = [source.joint.hips!, source.joint.leftUpperLeg!, source.joint.rightUpperLeg!, 0]
        v.weights = [1 - leg, leg * left, leg * (1 - left), 0]
      }
      v.p = p
      v.n = [Math.cos(a), .12, Math.sin(a)]
      v.uv = [i / around, t]
      ring.push(v)
    }
    rings.push(ring)
  }
  for (let row = 0; row < rows; row++) for (let i = 0; i < around; i++) {
    const a = rings[row]![i]!, b = rings[row]![i + 1]!, c = rings[row + 1]![i]!, d = rings[row + 1]![i + 1]!
    cloth.face(a, b, c); cloth.face(b, d, c)
  }
  finishOpening(cloth, trim, .005)
}

const nodeWorld = (document: SourceDocument, at: number, override = new Map<number, V4>()): Matrix4 => {
  const node = document.nodes[at]!
  const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(new Vector3(...(node.translation ?? [0, 0, 0])), new Quaternion(...(override.get(at) ?? node.rotation ?? [0, 0, 0, 1])), new Vector3(...(node.scale ?? [1, 1, 1])))
  const parent = document.nodes.findIndex(n => n.children?.includes(at))
  return parent < 0 ? local : nodeWorld(document, parent, override).multiply(local)
}

/** Use the SDK's actual normalized-to-raw conversion, including rest axes.
 * Creating the humanoid BEFORE reshaping mirrors the live loader's lifecycle. */
function stance(source: Source, spec: AnimeSpec, angle: number): { feet: Map<number, Matrix4>; skinMatrices: Matrix4[]; rotations: Wardrobe['rotations'] } {
  const document = source.document, bones = document.extensions.VRMC_vrm.humanoid.humanBones
  const nodes = document.nodes.map(data => {
    const node = new Object3D()
    if (data.matrix) new Matrix4().fromArray(data.matrix).decompose(node.position, node.quaternion, node.scale)
    else {
      node.position.fromArray(data.translation ?? [0, 0, 0])
      node.quaternion.fromArray(data.rotation ?? [0, 0, 0, 1])
      node.scale.fromArray(data.scale ?? [1, 1, 1])
    }
    return node
  })
  document.nodes.forEach((data, i) => data.children?.forEach(child => nodes[i]!.add(nodes[child]!)))
  const root = new Object3D()
  nodes.filter(node => !node.parent).forEach(node => root.add(node))
  root.updateMatrixWorld(true)
  const rig = new VRMHumanoid(Object.fromEntries(Object.entries(bones).map(([name, data]) => [name, { node: nodes[data.node] }])) as VRMHumanBones)
  const shape = (node: Object3D): ShapeNode => ({
    key: node, rest: document.nodes[nodes.indexOf(node)]!.translation ?? [0, 0, 0],
    setScale: (x, y, z) => { node.scale.set(x, y, z) },
    setTranslation: (x, y, z) => { node.position.set(x, y, z) },
    children: () => node.children.map(shape),
  })
  applyFigure(spec, { bone: name => bones[name] ? shape(nodes[bones[name]!.node]!) : null })
  for (const side of ['left', 'right'] as const) {
    rig.getNormalizedBoneNode(`${side}Foot`)!.rotation.x = angle
    rig.getNormalizedBoneNode(`${side}Toes`)!.rotation.x = -angle
  }
  rig.update(); root.updateMatrixWorld(true)
  const feet = new Map<number, Matrix4>(), rotations: Wardrobe['rotations'] = []
  for (const side of ['left', 'right']) {
    const foot = bones[`${side}Foot`]!.node
    feet.set(foot, nodes[foot]!.matrixWorld.clone())
    if (angle) for (const name of [`${side}Foot`, `${side}Toes`]) {
      const node = bones[name]!.node
      rotations.push({ node, rotation: nodes[node]!.quaternion.toArray() as V4 })
    }
  }
  const skinMatrices = spec.shoes === 'bare' ? document.skins[source.skin]!.joints.map((at, i) => nodes[at]!.matrixWorld.clone().multiply(source.inverses[i]!)) : []
  return { feet, skinMatrices, rotations }
}

/** Compensation for rotated, nonuniformly scaled hip chains. Keep the source
 * foot contour in world Y while retaining its exact influences and lateral
 * shape; blend out above the ankle instead of tilting the whole character. */
function barefootFit(source: Source, skin: WardrobeGeometry, matrices: Matrix4[]): { skin: WardrobeGeometry; lift: number } {
  let minimum = Infinity
  const neutral = source.document.skins[source.skin]!.joints.map((at, i) => nodeWorld(source.document, at).multiply(source.inverses[i]!))
  const positions = skin.positions.slice()
  const local = new Vector3(), world = new Vector3(), rest = new Vector3(), influence = new Vector3()
  const weighted = new Matrix4(), inverse = new Matrix4()
  for (let i = 0; i < skin.positions.length / 3; i++) {
    if (skin.positions[i * 3 + 1]! > .16) continue
    local.fromArray(skin.positions, i * 3); world.set(0, 0, 0); rest.set(0, 0, 0); weighted.elements.fill(0)
    for (let j = 0; j < 4; j++) {
      const weight = skin.weights[i * 4 + j]!
      if (!weight) continue
      const joint = skin.joints[i * 4 + j]!, matrix = matrices[joint]!
      world.addScaledVector(influence.copy(local).applyMatrix4(matrix), weight)
      rest.addScaledVector(influence.copy(local).applyMatrix4(neutral[joint]!), weight)
      matrix.elements.forEach((value, at) => { weighted.elements[at]! += value * weight })
    }
    world.y += (rest.y - world.y) * smooth((.16 - local.y) / .08)
    minimum = Math.min(minimum, world.y)
    inverse.copy(weighted).invert()
    positions.set(world.applyMatrix4(inverse).toArray(), i * 3)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3)); geometry.setIndex(new BufferAttribute(skin.index, 1)); geometry.computeVertexNormals()
  const normals = Float32Array.from(geometry.attributes.normal!.array); geometry.dispose()
  return { skin: { ...skin, positions, normals }, lift: Number.isFinite(minimum) ? .002 - minimum : 0 }
}

function shoes(source: Source, spec: AnimeSpec, upper: Surface, sole: Surface, trim: Surface, feet: Map<number, Matrix4>, lift: number): void {
  const heels = spec.shoes === 'heels', basketball = spec.shoes === 'basketball'
  const around = 64, rows = 12
  for (const side of ['left', 'right'] as const) {
    const footAt = source.document.extensions.VRMC_vrm.humanoid.humanBones[`${side}Foot`]!.node
    const centre = new Vector3().setFromMatrixPosition(nodeWorld(source.document, footAt))
    const bone = source.joint[`${side}Foot`]!
    // Mesh bind pose is A-pose; humanoid node transforms are T-pose. Own shoe
    // shapes are authored in neutral world space, then put into that bind space.
    const neutralToBind = nodeWorld(source.document, footAt).multiply(source.inverses[bone]!).invert()
    const make = (p: V3, uv: [number, number] = [0, 0]): Vertex => ({ p: new Vector3(...p).applyMatrix4(neutralToBind).toArray() as V3, uv, n: [0, 0, 0], joints: [bone, 0, 0, 0], weights: [1, 0, 0, 0] })
    const rings: Vertex[][] = []
    for (let row = 0; row <= rows; row++) {
      const t = row / rows, ring: Vertex[] = []
      for (let i = 0; i <= around; i++) {
        const a = i / around * Math.PI * 2, front = Math.sin(a), sideways = Math.cos(a)
        const tipZ = .052 + front * .131
        const width = .044 + Math.max(0, front) * .010
        const ankleX = heels ? .030 : basketball ? .042 : .037
        const ankleZ = heels ? .054 : .038
        const z = tipZ * (1 - t) + (-.007 + front * ankleZ) * t
        const x = centre.x + sideways * (width * (1 - t) + ankleX * t)
        const ankleY = basketball ? .146 : heels ? .057 + Math.max(0, -front) * .028 : .091
        const rise = smooth(t)
        const y = .025 + (ankleY - .025) * rise + Math.sin(t * Math.PI) * .014
        ring.push(make([x, y, z], [i / around, t]))
      }
      rings.push(ring)
    }
    for (let row = 0; row < rows; row++) for (let i = 0; i < around; i++) {
      const a = rings[row]![i]!, b = rings[row]![i + 1]!, c = rings[row + 1]![i]!, d = rings[row + 1]![i + 1]!
      upper.face(a, c, b); upper.face(b, c, d)
    }
    // A separate sole has an actual closed underside and a shaped sidewall.
    const heelPose = new Matrix4().makeTranslation(0, lift, 0).multiply(feet.get(footAt)!).multiply(source.inverses[bone]!).multiply(neutralToBind)
    const heelInverse = heelPose.clone().invert()
    const top = rings[0]!
    const bindToNeutral = neutralToBind.clone().invert()
    const lower = top.map(v => {
      const p = new Vector3(...v.p).applyMatrix4(bindToNeutral)
      p.y = heels ? .016 : .002
      const support = heels ? smooth((p.z - .055) / .05) : 1
      p.applyMatrix4(heelPose); p.y += (.002 - p.y) * support; p.applyMatrix4(heelInverse)
      return make(p.toArray() as V3, v.uv)
    })
    const centrePoint = new Vector3(centre.x, heels ? .016 : .002, .052).applyMatrix4(heelPose)
    if (!heels) centrePoint.y = .002
    const centreSole = make(centrePoint.applyMatrix4(heelInverse).toArray() as V3)
    for (let i = 0; i < around; i++) {
      sole.face(top[i]!, lower[i]!, top[i + 1]!); sole.face(top[i + 1]!, lower[i]!, lower[i + 1]!)
      sole.face(centreSole, lower[i + 1]!, lower[i]!)
    }
    if (heels) {
      // Author the heel's ground end in the posed world, then pull it back into
      // bind space. Both ends are carried by the same foot; no floating stem.
      const inverse = heelInverse
      const posed = (p: V3) => new Vector3(...p).applyMatrix4(heelPose)
      const back = posed([centre.x, .020, -.045])
      const high: Vertex[] = [], low: Vertex[] = []
      for (let i = 0; i < 24; i++) {
        const a = i / 24 * Math.PI * 2
        high.push(make(new Vector3(back.x + Math.cos(a) * .014, back.y, back.z + Math.sin(a) * .014).applyMatrix4(inverse).toArray() as V3))
        low.push(make(new Vector3(back.x + Math.cos(a) * .009, .002, back.z + Math.sin(a) * .009).applyMatrix4(inverse).toArray() as V3))
      }
      const bottom = make(new Vector3(back.x, .002, back.z).applyMatrix4(inverse).toArray() as V3)
      for (let i = 0; i < 24; i++) { const next = (i + 1) % 24; sole.face(high[i]!, low[i]!, high[next]!); sole.face(high[next]!, low[i]!, low[next]!); sole.face(bottom, low[next]!, low[i]!) }
    } else {
      // Four pairs of fitted lace strips, seated on the actual upper surface.
      for (const row of [5, 6, 7, 8]) {
        const t = row / rows, frontY = .025 + ((basketball ? .146 : .091) - .025) * smooth(t) + Math.sin(t * Math.PI) * .014
        const frontZ = .183 * (1 - t) + .031 * t
        const half = .020 * (1 - t * .35)
        const a = make([centre.x - half, frontY + .002, frontZ - .003]), b = make([centre.x + half, frontY + .002, frontZ - .003])
        const c = make([centre.x - half, frontY + .0025, frontZ + .003]), d = make([centre.x + half, frontY + .0025, frontZ + .003])
        trim.face(a, c, b); trim.face(b, c, d)
      }
    }
  }
  upper.calculateNormals()
  finishOpening(upper, trim, .004)
}

export function wardrobeKey(spec: AnimeSpec): string {
  return hasWardrobe(spec) ? `${spec.top}:${spec.bottom}:${spec.shoes}:${spec.sex}:${spec.hip}:${spec.waist}:${spec.bust}:${spec.shoulder}:${spec.head}` : 'seed'
}

/** Bone-scale edits reuse the tailored skin/cloth; only shoe contact is refit. */
function clothes(source: Source, spec: AnimeSpec): WardrobeGeometry[] {
  const key = `${spec.top}:${spec.bottom}:${spec.shoes}:${spec.sex}:${spec.bust}`
  const hit = source.clothes.get(key)
  if (hit) return hit
  const shaped = sculpt(source, spec)
  const top = topCuts(spec, source), bottom = bottomCuts(spec)
  const parts: WardrobeGeometry[] = []
  const shirt = new Surface(), pants = new Surface(), shirtTrim = new Surface(), pantsTrim = new Surface()
  const skirtMode = spec.bottom === 'skirtLong' || spec.bottom === 'skirtShort'
  const footTop = spec.shoes === 'basketball' ? .148 : spec.shoes === 'dress' ? .088 : .038
  const coverFeet: Cut[] = [v => footTop - v.p[1]]
  for (const [triangles, name, paint] of [[source.body, 'wardrobe_skin', 'skin'], [source.arm, 'wardrobe_arm_skin', 'armSkin']] as const) {
    const skin = new Surface()
    for (const original of triangles) {
      const triangle = original.map(v => shaped.get(v)!)
      let exposed = uncover(triangle, top).flatMap(t => uncover(t, bottom))
      if (spec.shoes !== 'bare') exposed = exposed.flatMap(t => uncover(t, coverFeet))
      skin.triangles(exposed)
      const offset = (v: Vertex, bottom: boolean): Vertex => {
        const gap = bottom ? .013 + (spec.bottom === 'trousers' ? smooth((.63 - v.p[1]) / .48) * .013 : .004) : .009
        return { ...v, p: v.p.map((n, i) => n + v.n[i]! * gap) as V3 }
      }
      shirt.triangles(keep(triangle, top).map(t => t.map(v => offset(v, false))))
      if (!skirtMode) pants.triangles(keep(triangle, bottom).map(t => t.map(v => offset(v, true))))
    }
    parts.push(skin.shape(name, paint))
  }
  finishOpening(shirt, shirtTrim)
  if (skirtMode) skirt(source, spec, pants, pantsTrim)
  else finishOpening(pants, pantsTrim)
  parts.push(shirt.shape('wardrobe_top', 'top'), shirtTrim.shape('wardrobe_top_binding', 'topTrim', true), pants.shape('wardrobe_bottom', 'bottom', skirtMode), pantsTrim.shape('wardrobe_bottom_binding', 'bottomTrim', true))
  source.clothes.set(key, parts)
  if (source.clothes.size > 12) source.clothes.delete(source.clothes.keys().next().value!)
  return parts
}

export function buildWardrobe(buffer: ArrayBuffer, spec: AnimeSpec): Wardrobe | null {
  if (!hasWardrobe(spec)) return null
  const source = sourceData(buffer), key = wardrobeKey(spec)
  const hit = source.looks.get(key)
  if (hit) return hit
  const parts = [...clothes(source, spec)]
  const heels = spec.shoes === 'heels', heelAngle = heels ? .31 : 0
  const fitted = stance(source, spec, heelAngle)
  let lift = heels ? .052 : 0
  if (spec.shoes === 'bare') {
    const at = parts.findIndex(part => part.paint === 'skin')
    const bare = barefootFit(source, parts[at]!, fitted.skinMatrices)
    parts[at] = bare.skin; lift = bare.lift
  }
  if (spec.shoes !== 'bare') {
    const upper = new Surface(), sole = new Surface(), trim = new Surface()
    shoes(source, spec, upper, sole, trim, fitted.feet, lift)
    parts.push(upper.shape('wardrobe_shoes', 'shoe', true), sole.shape('wardrobe_soles', 'sole', true), trim.shape('wardrobe_shoe_binding', 'shoeTrim', true))
  }
  const result = { skin: source.skin, parts: parts.filter(part => part.index.length), lift, heelAngle, rotations: fitted.rotations }
  source.looks.set(key, result)
  if (source.looks.size > 12) source.looks.delete(source.looks.keys().next().value!)
  return result
}

/** Linear material factors, identical on-screen and in glTF. */
export function wardrobeColour(paint: WardrobePaint, spec: AnimeSpec): V3 {
  const colour = new Vector3()
  const hex = paint === 'armSkin' ? 'FFEDD1' : paint === 'top' || paint === 'topTrim' ? spec.outfitColour : paint === 'bottom' || paint === 'bottomTrim' ? spec.bottomColour : paint === 'sole' ? 'D7DCE3' : paint === 'shoeTrim' ? '526273' : spec.shoeColour
  const channels = [0, 2, 4].map(at => { const s = parseInt(hex.slice(at, at + 2), 16) / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4 }) as V3
  colour.fromArray(channels)
  if (paint === 'topTrim' || paint === 'bottomTrim') colour.multiplyScalar(.78)
  if (paint === 'armSkin') {
    const tint = [0, 2, 4].map(at => { const s = parseInt(spec.skinColour.slice(at, at + 2), 16) / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4 })
    colour.multiply(new Vector3(...tint as V3))
  }
  return colour.toArray() as V3
}

export function wardrobeShade(paint: WardrobePaint, spec: AnimeSpec): V3 {
  const base = wardrobeColour(paint, spec)
  // Match the source skin's warm toon shadow, rather than the tunic's grey.
  return base.map((c, i) => c * (paint === 'armSkin' ? [1, .613979936, .5079454][i]! : .76)) as V3
}
