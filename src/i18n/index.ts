import { EN } from './en.ts'
import type { StringKey, Strings } from './en.ts'
import { JA } from './ja.ts'
import { KO } from './ko.ts'
import { ZH } from './zh.ts'

export type { StringKey, Strings } from './en.ts'

/**
 * What language the interface is in.
 *
 * The four are fixed rather than discovered, because each one is a file that
 * somebody wrote: a language this does not have is not a missing translation,
 * it is a language nobody has translated. Chinese is Simplified only for now,
 * which is why the tag is `zh-Hans` rather than `zh` — a Traditional set would
 * be `zh-Hant` alongside it, not a replacement for it.
 */
export const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'ko', label: '한국어' },
  { id: 'ja', label: '日本語' },
  { id: 'zh-Hans', label: '简体中文' },
] as const

export type LanguageId = (typeof LANGUAGES)[number]['id']

const TABLES: Record<LanguageId, Strings> = {
  en: EN,
  ko: KO,
  ja: JA,
  'zh-Hans': ZH,
}

/**
 * The BCP 47 tag each language is announced as.
 *
 * This goes on `<html lang>`, and it is not decoration: it decides which font
 * the browser reaches for when the same code point is drawn differently in
 * Japanese and Chinese, and it is what a screen reader switches voice on.
 */
const HTML_LANG: Record<LanguageId, string> = {
  en: 'en',
  ko: 'ko',
  ja: 'ja',
  'zh-Hans': 'zh-Hans',
}

const KEY = 'chroma-match:lang'

function isLanguage(value: string): value is LanguageId {
  return LANGUAGES.some((entry) => entry.id === value)
}

/**
 * The language to open in when nothing has been chosen.
 *
 * Matched on the primary subtag, so `ko-KR`, `ja-JP` and every flavour of
 * `zh` land somewhere sensible rather than falling through to English. Any
 * Chinese at all resolves to Simplified, since it is the only one that exists
 * here — showing a Traditional reader Simplified is a worse fit than English
 * only if they cannot read it, and they can.
 */
function detect(): LanguageId {
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language ?? '']
  for (const tag of tags) {
    const lower = tag.toLowerCase()
    if (lower.startsWith('ko')) return 'ko'
    if (lower.startsWith('ja')) return 'ja'
    if (lower.startsWith('zh')) return 'zh-Hans'
    if (lower.startsWith('en')) return 'en'
  }
  return 'en'
}

function stored(): LanguageId | null {
  try {
    const raw = localStorage.getItem(KEY) ?? ''
    return isLanguage(raw) ? raw : null
  } catch {
    return null
  }
}

let current: LanguageId = stored() ?? detect()
const listeners: Array<() => void> = []

export function language(): LanguageId {
  return current
}

/**
 * Switches language and repaints everything that asked to be told.
 *
 * Nothing but text changes here. No state is read, written, reset or
 * migrated — which is the property that matters, because a language switch
 * that could drop a run in progress or rewrite a save is not a language
 * switch, it is a hazard.
 */
export function setLanguage(next: LanguageId): void {
  if (next === current) return
  current = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* private mode; the choice applies for this session only */
  }
  applyLanguage()
  for (const listener of listeners) listener()
}

/** Called after every language change, for anything painted from script. */
export function onLanguageChange(listener: () => void): void {
  listeners.push(listener)
}

/**
 * One string, with `{name}` placeholders filled in.
 *
 * Substitution is by name and never by position, because the order these
 * appear in is exactly what differs between the four: English puts the level
 * first and the move count last, Korean puts the move count in the middle, and
 * a positional format would quietly swap them.
 */
export function t(key: StringKey, values: Record<string, string | number> = {}): string {
  const table = TABLES[current] ?? EN
  const raw = table[key] ?? EN[key]
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = values[name]
    return value === undefined ? whole : String(value)
  })
}

/** A number in the current language's digits and grouping. */
export function n(value: number): string {
  try {
    return value.toLocaleString(HTML_LANG[current])
  } catch {
    return String(value)
  }
}

/**
 * Fills in every string that lives in the markup.
 *
 * Static text carries `data-i18n` and attributes carry
 * `data-i18n-<attribute>`, so the HTML stays readable as HTML — the element
 * that says "Play" still says Play in the file — while the language switch
 * still reaches it. Anything painted from script is not here; it goes through
 * `t()` at the point it is written, and is repainted by `onLanguageChange`.
 */
export function applyLanguage(): void {
  const root = document.documentElement
  root.lang = HTML_LANG[current]
  root.dataset.lang = current

  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = node.dataset.i18n
    if (key && key in EN) node.textContent = t(key as StringKey)
  }

  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n-attr]')) {
    // "placeholder:namePlaceholder aria-label:profileAria" — several at once,
    // because one element commonly needs a label and a title that differ.
    for (const pair of (node.dataset.i18nAttr ?? '').split(/\s+/)) {
      const [attribute, key] = pair.split(':')
      if (!attribute || !key || !(key in EN)) continue
      node.setAttribute(attribute, t(key as StringKey))
    }
  }
}
