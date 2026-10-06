/** Cosmetic presentation only: no XP, rewards or saved selections are changed. */
export const FRAME_TIERS = [
  {level:1,id:'bronze'}, {level:3,id:'silver'}, {level:10,id:'gold'},
  {level:20,id:'crystal'}, {level:35,id:'royal'}, {level:50,id:'legend'},
] as const
const loads=new Map<string,Promise<boolean>>()
function asset(url:string):Promise<boolean>{
  if(!loads.has(url))loads.set(url,new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(true);image.onerror=()=>resolve(false);image.src=url}))
  return loads.get(url)!
}
export function paintLevel(badge:HTMLElement,level:number):void {
  const url=`${import.meta.env.BASE_URL}profile-frames/badge-v1.webp`
  const value=Number.isFinite(level)?Math.max(1,Math.floor(level)):1
  const number=value>=10000?new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(value):String(value)
  badge.classList.add('profile-level-badge');badge.textContent=`Lv.${number}`
  badge.setAttribute('aria-label',`Lv.${value}`)
  badge.style.setProperty('--rank-badge',`url("${url}")`)
  badge.dataset.digits=number.length>3?'long':number.length===3?'medium':'normal'
  void asset(url).then(ok=>badge.classList.toggle('profile-level-fallback',!ok))
}
export function frameTier(level:number):typeof FRAME_TIERS[number] {
  const value=Number.isFinite(level)?Math.max(1,Math.floor(level)):1
  return [...FRAME_TIERS].reverse().find(t=>value>=t.level)!
}
export function paintRank(surface:HTMLElement, badge:HTMLElement, level:number):void {
  const tier=frameTier(level), previous=surface.dataset.rank
  surface.classList.add('rank-surface');surface.dataset.rank=tier.id
  const url=`${import.meta.env.BASE_URL}profile-frames/${tier.id}-v1.webp`
  surface.style.setProperty('--rank-art',`url("${url}")`)
  paintLevel(badge,level)
  void asset(url).then(ok=>{if(surface.dataset.rank===tier.id)surface.classList.toggle('rank-art-fallback',!ok)})
  if(previous&&FRAME_TIERS.findIndex(t=>t.id===previous)<FRAME_TIERS.indexOf(tier)&&surface.getClientRects().length&&!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // One earned transition; never an endless glow competing with gameplay.
    surface.animate([{filter:'brightness(1.45)'},{filter:'brightness(1)'}],{duration:550,easing:'ease-out'})
  }
}
export function profileRankPreview():{surface:HTMLElement;badge:HTMLElement} {
  let surface=document.getElementById('profile-rank')
  if(!surface){
    surface=document.createElement('div');surface.id='profile-rank'
    const canvas=document.getElementById('profile-preview')!
    canvas.before(surface);surface.append(canvas)
    const badge=document.createElement('strong');badge.id='profile-level';surface.append(badge)
  }
  return {surface,badge:document.getElementById('profile-level')!}
}
