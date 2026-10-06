import type { Inventory, Item } from '../game/items.ts'
import type { Game } from '../game/game.ts'
import { emptyCampaign, type CampaignState } from '../campaign-progress.ts'

export type PlayMode = 'adventure' | 'free'
export type Outcome = 'cleared' | 'failed' | 'quit'
export const LEVEL_COINS = 20
export const COSMETICS = [
  { id: 'leaf', level: 3, kind: 'frame' }, { id: 'spark', level: 5, kind: 'title' },
  { id: 'crystal', level: 10, kind: 'frame' }, { id: 'explorer', level: 15, kind: 'title' },
  { id: 'crown', level: 20, kind: 'frame' },
] as const
export type Cosmetic = typeof COSMETICS[number]['id']
export interface Growth { totalXp: number; frame: string; title: string }
export interface Metrics { items: Inventory; chain: number; created: number; fusions: number; actions: number; clears: number }
export interface Round extends Metrics { id: string; mode: PlayMode; outcome: Outcome; at: number; mission: string | null; rules: number }
export interface Aggregate { rounds: number; items: Inventory; chain: number; created: number; fusions: number; noItems: number }
export interface Attempt { at: number; tracked: boolean; baseline: number; paidClears: number; finished: boolean; xp: number; identity?: string }
export interface PlayerState {
  version: 1; revision: number; coins: number; stash: Inventory; starter: boolean;
  campaign: CampaignState; growth: Growth; attempts: Record<string, Attempt>;
  claims: Record<string, true>;
  stats: { since: number; resetAt: number; totals: Record<PlayMode, Aggregate>; recent: Round[] };
}
export const emptyInventory = (): Inventory => ({ hammer: 0, rocket: 0, bomb: 0 })
export const emptyAggregate = (): Aggregate => ({ rounds: 0, items: emptyInventory(), chain: 0, created: 0, fusions: 0, noItems: 0 })
export function emptyPlayer(at = Date.now()): PlayerState {
  return { version: 1, revision: 0, coins: 0, stash: emptyInventory(), starter: false,
    campaign: emptyCampaign(), growth: { totalXp: 0, frame: '', title: '' }, attempts: {}, claims: {},
    stats: { since: at, resetAt: at, totals: { adventure: emptyAggregate(), free: emptyAggregate() }, recent: [] } }
}
const count = (n: number) => Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
export function neededXp(level: number): number { return 100 + 10 * Math.min(10, Math.max(0, count(level) - 1)) }
export function levelFor(total: number): { level: number; xp: number; need: number } {
  let xp = Math.min(Number.MAX_SAFE_INTEGER, count(total)), level = 1
  for (; level <= 10 && xp >= neededXp(level); level++) xp -= neededXp(level)
  if (level > 10) { level += Math.floor(xp / 200); xp %= 200 }
  return { level, xp, need: neededXp(level) }
}
export function addXp(state: PlayerState, amount: number): number {
  const before = levelFor(state.growth.totalXp).level
  state.growth.totalXp += count(amount)
  const after = levelFor(state.growth.totalXp).level
  const coins = (after - before) * LEVEL_COINS
  state.coins += coins
  return coins
}
export function metricsOf(game: Game): Metrics {
  const items = emptyInventory()
  for (const action of game.log) if (action.kind === 'item') items[action.item]++
  const actions = game.log.filter(a => a.kind === 'swap' || a.kind === 'item').length
  const clears = game.mission ? Number(game.status === 'levelComplete')
    : Math.max(0, game.level - 1) + Number(game.status === 'levelComplete')
  return { items, actions, chain: game.bestCombo, created: game.matchedPowers, fusions: game.fusions, clears }
}
export const itemTotal = (metrics: Pick<Metrics, 'items'>): number => metrics.items.hammer + metrics.items.rocket + metrics.items.bomb
export function accumulate(total: Aggregate, round: Round): void {
  total.rounds++
  for (const item of ['hammer', 'rocket', 'bomb'] as Item[]) total.items[item] += round.items[item]
  total.chain = Math.max(total.chain, round.chain)
  total.created += round.created; total.fusions += round.fusions
  if (round.clears > 0 && itemTotal(round) === 0) total.noItems++
}
export function statsFor(state: PlayerState, mode: PlayMode, recent: boolean): Aggregate {
  if (!recent) return state.stats.totals[mode]
  const total = emptyAggregate()
  for (const round of state.stats.recent.filter(r => r.mode === mode).slice(-20)) accumulate(total, round)
  return total
}
export function resetStats(state: PlayerState, at = Date.now()): void {
  state.stats = { since: at, resetAt: at, totals: { adventure: emptyAggregate(), free: emptyAggregate() }, recent: [] }
}
/** A serialized transaction calls this only after replay has proved the result. */
export function settlePlayer(state: PlayerState, id: string, round: Round, progress: number,
  need: number, stageCoins: number, unlocked: boolean, terminal: boolean): { xp: number; coins: number; first: boolean } {
  const attempt = state.attempts[id]
  if (!attempt || attempt.finished) return { xp: 0, coins: 0, first: false }
  let xp = 0, coins = 0, first = false
  const clears = Math.max(0, round.clears - attempt.baseline)
  if (round.mission && clears && unlocked) {
    first = state.campaign.completed[round.mission] === undefined
    // Score belongs to the campaign facade, not player XP.
    if (first) { state.campaign.completed[round.mission] = 0; coins += stageCoins; xp += 60 }
  }
  if ((!round.mission || unlocked) && clears > attempt.paidClears) {
    xp += (clears - attempt.paidClears) * 40
    attempt.paidClears = clears
  }
  if (terminal) {
    attempt.finished = true
    if (round.outcome === 'failed' && round.actions > 0)
      xp += Math.floor(15 * Math.min(1, Math.max(0, progress / Math.max(1, need))))
    if (attempt.tracked && attempt.at >= state.stats.resetAt && round.actions > 0) {
      accumulate(state.stats.totals[round.mode], round)
      state.stats.recent.push(round)
      // Keep 20 actual rounds per mode; no raw pointer events are stored.
      state.stats.recent = state.stats.recent.filter((r, i, all) => all.slice(i + 1).filter(a => a.mode === r.mode).length < 20)
    }
  }
  state.coins += coins
  coins += addXp(state, xp)
  attempt.xp += xp
  return { xp, coins, first }
}
