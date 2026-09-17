function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}

export interface PauseActions {
  resume(): void
  /** Put the run down where it stands, to be picked up later. */
  keep(): void
  /** Finish it now: the score banks and the run pays out. */
  end(): void
}

/**
 * What the board's chrome collapsed into.
 *
 * The game screen used to carry a footer — leave, rules, sound, seed — under
 * the item tray, four controls competing for the same thumb as the board. None
 * of it is needed while a gem is being dragged, so all of it lives behind one
 * button, and the two ways of leaving a run are told apart here rather than
 * both being spelled "Home".
 */
export class PauseSheet {
  private root = el('paused')
  private title = el('paused-title')
  private body = el('paused-body')
  private resume = el<HTMLButtonElement>('paused-resume')
  private keep = el<HTMLButtonElement>('paused-keep')
  private end = el<HTMLButtonElement>('paused-end')
  private actions: PauseActions | null = null

  constructor() {
    this.resume.addEventListener('click', () => this.run((a) => a.resume()))
    this.keep.addEventListener('click', () => this.run((a) => a.keep()))
    this.end.addEventListener('click', () => this.run((a) => a.end()))
  }

  private run(pick: (actions: PauseActions) => void): void {
    const actions = this.actions
    this.hide()
    if (actions) pick(actions)
  }

  get visible(): boolean {
    return !this.root.hidden
  }

  show(level: number, score: number, actions: PauseActions): void {
    this.actions = actions
    this.title.textContent = `Level ${level}`
    this.body.textContent = `${score.toLocaleString()} points so far.`
    this.root.hidden = false
    this.resume.focus()
  }

  hide(): void {
    this.root.hidden = true
  }
}
