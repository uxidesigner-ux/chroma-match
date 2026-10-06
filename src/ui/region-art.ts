import type { Region } from '../game/campaign.ts'
/** Terrain-shaped selection, authored against each overview composition. */
export const regionContours: Record<Region, readonly string[]> = {
  forest:['8% 8%,21% 2%,39% 6%,48% 20%,42% 34%,31% 41%,12% 38%,3% 25%','3% 8%,16% 1%,34% 4%,45% 22%,37% 45%,20% 50%,4% 36%'],
  volcano:['54% 7%,68% 1%,85% 5%,96% 19%,92% 35%,80% 43%,60% 37%,51% 23%','53% 5%,68% 0%,89% 6%,97% 23%,88% 44%,72% 51%,54% 39%,48% 23%'],
  prism:['7% 43%,26% 38%,42% 46%,48% 60%,41% 76%,24% 83%,7% 72%,1% 56%','5% 50%,22% 44%,38% 53%,44% 74%,34% 94%,14% 98%,2% 80%'],
  relay:['61% 45%,78% 40%,94% 50%,99% 65%,91% 80%,72% 86%,53% 76%,52% 59%','62% 52%,79% 47%,95% 57%,99% 79%,86% 97%,64% 95%,49% 78%,51% 61%'],
}
export function regionContour(region:Region,wide:boolean):string{return `polygon(${regionContours[region][wide?1:0]})`}
