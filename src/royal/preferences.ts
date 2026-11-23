import type { Power } from './model.ts'
import { isLevelId, normalizeLevelId } from './progression.ts'
export interface Preferences {
  level: number; moves: number; seed: number; randomRetry: boolean; unlimitedMoves: boolean;
  unlimitedTools: boolean; calm: boolean; sound: boolean; haptics: boolean; hints: boolean;
  speed: number; forceSuper: boolean; boosters: Power[];
}
export type CompletionRange = [number, number]
export interface Progress { completed: number[]; completedRanges: CompletionRange[]; stars: number; coins: number; tasks: string[]; streak: number; lightWins: number; superActive: boolean }
export const RECENT_COMPLETION_LIMIT = 256
export const PREFS_KEY = 'chroma-royale:preferences:v2'
export const PROGRESS_KEY = 'chroma-royale:progress:v2'
export const CUSTOM_KEY = 'chroma-royale:custom-level:v2'
export const DEFAULT_PREFS: Preferences = { level:1, moves:0, seed:2026, randomRetry:true, unlimitedMoves:false, unlimitedTools:false, calm:false, sound:true, haptics:true, hints:true, speed:1, forceSuper:false, boosters:[] }
const record = (v: unknown):Record<string,unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string,unknown> : {}
const num = (v:unknown, fallback:number, min:number,max:number):number => typeof v === 'number' && Number.isFinite(v) ? Math.max(min,Math.min(max,Math.round(v))) : fallback
export function normalizePreferences(value:unknown):Preferences {
  const d=record(value), out={...DEFAULT_PREFS,boosters:[] as Power[]}
  out.level=normalizeLevelId(d.level); out.moves=num(d.moves,0,0,999); out.seed=num(d.seed,2026,1,2147483647)
  for(const key of ['randomRetry','unlimitedMoves','unlimitedTools','calm','sound','haptics','hints','forceSuper'] as const) if(typeof d[key]==='boolean')out[key]=d[key]
  if(typeof d.speed==='number' && [0.7,1,1.4].includes(d.speed))out.speed=d.speed
  if(Array.isArray(d.boosters))out.boosters=[...new Set(d.boosters.filter((v):v is Power=>['rocket-h','tnt','lightball'].includes(v as string)))].slice(0,3)
  return out
}
export function normalizeProgress(value:unknown):Progress {
  const d=record(value)
  const completed=Array.isArray(d.completed)?[...new Set(d.completed.filter(isLevelId))]:[]
  const ranges:CompletionRange[]=Array.isArray(d.completedRanges)?d.completedRanges.filter((range):range is CompletionRange=>Array.isArray(range)&&range.length===2&&isLevelId(range[0])&&isLevelId(range[1])&&range[0]<=range[1]).map(range=>[...range]):[]
  return {completed:completed.slice(-RECENT_COMPLETION_LIMIT),completedRanges:mergeRanges([...ranges,...completed.map(id=>[id,id] as CompletionRange)]),stars:num(d.stars,0,0,999999),coins:num(d.coins,0,0,99999999),tasks:Array.isArray(d.tasks)?[...new Set(d.tasks.filter((v):v is string=>typeof v==='string'&&/^garden-[1-6]$/.test(v)))]:[],streak:num(d.streak,0,0,3),lightWins:num(d.lightWins,0,0,10),superActive:d.superActive===true}
}

/** Sequential play grows one interval instead of an ever-growing list of IDs. */
function mergeRanges(ranges:CompletionRange[]):CompletionRange[]{
  const sorted=ranges.map(([first,last]):CompletionRange=>[first,last]).sort((a,b)=>a[0]-b[0]),merged:CompletionRange[]=[]
  for(const [first,last] of sorted){const previous=merged.at(-1);if(previous&&first-previous[1]<=1)previous[1]=Math.max(previous[1],last);else merged.push([first,last])}
  return merged
}
export function hasCompleted(progress:Progress,level:number):boolean{
  if(!isLevelId(level))return false
  let low=0,high=progress.completedRanges.length-1
  while(low<=high){const middle=Math.floor((low+high)/2),range=progress.completedRanges[middle]!;if(level<range[0])high=middle-1;else if(level>range[1])low=middle+1;else return true}
  return false
}
export function completedCount(progress:Progress):number{return progress.completedRanges.reduce((total,[first,last])=>total+(last-first+1),0)}
export function rewardWin(progress:Progress,level:number):Progress {
  const p=normalizeProgress(progress)
  if(!isLevelId(level))return p
  if(!hasCompleted(p,level)){p.completed.push(level);p.completed=p.completed.slice(-RECENT_COMPLETION_LIMIT);p.completedRanges=mergeRanges([...p.completedRanges,[level,level]]);p.stars++;p.coins+=50}
  p.streak=Math.min(3,p.streak+1)
  if(level>=292&&!p.superActive){p.lightWins=Math.min(10,p.lightWins+1);if(p.lightWins===10)p.superActive=true}
  return p
}
export function recordLoss(progress:Progress):Progress {
  const p=normalizeProgress(progress);p.streak=0
  if(p.superActive){p.superActive=false;p.lightWins=0}
  return p
}
export function startingPowers(prefs:Preferences,progress:Progress):Power[]{
  const out=[...prefs.boosters]
  if(prefs.level>=32&&progress.streak>0){out.push('rocket-h','propeller');if(progress.streak>=2)out.push('tnt');if(progress.streak>=3)out.push('lightball')}
  return out
}
