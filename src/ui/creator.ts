import { animeCopy } from './anime-copy.ts'
import type { AnimeEditor } from './anime-editor.ts'

/** A single character editor, loaded on demand with explicit draft confirmation. */
export class Creator {
  private editor: AnimeEditor | null = null
  private opened = false
  private generation = 0
  private listeners: Array<() => void | Promise<void>> = []

  constructor(private onBack: () => void) {
    document.getElementById('creator-back')!.addEventListener('click', () => {
      if (this.editor) this.editor.requestLeave(() => this.leave())
      else this.leave()
    })
  }

  onChange(listener: () => void | Promise<void>): void {
    this.listeners.push(listener)
  }

  open(): void {
    this.opened = true
    document.querySelector('.app')?.classList.add('has-studio')
    void this.load()
  }

  close(): void {
    this.opened = false
    this.generation++
    this.editor?.close()
    document.querySelector('.app')?.classList.remove('has-studio')
  }

  private leave(): void {
    this.close()
    this.onBack()
    document.getElementById('profile-face')?.focus()
  }

  private async load(): Promise<void> {
    const mine = ++this.generation
    const root = document.getElementById('anime-studio')!
    root.textContent = animeCopy().loading
    try {
      const { AnimeEditor } = await import('./anime-editor.ts')
      if (mine !== this.generation || !this.opened) return
      this.editor ??= new AnimeEditor(root, async () => {
        await Promise.all(this.listeners.map(listener => listener()))
      }, () => this.leave())
      this.editor.open()
    } catch {
      if (mine !== this.generation || !this.opened) return
      root.textContent = animeCopy().failed
      const retry = document.createElement('button')
      retry.type = 'button'
      retry.className = 'studio-button'
      retry.textContent = animeCopy().retry
      retry.addEventListener('click', () => void this.load())
      root.append(retry)
    }
  }
}
