import { WORLD_MISSIONS, missionFor, type Mission } from './game/campaign.ts'
import { Game } from './game/game.ts'
import { missionOf, restoreRun, verifyRun, type RunRecord } from './game/replay.ts'
import { BOARD } from './game/types.ts'
import { coins, setCoins } from './meta.ts'

export const CAMPAIGN_KEY = 'chroma-match:campaign-v1'
export interface CampaignState { version: 1; completed: Record<string, number> }
export const emptyCampaign = (): CampaignState => ({ version: 1, completed: {} })
export function unlocked(state: CampaignState, mission: Mission): boolean {
  if (mission.region !== 'forest' && state.completed['forest-1'] === undefined) return false
  return mission.step === 1 || state.completed[`${mission.region}-${mission.step - 1}`] !== undefined
}
export function parseCampaign(raw: string): CampaignState {
  const state = emptyCampaign()
  try {
    const parsed = JSON.parse(raw)
    if (parsed?.version !== 1 || !parsed.completed || typeof parsed.completed !== 'object') return state
    for (const m of WORLD_MISSIONS) {
      const score = parsed.completed[m.id]
      if (Number.isInteger(score) && score >= 0 && score <= 10000000 && unlocked(state, m)) state.completed[m.id] = score
    }
  } catch { /* Corrupt or unknown local progress starts safely; no old score migration. */ }
  return state
}
export interface Claim { ok: boolean; first: boolean; reward: number; persistent: boolean }
/** Device-local campaign ledger. Replay proves completion, not a mutable score label. */
export class CampaignProgress {
  state = emptyCampaign()
  persistent = true
  private storage: Pick<Storage, 'getItem' | 'setItem'> | null
  private credit: (amount: number) => void
  constructor(storage: Pick<Storage, 'getItem' | 'setItem'> | null,
    credit: (amount: number) => void = amount => setCoins(coins() + amount)) {
    this.storage = storage
    this.credit = credit
    this.persistent = Boolean(storage)
    try { this.state = parseCampaign(storage?.getItem(CAMPAIGN_KEY) ?? '') }
    catch { this.persistent = false }
  }
  claim(record: RunRecord): Claim {
    // Re-read before a claim: a second tab must not pay a completed mission
    // from its stale initial ledger. Preserve this session's unsaved progress.
    try {
      const latest = parseCampaign(this.storage?.getItem(CAMPAIGN_KEY) ?? '')
      for (const [id, score] of Object.entries(latest.completed)) this.state.completed[id] = Math.max(this.state.completed[id] ?? 0, score)
    } catch { this.persistent = false }
    const no: Claim = { ok: false, first: false, reward: 0, persistent: this.persistent }
    const m = missionOf(record)
    if (!m || !missionFor(m.id) || !unlocked(this.state, m)) return no
    if (!verifyRun(record, BOARD).claimMatches) return no
    const proof = new Game()
    if (!restoreRun(proof, record) || proof.status !== 'levelComplete') return no
    const first = this.state.completed[m.id] === undefined
    this.state.completed[m.id] = Math.max(this.state.completed[m.id] ?? 0, proof.score)
    try {
      if (!this.storage) throw new Error('storage unavailable')
      // Claim written first: reload/replayed results cannot pay twice. Existing
      // per-device wallet is separate; a crash between writes may lose coins,
      // never mint them. No account-wide progress is implied.
      this.storage.setItem(CAMPAIGN_KEY, JSON.stringify(this.state))
      this.persistent = true
    } catch { this.persistent = false }
    const reward = first && this.persistent ? m.reward : 0
    if (reward) this.credit(reward)
    return { ok: true, first, reward, persistent: this.persistent }
  }
}
