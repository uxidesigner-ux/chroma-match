import { experienceCopy } from './experience-copy.ts'
import { reducedMotion } from '../render/motion.ts'

/** In short windows gems retain their targets; explicit controls avoid the
 * ambiguous "swipe to scroll" versus "swipe to swap" touch gesture. */
export class BoardViewport {
  private stage = document.querySelector<HTMLElement>('.game .stage')!
  private up = document.getElementById('board-scroll-up') as HTMLButtonElement
  private down = document.getElementById('board-scroll-down') as HTMLButtonElement
  constructor() {
    this.up.addEventListener('click', () => this.scroll(-1))
    this.down.addEventListener('click', () => this.scroll(1))
    this.stage.addEventListener('scroll', () => this.paint(), { passive: true })
    new ResizeObserver(() => this.paint()).observe(this.stage)
    this.paint()
  }
  paint(): void {
    const overflow = this.stage.clientHeight > 0 && this.stage.scrollHeight > this.stage.clientHeight + 2
    document.documentElement.dataset.boardScroll = String(overflow)
    this.up.disabled = this.stage.scrollTop <= 1
    this.down.disabled = this.stage.scrollTop + this.stage.clientHeight >= this.stage.scrollHeight - 2
    this.up.setAttribute('aria-label', experienceCopy().scrollUp)
    this.down.setAttribute('aria-label', experienceCopy().scrollDown)
    this.up.title = experienceCopy().scrollUp
    this.down.title = experienceCopy().scrollDown
  }
  private scroll(direction: number): void {
    this.stage.scrollBy({ top: direction * this.stage.clientHeight * .7, behavior: reducedMotion() ? 'instant' : 'smooth' })
  }
}
