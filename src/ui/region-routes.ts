import type { Mission, Region } from '../game/campaign.ts'

// Authored against the shared bridge/terrace composition of the four regional
// illustrations. Coordinates are normalized; native targets stay 52 screen px.
export const terraceRoute: readonly (readonly [number,number])[] = [
  [.58,.82],[.56,.785],[.53,.752],[.49,.72],[.455,.686],
  [.442,.65],[.465,.62],[.51,.597],[.56,.58],[.61,.56],
  [.646,.53],[.65,.50],[.62,.469],[.567,.447],[.51,.430],
  [.455,.423],[.398,.415],[.353,.393],[.349,.365],[.377,.337],
  [.422,.326],[.478,.309],[.533,.293],[.562,.265],[.605,.252],
  [.654,.236],[.653,.211],[.616,.188],[.588,.160],[.589,.126],
]
export const regionalArt: Record<Region,string> = {
  forest:'chroma-forest-v3.webp', volcano:'chroma-volcano-v1.webp',
  prism:'chroma-prism-v1.webp', relay:'chroma-relay-v1.webp',
}
export function pointFor(mission: Pick<Mission,'region'|'step'>): {x:number;y:number} {
  const point=terraceRoute[mission.step-1]
  if(!point)throw new RangeError(`Invalid map stage: ${mission.step}`)
  return {x:point[0],y:point[1]}
}
