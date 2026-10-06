import { parseCampaign, CAMPAIGN_KEY, unlocked, type CampaignState } from '../campaign-progress.ts'
import { Game } from '../game/game.ts'
import { recordOf, restoreRun, type RunRecord } from '../game/replay.ts'
import { BOARD } from '../game/types.ts'
import { COSMETICS, emptyPlayer, levelFor, addXp, metricsOf, settlePlayer, resetStats, type PlayerState, type Outcome, type Round } from './model.ts'
import { bindEconomy, coins, stash, BOOSTER_LIMIT, payoutFor } from '../meta.ts'
import type { Item } from '../game/items.ts'

export const PLAYER_DB = 'chroma-match-player-v1'
export interface Settlement { ok: boolean; persistent: boolean; xp: number; reward: number; first: boolean; before: number; after: number }
/** One document, one IndexedDB read-write transaction: XP, coins, unlocks and stats commit together. */
export class PlayerLedger {
  state = emptyPlayer()
  persistent = false
  private db: IDBDatabase | null = null
  private listeners = new Set<() => void>()
  private channel: BroadcastChannel | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private seed = emptyPlayer()
  private sessionOnly = false
  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn) }
  private notify(): void { for (const fn of this.listeners) fn() }
  async open(): Promise<void> {
    this.seed.coins = coins(); this.seed.stash = stash()
    try {
      this.seed.starter = localStorage.getItem('chroma-match:granted') === '1'
      this.seed.campaign = parseCampaign(localStorage.getItem(CAMPAIGN_KEY) ?? '')
    } catch { /* Original storage remains untouched and recoverable. */ }
    // Only recognized mission clears migrate. Best score/furthest stage are not growth.
    addXp(this.seed, Object.keys(this.seed.campaign.completed).length * 100)
    this.state = structuredClone(this.seed)
    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(PLAYER_DB, 1)
        let expired = false
        const timer = setTimeout(() => { expired = true; reject(new Error('player storage timed out')) }, 5000)
        request.onupgradeneeded = () => request.result.createObjectStore('player')
        request.onerror = () => { clearTimeout(timer); reject(request.error) }
        request.onblocked = () => { clearTimeout(timer); expired = true; reject(new Error('player storage is blocked')) }
        request.onsuccess = () => { clearTimeout(timer); if (expired) request.result.close(); else resolve(request.result) }
      })
      this.db.onversionchange = () => { this.db?.close(); this.db = null; this.persistent = false; this.notify() }
      await this.change(() => undefined)
      this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(PLAYER_DB) : null
      if (this.channel) this.channel.onmessage = () => void this.reload()
    } catch { this.persistent = false; this.sessionOnly = true }
    bindEconomy({
      read: () => this.state,
      change: async operation => { await this.change(operation) },
    })
  }
  private async reload(): Promise<void> {
    if (!this.db) return
    try {
      const tx = this.db.transaction('player', 'readonly'), request = tx.objectStore('player').get('current')
      const value = await new Promise<PlayerState>((resolve, reject) => {
        request.onsuccess = () => resolve(this.valid(request.result))
        request.onerror = () => reject(request.error)
      })
      this.state = value; this.persistent = true; this.notify()
    } catch { this.persistent = false; this.notify() }
  }
  private valid(value: unknown): PlayerState {
    if (value === undefined) return structuredClone(this.seed)
    const s = value as PlayerState
    const whole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
    const inventory = (v: PlayerState['stash']) => v && ['hammer', 'rocket', 'bomb'].every(k => whole(v[k as Item]))
    const aggregate = (v: PlayerState['stats']['totals']['free']) => v && inventory(v.items)
      && ['rounds', 'chain', 'created', 'fusions', 'noItems'].every(k => whole(v[k as keyof typeof v])) && v.noItems <= v.rounds
    if (s?.version !== 1 || !whole(s.revision) || !whole(s.coins)
      || !s.growth || !Number.isSafeInteger(s.growth.totalXp) || s.growth.totalXp < 0
      || !s.attempts || !s.claims || !s.campaign?.completed || !s.stats?.totals?.free || !s.stats?.totals?.adventure
      || !Array.isArray(s.stats.recent) || s.stats.recent.length > 40 || !inventory(s.stash)
      || !aggregate(s.stats.totals.free) || !aggregate(s.stats.totals.adventure)
      || !whole(s.stats.since) || !whole(s.stats.resetAt) || typeof s.starter !== 'boolean'
      || !['frame', 'title'].every(k => typeof s.growth[k as 'frame' | 'title'] === 'string')
      || !Object.values(s.campaign.completed).every(whole) || !Object.values(s.claims).every(v => v === true)
      || !Object.values(s.attempts).every(a => a && whole(a.at) && whole(a.baseline) && whole(a.paidClears) && whole(a.xp)
        && typeof a.finished === 'boolean' && typeof a.tracked === 'boolean' && (a.identity === undefined || typeof a.identity === 'string'))
      || !s.stats.recent.every(r => r && typeof r.id === 'string' && ['adventure', 'free'].includes(r.mode)
        && ['cleared', 'failed', 'quit'].includes(r.outcome) && inventory(r.items)
        && [r.at, r.chain, r.created, r.fusions, r.actions, r.clears, r.rules].every(whole))) throw new Error('invalid player ledger; original retained')
    return s
  }
  async change<T>(operation: (state: PlayerState) => T): Promise<T> {
    const task = this.queue.then(() => new Promise<T>((resolve, reject) => {
      if (!this.db) { reject(new Error('player storage is unavailable')); return }
      const tx = this.db.transaction('player', 'readwrite'), store = tx.objectStore('player')
      const get = store.get('current')
      let next: PlayerState, result: T
      get.onsuccess = () => {
        try {
          next = this.valid(get.result)
          result = operation(next)
          next.revision++
          store.put(next, 'current')
        } catch (error) { tx.abort(); reject(error) }
      }
      tx.oncomplete = () => { this.state = next; this.persistent = true; this.notify(); this.channel?.postMessage(next.revision); resolve(result) }
      tx.onabort = tx.onerror = () => { this.persistent = false; this.notify(); reject(tx.error ?? new Error('player transaction failed')) }
    }))
    this.queue = task.catch(() => undefined)
    return task
  }
  async begin(id: string, tracked = true, baseline = 0, at = Date.now(), boosters: readonly Item[] = [], identity = ''): Promise<void> {
    if (this.sessionOnly) {
      this.state.attempts[id] ??= { at, tracked: false, baseline, paidClears: 0, finished: false, xp: 0, identity }
      return // Basic supplied-item play works; no wallet debit or promised persistence.
    }
    await this.change(s => {
      if (s.attempts[id]) {
        if (s.attempts[id].identity && identity && s.attempts[id].identity !== identity) throw new Error('attempt identity changed')
        return
      }
      for (const item of boosters.slice(0, BOOSTER_LIMIT)) {
        if (s.stash[item] <= 0) throw new Error('booster stock changed')
        s.stash[item]--
      }
      s.attempts[id] = { at, tracked, baseline, paidClears: 0, finished: false, xp: 0, identity }
    })
  }
  async settle(id: string, record: RunRecord, outcome: Outcome, terminal: boolean, payout = 0): Promise<Settlement> {
    const no: Settlement = { ok: false, persistent: this.persistent, xp: 0, reward: 0, first: false, before: levelFor(this.state.growth.totalXp).level, after: levelFor(this.state.growth.totalXp).level }
    const proof = new Game({}, record.seed, BOARD)
    if (!restoreRun(proof, record) || recordOf(proof).score !== record.score || proof.level !== record.level) return no
    if ((outcome === 'cleared' && proof.status !== 'levelComplete')
      || (outcome === 'failed' && proof.status !== 'gameOver')) return no
    const m = proof.mission
    const round: Round = { ...metricsOf(proof), id, mode: m ? 'adventure' : 'free', outcome, at: Date.now(), mission: m?.id ?? null, rules: proof.rules }
    if (this.sessionOnly) {
      if (m && !unlocked(this.state.campaign, m)) return no
      if (m && round.clears) this.state.campaign.completed[m.id] = Math.max(this.state.campaign.completed[m.id] ?? 0, proof.score)
      this.notify()
      return { ...no, ok: true, persistent: false }
    }
    return this.change(s => {
      const before = levelFor(s.growth.totalXp).level
      const attempt = s.attempts[id], identity = `${proof.rules}:${proof.seed >>> 0}:${m?.id ?? ''}`
      if (!attempt || (attempt.identity && attempt.identity !== identity)) return { ...no, persistent: true }
      attempt.identity = identity
      if (attempt.finished) return { ...no, ok: true, persistent: true, before, after: before }
      const ready = m ? unlocked(s.campaign, m) : true
      if (m && !ready) return no
      const result = settlePlayer(s, id, round, proof.progress, proof.need, m?.reward ?? 0, ready, terminal)
      if (m && round.clears) s.campaign.completed[m.id] = Math.max(s.campaign.completed[m.id] ?? 0, proof.score)
      // Endless payout is part of the same terminal transaction, not a second wallet write.
      if (!m && terminal && round.actions > 0) {
        const earned = Math.min(Math.max(0, Math.floor(payout)), payoutFor(proof.score, proof.level))
        s.coins += earned; result.coins += earned
      }
      return { ok: true, persistent: true, xp: result.xp,
        reward: result.coins, first: result.first, before, after: levelFor(s.growth.totalXp).level }
    })
  }
  async equip(kind: 'frame' | 'title', id: string): Promise<void> {
    await this.change(s => {
      if (id && !COSMETICS.some(c => c.id === id && c.kind === kind && c.level <= levelFor(s.growth.totalXp).level)) throw new Error('cosmetic not earned')
      s.growth[kind] = id
    })
  }
  async resetStats(): Promise<void> { await this.change(s => resetStats(s)) }
  /** Facade shares existing map/unlock code without using the legacy split-wallet claim. */
  get campaign(): { state: CampaignState; persistent: boolean } { return { state: this.state.campaign, persistent: this.persistent } }
}
export const player = new PlayerLedger()
