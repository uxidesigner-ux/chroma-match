export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
  rot: number
  spin: number
}

export interface FloatingText {
  x: number
  y: number
  text: string
  life: number
  maxLife: number
  color: string
  scale: number
}

import { boardStyle } from './theme.ts'
import { reducedMotion } from './motion.ts'

export const EFFECT_LIMITS = { particles: 180, impacts: 12, texts: 8 } as const
interface Impact {
  x: number
  y: number
  color: string
  radius: number
  life: number
  maxLife: number
}

const GRAVITY = 900
/**
 * Air resistance, per second.
 *
 * Confetti thrown at a constant velocity until gravity catches it reads as
 * pixels being moved. Real debris loses most of its speed in the first few
 * frames and then falls, which is what makes the first frame after a match feel
 * like a hit rather than an animation starting.
 */
const DRAG = 2.6

/** A tiny, allocation-light pool for the confetti that a match throws off. */
export class Effects {
  private particles: Particle[] = []
  private texts: FloatingText[] = []
  private impacts: Impact[] = []

  private calm: () => boolean

  constructor(calm: () => boolean = reducedMotion) {
    this.calm = calm
  }

  /** Local shockwave and radial glints; never a screen-sized flash. */
  impact(x: number, y: number, color: string, radius: number): void {
    if (this.calm()) return
    if (this.impacts.length >= EFFECT_LIMITS.impacts) this.impacts.shift()
    this.impacts.push({ x, y, color, radius, life: 0.48, maxLife: 0.48 })
  }

  get counts(): Readonly<{ particles: number; impacts: number; texts: number }> {
    return { particles: this.particles.length, impacts: this.impacts.length, texts: this.texts.length }
  }

  burst(x: number, y: number, color: string, count = 10): void {
    if (this.calm()) return
    const available = Math.max(0, EFFECT_LIMITS.particles - this.particles.length)
    for (let i = 0; i < Math.min(count, available); i++) {
      const a = Math.random() * Math.PI * 2
      const speed = 210 + Math.random() * 330
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 90,
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8,
        size: 2 + Math.random() * 4,
        color,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 14,
      })
    }
  }

  float(x: number, y: number, text: string, color: string, scale = 1): void {
    if (this.texts.length >= EFFECT_LIMITS.texts) this.texts.shift()
    this.texts.push({ x, y, text, life: 0.95, maxLife: 0.95, color, scale })
  }

  update(dt: number): void {
    const calm = this.calm()
    if (calm) {
      this.particles.length = 0
      this.impacts.length = 0
    }
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const impact = this.impacts[i]!
      impact.life -= dt
      if (impact.life <= 0) this.impacts.splice(i, 1)
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i] as Particle
      p.life -= dt
      if (p.life <= 0) {
        this.particles.splice(i, 1)
        continue
      }
      const slow = Math.max(0, 1 - DRAG * dt)
      p.vx *= slow
      p.vy = p.vy * slow + GRAVITY * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.spin * dt
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i] as FloatingText
      t.life -= dt
      if (t.life <= 0) this.texts.splice(i, 1)
      else if (!calm) t.y -= 46 * dt
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const calm = this.calm()
    for (const impact of calm ? [] : this.impacts) {
      const age = 1 - impact.life / impact.maxLife
      const reach = 1 - (1 - age) ** 3
      const radius = impact.radius * (0.2 + reach * 0.8)
      ctx.save()
      ctx.translate(impact.x, impact.y)
      ctx.globalAlpha = (1 - age) * 0.75
      ctx.strokeStyle = impact.color
      ctx.lineWidth = 2.5 * (1 - age) + 0.5
      ctx.beginPath()
      ctx.arc(0, 0, radius * 0.72, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4
        ctx.moveTo(Math.cos(angle) * radius * 0.85, Math.sin(angle) * radius * 0.85)
        ctx.lineTo(Math.cos(angle) * radius * 1.12, Math.sin(angle) * radius * 1.12)
      }
      ctx.stroke()
      ctx.restore()
    }
    for (const p of calm ? [] : this.particles) {
      const left = Math.min(1, p.life / (p.maxLife * 0.6))
      ctx.save()
      ctx.globalAlpha = left
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      // Shrinking on the way out, not only fading: a chip that disappears at
      // full size reads as a frame being dropped.
      const size = p.size * (0.35 + left * 0.65)
      ctx.fillRect(-size / 2, -size / 2, size, size * 1.6)
      ctx.restore()
    }

    const halo = boardStyle().textHalo
    for (const t of this.texts) {
      const k = 1 - t.life / t.maxLife
      const alpha = Math.min(1, (1 - k) * 2.2)
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.translate(t.x, t.y)
      const pop = calm ? 1 : 0.88 + 0.12 * Math.min(1, k * 5)
      ctx.scale(t.scale * pop, t.scale * pop)
      ctx.font = '700 22px ui-rounded, "SF Pro Rounded", system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 5
      ctx.strokeStyle = halo
      ctx.strokeText(t.text, 0, 0)
      ctx.fillStyle = t.color
      ctx.fillText(t.text, 0, 0)
      ctx.restore()
    }
  }

  clear(): void {
    this.particles.length = 0
    this.texts.length = 0
    this.impacts.length = 0
  }
}
