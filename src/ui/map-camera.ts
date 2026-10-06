import { growthCopy } from './growth-copy.ts'
import { onLanguageChange } from '../i18n/index.ts'

export interface MapPoint { x: number; y: number }
const WIDTH = 1024, HEIGHT = 1536
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))
/** DOM controls retain a 52px screen target independently of the scene camera. */
export class MapCamera {
  mode: 'world' | 'region' = 'world'
  private scale = 1
  private x = 0
  private y = 0
  private pointers = new Map<number, MapPoint>()
  private initial: { point: MapPoint; x: number; y: number; distance: number; scale: number } | null = null
  private moved = false
  private controls = document.createElement('div')
  private lastRegion: { x: number; y: number; scale: number } | null = null
  constructor(private viewport: HTMLElement, private plane: HTMLElement, private onWorld: () => void) {
    viewport.tabIndex = 0
    viewport.setAttribute('role', 'group')
    this.controls.className = 'map-camera-controls'
    this.controls.innerHTML = '<button type="button" data-camera="world">⌖</button><button type="button" data-camera="focus">◎</button><button type="button" data-camera="out">−</button><button type="button" data-camera="in">+</button>'
    viewport.parentElement!.append(this.controls)
    for (const button of this.controls.querySelectorAll<HTMLButtonElement>('button')) button.addEventListener('click', () => {
      if (button.dataset.camera === 'world') this.onWorld()
      else if (button.dataset.camera === 'focus') viewport.dispatchEvent(new CustomEvent('mapfocus'))
      else if (this.mode === 'region') this.zoom(this.scale * (button.dataset.camera === 'in' ? 1.2 : 1/1.2))
    })
    viewport.addEventListener('pointerdown', event => {
      if (this.mode !== 'region') return
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (!this.pointers.size) {
        // Pick up the rendered camera, not the animation's distant endpoint.
        const matrix = new DOMMatrix(getComputedStyle(plane).transform)
        this.x = matrix.m41; this.y = matrix.m42; this.scale = matrix.a
        this.moved = false
      }
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      this.apply(false)
      // Capture background touches immediately, even if the finger exits the
      // viewport before crossing the drag threshold. Keep native node taps.
      if (!(event.target as Element).closest('button')) viewport.setPointerCapture(event.pointerId)
      this.captureStart()
    })
    viewport.addEventListener('dragstart', event => event.preventDefault())
    viewport.addEventListener('pointermove', event => {
      if (!this.pointers.has(event.pointerId) || !this.initial) return
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      const point = this.midpoint(), start = this.initial, distance = this.distance()
      if (this.moved || Math.hypot(point.x - start.point.x, point.y - start.point.y) > 6 || this.pointers.size > 1) {
        event.preventDefault()
        this.moved = true; viewport.setPointerCapture(event.pointerId)
        viewport.dataset.dragging = 'true'
        if (this.pointers.size > 1 && start.distance) {
          const next = clamp(start.scale * distance / start.distance, this.minimum(), this.maximum())
          const bounds = viewport.getBoundingClientRect()
          this.x = point.x - bounds.x - (start.point.x - bounds.x - start.x) * next / start.scale
          this.y = point.y - bounds.y - (start.point.y - bounds.y - start.y) * next / start.scale
          this.scale = next
        } else { this.x = start.x + point.x - start.point.x; this.y = start.y + point.y - start.point.y }
        this.apply(false)
      }
    })
    const end = (event: PointerEvent) => {
      this.pointers.delete(event.pointerId)
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId)
      if (this.pointers.size) this.captureStart(); else {
        this.initial = null; delete viewport.dataset.dragging
        if (this.scale < this.minimum()) this.zoom(this.minimum(),undefined,true)
      }
    }
    viewport.addEventListener('pointerup', end)
    viewport.addEventListener('pointercancel', event => { end(event); if (!this.pointers.size) this.moved = false })
    viewport.addEventListener('lostpointercapture', event => {
      // A normal pointerup already removed this pointer. Only unexpected
      // capture loss cancels the gesture; preserve suppression of drag clicks.
      if (this.pointers.has(event.pointerId)) { end(event); if (!this.pointers.size) this.moved = false }
    })
    viewport.addEventListener('click', event => {
      if (this.moved && event.detail !== 0) { event.preventDefault(); event.stopPropagation() }
      this.moved = false
    }, true)
    viewport.addEventListener('wheel', event => {
      if (this.mode !== 'region') return
      // Ctrl-wheel belongs to browser accessibility zoom, never intercept it.
      if (event.ctrlKey || event.metaKey) return
      const bounds = viewport.getBoundingClientRect()
      event.preventDefault(); this.zoom(this.scale * (event.deltaY < 0 ? 1.1 : 1/1.1), { x: event.clientX - bounds.x, y: event.clientY - bounds.y })
    }, { passive: false })
    viewport.addEventListener('keydown', event => {
      if (event.target !== viewport || this.mode !== 'region') return
      if (event.key === '+' || event.key === '=') { event.preventDefault(); this.zoom(this.scale * 1.2) }
      else if (event.key === '-') { event.preventDefault(); this.zoom(this.scale / 1.2) }
      else if (event.key === 'Home') { event.preventDefault(); viewport.dispatchEvent(new CustomEvent('mapfocus')) }
      else if (event.key === 'Escape') { event.preventDefault(); this.onWorld() }
      else if (event.key.startsWith('Arrow')) {
        event.preventDefault()
        this.x += event.key === 'ArrowRight' ? -90 : event.key === 'ArrowLeft' ? 90 : 0
        this.y += event.key === 'ArrowDown' ? -90 : event.key === 'ArrowUp' ? 90 : 0
        this.apply(true)
      }
    })
    new ResizeObserver(() => {
      const bounds = viewport.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return // Hidden hub tabs must not destroy the camera.
      if (this.mode === 'world') this.overview(false); else this.apply(false)
      viewport.dispatchEvent(new CustomEvent('mapresize'))
    }).observe(viewport)
    // Error/continue copy changes the action dock's height without resizing
    // the viewport. Re-fit landmarks when that reserved space changes too.
    const chromeObserver = new ResizeObserver(() => {
      if (viewport.getBoundingClientRect().width) viewport.dispatchEvent(new CustomEvent('mapresize'))
    })
    chromeObserver.observe(viewport.parentElement!.querySelector('.world-footer')!)
    chromeObserver.observe(document.querySelector('.world-header')!)
    onLanguageChange(() => this.labels())
    this.labels(); this.overview(false)
  }
  private labels(): void {
    const copy = growthCopy()
    this.viewport.setAttribute('aria-label', copy.move)
    for (const [key, name] of [['world',copy.fullMap],['focus',copy.focus],['in',copy.zoomIn],['out',copy.zoomOut]]) {
      const button = this.controls.querySelector<HTMLButtonElement>(`[data-camera="${key}"]`)!
      button.setAttribute('aria-label', name!); button.title = name!
    }
  }
  overview(animate = true): void {
    if (this.mode === 'region') this.lastRegion = { x: this.x, y: this.y, scale: this.scale }
    this.mode = 'world'
    const bounds = this.viewport.getBoundingClientRect()
    const width = this.wide ? 1672 : WIDTH, height = this.wide ? 941 : HEIGHT
    this.plane.style.width = `${width}px`; this.plane.style.height = `${height}px`
    this.scale = Math.max(.1, bounds.width / width, bounds.height / height)
    this.x = (bounds.width - width * this.scale) / 2
    this.y = (bounds.height - height * this.scale) / 2
    this.apply(animate)
  }
  focus(point: MapPoint, fresh = false, animate = true): void {
    this.mode = 'region'
    this.plane.style.width = `${WIDTH}px`; this.plane.style.height = `${HEIGHT}px`
    const bounds = this.viewport.getBoundingClientRect()
    this.scale = fresh ? Math.max(1,this.minimum()) : Math.max(this.minimum(), this.scale)
    this.x = bounds.width / 2 - point.x * WIDTH * this.scale
    this.y = (bounds.height < 540 ? bounds.height * .42 : 120 + (bounds.height - 346) / 2) - point.y * HEIGHT * this.scale
    this.apply(animate)
  }
  reveal(point: MapPoint, keyboard: boolean): void {
    const bounds=this.viewport.getBoundingClientRect()
    // Focus can arrive during a camera transition. Its current DOM rectangle
    // may be visible while the destination is offscreen; use target coordinates.
    const x=this.x+point.x*WIDTH*this.scale, y=this.y+point.y*HEIGHT*this.scale
    if(keyboard || x<26 || x>bounds.width-26 || y<26 || y>bounds.height-26) this.focus(point,false,false)
  }
  restoreRegion(point: MapPoint): void {
    if (!this.lastRegion) { this.focus(point, true); return }
    this.mode = 'region'; Object.assign(this, this.lastRegion); this.apply(true)
  }
  get wide(): boolean { const r = this.viewport.getBoundingClientRect(); return r.width > r.height * 1.15 }
  /** Keep native overview landmarks clear of fixed chrome when cover crops the artwork. */
  worldPosition(point: MapPoint, index: number): MapPoint {
    const bounds = this.viewport.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return point
    const width = this.wide ? 1672 : WIDTH, height = this.wide ? 941 : HEIGHT
    const short = bounds.height <= 540 && bounds.width >= 480
    const top = document.querySelector('.hub-header')?.getBoundingClientRect().bottom ?? 112
    const bottom = document.querySelector('.world-footer')!.getBoundingClientRect().top
    const pins = [...document.querySelectorAll<HTMLElement>('.world-plane .world-pin')]
    const half = Math.max(short ? 34 : 40, ...pins.map(pin => pin.offsetHeight / 2)) + 10
    const low = Math.min(top + half, bottom - half)
    const high = Math.max(low, bottom - half)
    const sx = short ? bounds.width * [.13,.38,.63,.87][index]!
      : Math.max(58, Math.min(bounds.width - (bounds.width < 760 ? 122 : 72), this.x + point.x * width * this.scale))
    const sy = short ? (low + high)/2 : Math.max(low, Math.min(high, this.y + point.y * height * this.scale))
    return { x: (sx - this.x) / (width * this.scale), y: (sy - this.y) / (height * this.scale) }
  }
  private zoom(next: number, point?: MapPoint, animate = false): void {
    const bounds = this.viewport.getBoundingClientRect(), origin = point ?? { x: bounds.width / 2, y: bounds.height / 2 }
    next = clamp(next,this.minimum(),this.maximum())
    this.x = origin.x - (origin.x - this.x) * next / this.scale
    this.y = origin.y - (origin.y - this.y) * next / this.scale
    this.scale = next; this.apply(animate)
  }
  private captureStart(): void { this.initial = { point: this.midpoint(), x: this.x, y: this.y, distance: this.distance(), scale: this.scale } }
  private minimum(): number { const r = this.viewport.getBoundingClientRect(); return Math.max(1.4,r.width/WIDTH,r.height/HEIGHT) }
  private maximum(): number { return Math.max(2.2,this.minimum()*1.8) }
  private midpoint(): MapPoint { const points = [...this.pointers.values()]; return { x: points.reduce((s,p)=>s+p.x,0)/points.length, y: points.reduce((s,p)=>s+p.y,0)/points.length } }
  private distance(): number { const points = [...this.pointers.values()]; return points.length > 1 ? Math.hypot(points[0]!.x-points[1]!.x,points[0]!.y-points[1]!.y) : 0 }
  private apply(animate: boolean): void {
    if (this.mode === 'region') {
      const bounds = this.viewport.getBoundingClientRect()
      // A gesture may interrupt an overview→region scale transition. Preserve
      // that rendered scale until release rather than jumping under the finger.
      if (!this.pointers.size) this.scale = Math.max(this.scale,this.minimum())
      const dx = bounds.width-WIDTH*this.scale, dy = bounds.height-HEIGHT*this.scale
      this.x = dx > 0 ? dx/2 : clamp(this.x, dx, 0)
      this.y = dy > 0 ? dy/2 : clamp(this.y, dy, 0)
    }
    this.plane.style.transition = animate && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'transform 240ms cubic-bezier(.2,.8,.2,1)' : 'none'
    this.plane.style.transform = `translate(${this.x}px,${this.y}px) scale(${this.scale})`
    this.plane.style.setProperty('--camera-inverse',String(1/this.scale))
    this.viewport.parentElement!.dataset.mapView = this.mode
    for (const button of this.controls.querySelectorAll<HTMLButtonElement>('[data-camera="in"], [data-camera="out"]')) button.disabled = this.mode !== 'region'
  }
}
