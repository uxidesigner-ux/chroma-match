import type { Game } from '../game/game.ts'
import { goalLabel } from '../game/goals.ts'
import { n, t } from '../i18n/index.ts'
import { gemName } from '../i18n/gems.ts'
import { myAvatar, paintAvatar } from '../avatar/store.ts'
import { styleFor } from '../render/theme.ts'
import { gemPath } from '../render/shapes.ts'
import { reducedMotion } from '../render/motion.ts'
import { playCopy } from './play-copy.ts'
import { experienceCopy } from './experience-copy.ts'
import { hasPortrait } from '../avatar/anime-portrait.ts'

const el = (id: string) => document.getElementById(id)!
type Reaction = 'pop' | 'power' | 'fusion' | 'chain' | 'clear'

/** Three equally weighted readouts, driven by the same events as the board. */
export class Hud {
  private last = ''
  private reaction = el('hud-character')
  private animation: Animation | undefined
  private sparks: Animation | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private sequence = 0

  constructor() {
    this.refreshAvatar()
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => {
      if (event.matches) { this.animation?.cancel(); this.sparks?.cancel() }
    })
  }
  refreshAvatar(): void {
    clearTimeout(this.timer)
    this.sequence++
    paintAvatar(el('hud-avatar') as HTMLCanvasElement, myAvatar(), 112, { round: true })
  }
  invalidate(): void { this.last = '' }
  reset(): void {
    clearTimeout(this.timer)
    this.animation?.cancel(); this.sparks?.cancel()
    this.reaction.dataset.reaction = 'ready'
    el('hud-reaction').textContent = playCopy().ready
    this.refreshAvatar()
  }
  react(kind: Reaction, chain = 1): void {
    clearTimeout(this.timer)
    this.animation?.cancel(); this.sparks?.cancel()
    this.reaction.dataset.reaction = kind
    this.reaction.dataset.sequence = String(++this.sequence)
    el('hud-reaction').textContent = kind === 'chain' ? `${playCopy().chain} ×${chain}` : playCopy()[kind]
    const expression = kind === 'fusion' || kind === 'power' ? 'surprised'
      : kind === 'pop' ? 'relaxed' : 'happy'
    const look = { ...myAvatar(), expression } as const
    if (hasPortrait(look)) {
      paintAvatar(el('hud-avatar') as HTMLCanvasElement, look, 112, { round: true })
      this.reaction.dataset.expression = expression
    }
    if (!reducedMotion()) {
      const face = this.reaction.querySelector('.hud-face')!
      const tilt = this.sequence % 2 ? -1 : 1
      const frames: Record<Reaction, Keyframe[]> = {
        pop: [{ transform: 'scale(1)' }, { transform: `translateY(-3px) rotate(${tilt * 7}deg) scale(1.04)` }, { transform: 'scale(1)' }],
        power: [{ transform: 'scale(.96)' }, { transform: 'scale(1.08) rotate(-8deg)' }, { transform: 'scale(1)' }],
        fusion: [{ transform: 'rotate(-10deg) scale(.96)' }, { transform: 'rotate(10deg) scale(1.1)' }, { transform: 'rotate(0) scale(1)' }],
        chain: [{ transform: `rotate(${-tilt * 7}deg)` }, { transform: `translateY(-4px) rotate(${tilt * 9}deg) scale(1.07)` }, { transform: 'rotate(0) scale(1)' }],
        clear: [{ transform: 'scale(1)' }, { transform: 'translateY(-4px) scale(1.1)' }, { transform: 'scale(1)' }],
      }
      this.animation = face.animate(frames[kind], { duration: kind === 'pop' ? 420 : 650, easing: 'cubic-bezier(.22,1,.36,1)' })
      this.sparks = this.reaction.querySelector('.hud-sparks')!.animate([
        { opacity: 0, transform: 'scale(.5) rotate(-25deg)' },
        { opacity: 1, offset: .3 }, { opacity: 0, transform: 'scale(1.8) rotate(35deg)' },
      ], { duration: 700 })
    }
    this.timer = setTimeout(() => {
      this.reaction.dataset.reaction = 'ready'
      el('hud-reaction').textContent = playCopy().ready
      this.reaction.dataset.expression = myAvatar().expression
      this.refreshAvatar()
    }, 1400)
  }

  update(game: Game, _best?: number): void {
    const copy = experienceCopy()
    const what = goalLabel(game.goal, gemName, { score: copy.scoreGoal, power: copy.powerGoal, gems: colour => t('goalGems', { colour }) })
    const colour = game.goal.kind === 'colour' ? game.goal.colour : 3
    const style = styleFor(colour)
    const signature = `${game.moves}:${game.level}:${game.progress}:${game.need}:${game.seed}:${game.rules}:${what}:${style.base}`
    if (signature === this.last) return
    this.last = signature
    el('moves').textContent = String(game.moves)
    el('moves').closest('.stat')!.classList.toggle('urgent', game.moves <= 5)
    el('level').textContent = t('levelN', { level: game.level })
    el('goal-text').textContent = what
    const unit = game.goal.kind === 'score' ? copy.points : game.goal.kind === 'power' ? copy.powers : copy.gems
    el('goal-unit').textContent = unit
    const remaining = n(Math.max(0, game.need - game.progress))
    el('goal-remaining').textContent = remaining
    el('goal-remaining').setAttribute('aria-label', `${what}: ${remaining} ${unit}`)
    el('progress').textContent = n(Math.min(game.progress, game.need))
    el('target').textContent = n(game.need)
    el('bar').style.width = `${Math.min(100, game.progress / game.need * 100)}%`
    el('seed').textContent = `seed ${game.seed.toString(36).toUpperCase()} · ${game.rules === 3 ? playCopy().rules : t(game.rules === 1 ? 'legacyRules' : 'fusionRules')}`
    const canvas = el('goal-gem') as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    // System fonts differ across platforms. Reserve the widest digit for
    // each character rather than assuming every font has a .62em advance.
    // Measure at a fixed size so this also works while the game is hidden;
    // CSS container units keep the result responsive without a resize loop.
    const countStyle = getComputedStyle(el('goal-remaining'))
    ctx.font = `${countStyle.fontWeight} 100px ${countStyle.fontFamily}`
    const digitEm = Math.max(...Array.from('0123456789', digit => ctx.measureText(digit).width)) / 100
    el('goal-remaining').style.setProperty('--goal-count-em', String(Math.max(1, digitEm * remaining.length)))
    ctx.clearRect(0, 0, 128, 128); ctx.save(); ctx.translate(64, 60)
    if (game.goal.kind === 'colour') {
      gemPath(ctx, style.shape, 45)
      const fill = ctx.createLinearGradient(-35, -40, 35, 40)
      fill.addColorStop(0, style.light); fill.addColorStop(1, style.base)
      ctx.fillStyle = fill; ctx.fill()
      ctx.strokeStyle = style.light; ctx.lineWidth = 3; ctx.stroke()
    } else {
      ctx.font = 'bold 78px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillStyle = style.light
      ctx.fillText(game.goal.kind === 'power' ? '✹' : '★', 0, 0)
    }
    ctx.restore()
  }
}
