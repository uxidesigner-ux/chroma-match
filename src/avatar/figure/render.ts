/**
 * The scene: materials, lights and the one call that paints a figure.
 *
 * The lighting is the reason this moved off the ray marcher. A marched soft
 * shadow is a fixed number of steps along a ray, and the count it can afford
 * is what produced the banding on the wall and the stripes across the figure
 * that kept coming back. A shadow map with a soft filter has neither failure
 * mode, and an irradiance probe gives the three materials somewhere to reflect,
 * which is what lets skin, wool and hair read as three different surfaces in
 * the same light rather than three colours of the same clay.
 */

import {
  ACESFilmicToneMapping,
  type BufferGeometry,
  type Material,
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  type Texture,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { bodyGeometry } from './body'
import { earGeometry, earPosition, eyeGeometry, eyePosition, headGeometry } from './head'
import { lockGeometry, scalpGeometry, type Lock } from './hair'
import { collarGeometry, NECKLINE_Y, sleeveGeometry, topGeometry } from './top'
import { bodyAxes } from './body'

export interface FigureLook {
  skin: string
  hair: string
  cloth: string
  backdrop: string
}

/**
 * The long wave. Seven bands: two that leave the parting and cover the temple,
 * two that fall in front of each shoulder, one behind each ear, and a wide one
 * down the back. They are at different depths so they cross, and crossing is
 * what makes a head of hair instead of a helmet.
 */
export const LONG_WAVE: Lock[] = [
  // Wide and flat, not round, and overlapping rather than spaced. The first
  // version used narrow bands with gaps between them and it read as a pair of
  // headphones: hair is one mass with divisions in it, so the bands have to be
  // wider than the gaps and sit close enough to the skull to be part of it.
  //
  // The two that leave the parting and cover the temple.
  { path: [[0.10, 0.92, 0.14], [0.50, 0.70, 0.34], [0.72, 0.14, 0.24], [0.76, -0.50, 0.06]],
    width: [0.44, 0.34], thick: [0.11, 0.08], belly: 0.5 },
  { path: [[-0.03, 0.95, 0.12], [-0.44, 0.76, 0.30], [-0.68, 0.22, 0.22], [-0.73, -0.42, 0.08]],
    width: [0.41, 0.32], thick: [0.10, 0.07], belly: 0.5 },
  // The lengths in front of the shoulder, waving out and back in.
  { path: [[0.70, 0.12, 0.18], [0.86, -0.66, 0.30], [0.74, -1.52, 0.42], [0.88, -2.34, 0.30], [0.70, -3.05, 0.10]],
    width: [0.52, 0.16], thick: [0.15, 0.06], belly: 0.34 },
  { path: [[-0.67, 0.16, 0.16], [-0.84, -0.60, 0.28], [-0.71, -1.46, 0.40], [-0.85, -2.28, 0.28], [-0.66, -2.98, 0.08]],
    width: [0.50, 0.16], thick: [0.14, 0.06], belly: 0.34 },
  // Behind the ear, wider still, falling straighter and further back. These
  // are what fill the outline between the front lengths and the back.
  { path: [[0.66, 0.40, -0.28], [0.92, -0.58, -0.34], [1.00, -1.58, -0.24], [0.86, -2.62, -0.06]],
    width: [0.58, 0.26], thick: [0.17, 0.08], belly: 0.42 },
  { path: [[-0.64, 0.44, -0.30], [-0.90, -0.54, -0.36], [-0.98, -1.54, -0.26], [-0.82, -2.58, -0.08]],
    width: [0.56, 0.26], thick: [0.16, 0.08], belly: 0.42 },
  // The back of the head, one wide band that the rest tuck under.
  { path: [[0.0, 0.70, -0.58], [0.0, -0.26, -0.74], [0.06, -1.36, -0.66], [0.0, -2.50, -0.44]],
    width: [0.80, 0.52], thick: [0.26, 0.14], belly: 0.45 },
]

function materials(look: FigureLook) {
  const skin = new MeshPhysicalMaterial({
    color: new Color(look.skin),
    roughness: 0.74,
    clearcoat: 0.14,
    clearcoatRoughness: 0.66,
    sheen: 0.45,
    sheenColor: new Color('#FF9E86'),
    sheenRoughness: 0.85,
  })
  const hair = new MeshPhysicalMaterial({
    color: new Color(look.hair),
    // Hair is glossy but it is not varnished. A strong clearcoat over a dark
    // colour reflects the room more than it shows its own colour, and the
    // result is the grey plastic the first render came out as.
    // No clearcoat at all. A clearcoat is a varnish, and a varnish over a dark
    // colour is the black-plastic look. The sheen hair actually has is a broad
    // soft band, which is a rough dielectric, not a polished one.
    roughness: 0.56,
    clearcoat: 0.0,
  })
  // Wool: a broad sheen and no clearcoat at all. Clearcoat is a film over a
  // surface — it is what makes a jumper look like painted plastic.
  // Wool. The sheen is tinted towards the cloth's own colour and kept low: a
  // white sheen at full strength over a dark colour lifts the whole garment to
  // grey, which is what the first render of this did to a near-black jumper.
  const clothColour = new Color(look.cloth)
  const cloth = new MeshPhysicalMaterial({
    color: clothColour,
    roughness: 0.94,
    sheen: 0.30,
    sheenColor: clothColour.clone().lerp(new Color('#FFFFFF'), 0.30),
    sheenRoughness: 0.80,
  })
  const eye = new MeshPhysicalMaterial({
    color: new Color('#2B2220'),
    roughness: 0.28,
    clearcoat: 0.8,
    clearcoatRoughness: 0.16,
  })
  return { skin, hair, cloth, eye }
}

export interface FigureOptions {
  /** Vertical centre of the frame, in head units. */
  aim?: number
  /** How much of the figure fits: larger is further away. */
  spread?: number
  hair?: Lock[] | null
}

/**
 * One renderer for the whole app, and one environment probe.
 *
 * A renderer per canvas does not work: a browser keeps only about sixteen live
 * WebGL contexts and quietly drops the oldest, and the wardrobe alone paints
 * more swatches than that. The first version of this did exactly that and hung
 * the page. So the scene is drawn once into a shared offscreen context and the
 * pixels are copied into whichever 2D canvas asked for them — which is also how
 * the renderer this replaces worked, for the same reason.
 */
let shared: { renderer: WebGLRenderer; environment: Texture } | null = null

function sharedRenderer(): { renderer: WebGLRenderer; environment: Texture } {
  if (shared) return shared
  const renderer = new WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(1)
  renderer.outputColorSpace = SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  const pmrem = new PMREMGenerator(renderer)
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture
  pmrem.dispose()
  shared = { renderer, environment }
  return shared
}

export function renderFigure(
  canvas: HTMLCanvasElement,
  look: FigureLook,
  size: number,
  aspect: number,
  options: FigureOptions = {},
): void {
  const ratio = Math.min(2, globalThis.devicePixelRatio || 1)
  const width = Math.round(size * ratio)
  const height = Math.round(size * aspect * ratio)
  const { renderer, environment } = sharedRenderer()
  renderer.setSize(width, height, false)

  const scene = new Scene()
  scene.background = new Color(look.backdrop)
  scene.environment = environment
  // The probe is a lit studio box. At full strength it is brighter than the
  // key light, which is what turned a near-black jumper grey and put a mirror
  // streak down every lock of hair. It is here to give the materials somewhere
  // to reflect, not to light the scene.
  scene.environmentIntensity = 0.30

  const aim = options.aim ?? -1.45
  const spread = options.spread ?? 12.0
  const camera = new PerspectiveCamera(24, width / height, 0.5, 80)
  camera.position.set(0, aim, spread)
  camera.lookAt(0, aim, 0)

  const key = new DirectionalLight(0xfff3ea, 2.5)
  key.position.set(-3.4, 4.6, 6.0)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.radius = 9
  key.shadow.bias = -0.0008
  const shadowCam = key.shadow.camera
  shadowCam.left = -5
  shadowCam.right = 5
  shadowCam.top = 5
  shadowCam.bottom = -5
  shadowCam.near = 0.5
  shadowCam.far = 24
  const fill = new DirectionalLight(0xd9e4ff, 0.6)
  fill.position.set(4.5, 0.8, 3.2)
  const rim = new DirectionalLight(0xffffff, 0.8)
  rim.position.set(1.2, 2.0, -5.0)
  scene.add(key, fill, rim, new AmbientLight(0xffffff, 0.2))

  const m = materials(look)
  const group = new Group()
  scene.add(group)

  const add = (geometry: BufferGeometry, material: Material) => {
    const mesh = new Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }

  add(bodyGeometry(), m.skin)
  add(headGeometry(), m.skin)
  for (const side of [-1, 1]) {
    add(earGeometry(), m.skin).position.copy(earPosition(side))
    const e = add(eyeGeometry(), m.eye)
    e.position.copy(eyePosition(side))
    e.castShadow = false
  }
  add(topGeometry(), m.cloth)
  const collar = add(collarGeometry(), m.cloth)
  collar.position.y = NECKLINE_Y
  collar.rotation.x = Math.PI / 2
  for (const side of [-1, 1]) add(sleeveGeometry(side), m.cloth)

  const locks = options.hair === undefined ? LONG_WAVE : options.hair
  if (locks) {
    add(scalpGeometry(), m.hair)
    for (const lock of locks) add(lockGeometry(lock), m.hair)
  }

  renderer.render(scene, camera)

  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx) ctx.drawImage(renderer.domElement, 0, 0)

  // Every geometry here was built for this one call, so it is this call's job
  // to give the buffers back. Without it the wardrobe leaks a head, a body, a
  // jumper and seven locks of hair for every swatch it paints.
  scene.traverse((object) => {
    const mesh = object as Mesh
    if (mesh.isMesh) mesh.geometry.dispose()
  })
  for (const material of Object.values(m)) material.dispose()
}

export { bodyAxes }
