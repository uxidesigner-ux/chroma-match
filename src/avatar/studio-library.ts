import { decodeSpec, encodeSpec, isKnownSpec } from './spec.ts'
import type { AnimeSpec } from './anime-spec.ts'

export const LIBRARY_KEY = 'chroma-match:studio-library-v1'
export const LIBRARY_LIMIT = 12
export interface SavedLook { id: string; name: string; code: string }
export const SEED_CREDIT = 'Seed-san by VirtualCast, Inc. — VRM Public License 1.0. Modified colours, hair and equipment.'

/** Only allow known appearance codes; imports cannot introduce URLs or executable data. */
export function parseLookFile(text: string): AnimeSpec {
  if (text.length > 16384) throw new Error('File too large')
  const data: unknown = JSON.parse(text)
  if (!data || typeof data !== 'object') throw new Error('Invalid character file')
  const record = data as Record<string, unknown>
  if (record.format !== 'chroma-character' || record.version !== 1 ||
    typeof record.code !== 'string' || !isKnownSpec(record.code)) throw new Error('Unsupported character file')
  return decodeSpec(record.code)
}

export function lookFile(spec: AnimeSpec): string {
  return JSON.stringify({ format: 'chroma-character', version: 1, code: encodeSpec(spec),
    credit: SEED_CREDIT, license: 'https://vrm.dev/licenses/1.0/' }, null, 2)
}

export function readLibrary(storage: Pick<Storage, 'getItem'>): SavedLook[] {
  try {
    const data: unknown = JSON.parse(storage.getItem(LIBRARY_KEY) ?? '[]')
    if (!Array.isArray(data) || data.length > LIBRARY_LIMIT) return []
    const ids = new Set<string>()
    return data.filter((row): row is SavedLook => {
      if (!row || typeof row !== 'object' || typeof row.id !== 'string' ||
        !/^[\w-]{1,64}$/.test(row.id) || ids.has(row.id) ||
        typeof row.name !== 'string' || !row.name.trim() || row.name.length > 32 ||
        typeof row.code !== 'string' || !isKnownSpec(row.code)) return false
      ids.add(row.id)
      return true
    })
  } catch { return [] }
}

export function writeLibrary(storage: Pick<Storage, 'setItem'>, looks: SavedLook[]): boolean {
  try {
    if (looks.length > LIBRARY_LIMIT) return false
    storage.setItem(LIBRARY_KEY, JSON.stringify(looks))
    return true
  } catch { return false }
}

/** Bounded history records appearances, never large model or portrait buffers. */
export class LookHistory {
  private past: string[] = []
  private future: string[] = []
  get canUndo(): boolean { return this.past.length > 0 }
  get canRedo(): boolean { return this.future.length > 0 }
  push(previous: AnimeSpec, next: AnimeSpec): void {
    if (encodeSpec(previous) === encodeSpec(next)) return
    this.past.push(encodeSpec(previous))
    if (this.past.length > 64) this.past.shift()
    this.future = []
  }
  undo(current: AnimeSpec): AnimeSpec {
    const code = this.past.pop()
    if (!code) return current
    this.future.push(encodeSpec(current))
    return decodeSpec(code)
  }
  redo(current: AnimeSpec): AnimeSpec {
    const code = this.future.pop()
    if (!code) return current
    this.past.push(encodeSpec(current))
    return decodeSpec(code)
  }
}
