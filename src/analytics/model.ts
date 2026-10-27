/** Bounded telemetry only. Never accept account/profile/replay/free-text fields. */
export const MEASUREMENT_ID = 'G-QH5S96E4FK'
export const CONSENT_KEY = 'chroma-match:analytics-consent-v1'
export const GAME_URL = 'https://uxidesigner-ux.github.io/chroma-match/'
export type Consent = 'granted' | 'denied' | null
export type EventName = 'screen_view' | 'game_start' | 'game_resume' | 'level_start' | 'level_end' | 'game_end' | 'item_use' | 'character_save' | 'menu_open'
export type EventData = Record<string, string | number | boolean>
const enums: Record<string, readonly string[]> = {
  screen_name: ['map', 'home', 'shop', 'game', 'creator', 'profile'],
  mode: ['adventure', 'free'], region: ['forest', 'volcano', 'prism', 'relay', 'none'],
  outcome: ['cleared', 'failed', 'quit'], item_id: ['hammer', 'rocket', 'bomb', 'bow', 'shuffle'],
  menu: ['missions', 'leaderboard', 'settings', 'help'],
}
const context = ['mode', 'region', 'stage', 'level', 'level_name', 'rules_version']
const fields: Record<EventName, readonly string[]> = {
  screen_view: ['screen_name'], game_start: context, game_resume: context, level_start: context,
  level_end: [...context, 'outcome', 'success', 'score', 'moves_used', 'items_used'],
  game_end: [...context, 'outcome', 'score', 'moves_used', 'items_used'],
  item_use: [...context, 'item_id'], character_save: [], menu_open: ['menu'],
}
const bounds: Record<string, number> = {stage: 30, level: 1_000_000, rules_version: 100, score: 1_000_000_000, moves_used: 4000, items_used: 4000}
export function consentOf(raw: unknown): Consent { return raw === 'granted' || raw === 'denied' ? raw : null }
export function liveLocation(raw: string): boolean {
  try { const url = new URL(raw); return url.origin === new URL(GAME_URL).origin && (url.pathname === '/chroma-match' || url.pathname.startsWith('/chroma-match/')) }
  catch { return false }
}
export function privateReferrer(raw: string): string {
  try { const url = new URL(raw); return /^https?:$/.test(url.protocol) ? url.origin : '' } catch { return '' }
}
export function safeEvent(name: EventName, input: Record<string, unknown> = {}): EventData {
  const output: EventData = {}
  for (const key of fields[name] ?? []) {
    const value = input[key]
    if (typeof value === 'string' && enums[key]?.includes(value)) output[key] = value
    else if (key === 'level_name' && typeof value === 'string' && /^(?:(?:forest|volcano|prism|relay)-(?:[1-9]|[12]\d|30)|free-\d{1,6})$/.test(value)) output[key] = value
    else if (typeof value === 'number' && Number.isFinite(value) && key in bounds)
      output[key] = Math.min(bounds[key]!, Math.max(0, Math.floor(value)))
    else if (key === 'success' && typeof value === 'boolean') output[key] = value
  }
  return output
}
