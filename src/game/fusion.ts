import { areNeighbours, expandClears } from './board.ts'
import type { Blast, BlastKind, ClearExpansion } from './board.ts'
import { at } from './types.ts'
import type { Geom, Grid, Power } from './types.ts'

export type FusionKind = 'cross' | 'wideCross' | 'megaBomb' | 'prismStripe' | 'prismBomb' | 'prismPair'
export interface Fusion { kind: FusionKind; a: number; b: number }

export function fusionKind(a: Power, b: Power): FusionKind | null {
  if (a === 'none' || b === 'none') return null
  if (a === 'rainbow' && b === 'rainbow') return 'prismPair'
  if (a === 'rainbow' || b === 'rainbow') return a === 'bomb' || b === 'bomb' ? 'prismBomb' : 'prismStripe'
  if (a === 'bomb' && b === 'bomb') return 'megaBomb'
  if (a === 'bomb' || b === 'bomb') return 'wideCross'
  return 'cross'
}

/** Pure preview and resolution share the exact same target list; no RNG or grid mutation. */
export function fusionClear(geom: Geom, grid: Grid, a: number, b: number): (ClearExpansion & Fusion) | null {
  if (!areNeighbours(geom, a, b)) return null
  const ga = at(grid, a)
  const gb = at(grid, b)
  if (!ga || !gb) return null
  const kind = fusionKind(ga.power, gb.power)
  if (!kind) return null
  const seeds = new Set([a, b])
  const blasts: Blast[] = []
  const consumed = new Set([a, b])
  const add = (cell: number, shape: BlastKind, targets: number[]) => {
    const occupied = targets.filter(i => at(grid, i) !== null)
    occupied.forEach(i => seeds.add(i))
    blasts.push({ cell, kind: shape, targets: occupied.filter(i => i !== cell) })
  }
  const area = (cell: number, radius: number) => {
    const cells: number[] = []
    for (let y = geom.rowOf(cell) - radius; y <= geom.rowOf(cell) + radius; y++) {
      for (let x = geom.colOf(cell) - radius; x <= geom.colOf(cell) + radius; x++) {
        if (geom.inBounds(x, y)) cells.push(geom.idx(x, y))
      }
    }
    return cells
  }
  const line = (cell: number, vertical: boolean) => Array.from(
    { length: vertical ? geom.rows : geom.cols },
    (_, n) => vertical ? geom.idx(geom.colOf(cell), n) : geom.idx(n, geom.rowOf(cell)),
  )

  if (kind === 'prismPair') {
    add(b, 'colour', Array.from({ length: geom.cells }, (_, i) => i))
  } else if (kind === 'prismStripe' || kind === 'prismBomb') {
    const partner = ga.power === 'rainbow' ? gb : ga
    const origin = ga.power === 'rainbow' ? a : b
    const matches = Array.from({ length: geom.cells }, (_, i) => i)
      .filter(i => i !== origin && at(grid, i)?.kind === partner.kind)
    add(origin, 'colour', matches)
    for (const cell of matches) {
      // Each transformed cell fires once as the partner's power. It must not
      // additionally detonate an old power that it carried before the fusion.
      consumed.add(cell)
      if (kind === 'prismBomb') add(cell, 'square', area(cell, 1))
      else add(cell, partner.power === 'colClear' ? 'col' : 'row', line(cell, partner.power === 'colClear'))
    }
  } else if (kind === 'megaBomb') {
    add(b, 'square', area(b, 2))
  } else {
    const width = kind === 'wideCross' ? 1 : 0
    for (let offset = -width; offset <= width; offset++) {
      const row = geom.rowOf(b) + offset
      const col = geom.colOf(b) + offset
      if (geom.inBounds(geom.colOf(b), row)) {
        const cell = geom.idx(geom.colOf(b), row)
        add(cell, 'row', line(cell, false))
      }
      if (geom.inBounds(col, geom.rowOf(b))) {
        const cell = geom.idx(col, geom.rowOf(b))
        add(cell, 'col', line(cell, true))
      }
    }
  }
  const expanded = expandClears(geom, grid, seeds, consumed)
  return { kind, a, b, cleared: expanded.cleared, blasts: [...blasts, ...expanded.blasts] }
}
