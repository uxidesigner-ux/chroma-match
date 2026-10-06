import type { Geom } from './types.ts'
import type { Mission } from './campaign.ts'

export interface Terrain { shape: 'full'|'corners'|'hourglass'|'cross'; voidCells: ReadonlySet<number>; crates: readonly number[]; durability: number }
/** Pure authored geometry, derived only from immutable mission identity. */
export function terrainFor(geom: Geom, mission: Mission|null, rules: number): Terrain {
  const step=rules>=8 ? mission?.step ?? 1 : 1
  const shape=step<6 ? 'full' : step<13 ? 'corners' : step<21 ? 'hourglass' : 'cross'
  const voidCells=new Set<number>()
  for(let r=0;r<geom.rows;r++)for(let c=0;c<geom.cols;c++){
    const edge=Math.min(c,geom.cols-1-c), end=Math.min(r,geom.rows-1-r)
    if((shape==='corners' && edge===0 && end<2)
      ||(shape==='hourglass' && edge===0 && Math.abs(r-(geom.rows-1)/2)<1.5)
      ||(shape==='cross' && edge===0 && end<3))voidCells.add(geom.idx(c,r))
  }
  const count=step<4 ? 0 : step<10 ? 2 : step<20 ? 3 : 4
  // Alternating sides, never a solid wall across a row or a tiny isolated well.
  const candidates=[geom.idx(1,Math.floor(geom.rows/2)),geom.idx(geom.cols-2,Math.floor(geom.rows/2)-1),
    geom.idx(1,geom.rows-2),geom.idx(geom.cols-2,1)]
  return {shape,voidCells,crates:[...new Set(candidates)].filter(i=>!voidCells.has(i)).slice(0,count),durability:step<16?2:3}
}
