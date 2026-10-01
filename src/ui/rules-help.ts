import { experienceCopy } from './experience-copy.ts'
import { Sheet } from './sheet.ts'

/** Three visual examples first; detailed rules remain available by choice. */
export class RulesHelp {
  private buttons = document.querySelectorAll<HTMLButtonElement>('[data-action="how-to"]')
  private sheet = new Sheet('help', () => this.buttons.forEach(button => button.setAttribute('aria-expanded', 'false')))
  constructor() {
    this.buttons.forEach(button => button.addEventListener('click', () => {
      this.paint()
      this.buttons.forEach(other => other.setAttribute('aria-expanded', 'true'))
      this.sheet.show(document.getElementById('help-title')!)
    }))
    document.getElementById('help-close')!.addEventListener('click', () => this.sheet.hide())
    this.paint()
  }
  paint(): void {
    const copy = experienceCopy()
    document.getElementById('help-intro')!.textContent = copy.rulesIntro
    document.getElementById('help-details-title')!.textContent = copy.detailed
    const examples = document.getElementById('rule-patterns')!
    examples.replaceChildren()
    for (const [kind, title, note, cells] of [
      ['line', copy.line, copy.lineNote, ['◆', '◆', '◆']],
      ['square', copy.square, copy.squareNote, ['◆', '◆', '◆', '◆']],
      ['fusion', copy.fusion, copy.fusionNote, ['✹', '↔', '✹']],
    ] as const) {
      const example = document.createElement('div')
      example.className = 'rule-example'
      const diagram = document.createElement('div')
      diagram.className = `rule-diagram rule-${kind}`
      diagram.setAttribute('aria-hidden', 'true')
      for (const cell of cells) {
        const gem = document.createElement('span')
        gem.textContent = cell
        diagram.append(gem)
      }
      const label = document.createElement('strong')
      label.textContent = title
      const text = document.createElement('p')
      text.textContent = note
      example.append(diagram, label, text)
      examples.append(example)
    }
  }
}
