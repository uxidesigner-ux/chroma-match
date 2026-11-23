/** Precomputed, normalized WebP sprites; no image processing on the player's main thread. */
const sprites = new Map<string, string>()
let loading: Promise<void> | undefined
const aliases: Record<string, string> = {
  rocket: 'rocket-h', bird: 'cuckoo', 'super-lightball': 'lightball', map: 'castle', kingdom: 'castle',
}

export function rasterIcon(kind: string): string | undefined {
  return sprites.get(kind) ?? sprites.get(aliases[kind] ?? kind)
}

async function loadPack(): Promise<void> {
  const controller = new AbortController()
  const deadline = setTimeout(() => controller.abort(), 4000)
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}royal/sprites-v5.json`, { signal: controller.signal })
    if (!response.ok) return
    const pack: unknown = await response.json()
    if (!pack || typeof pack !== 'object' || !('version' in pack) || pack.version !== 1 || !('sprites' in pack)) return
    const entries = pack.sprites
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return
    const prepared = Object.entries(entries)
    if (!prepared.length || prepared.some(([, value]) => typeof value !== 'string' || !value.startsWith('data:image/webp;base64,'))) return
    for (const [kind, data] of prepared) sprites.set(kind, data as string)
  } catch {
    // The existing original vector icons remain usable on offline/failed requests.
  } finally { clearTimeout(deadline) }
}

export function initRoyalArt(): Promise<void> {
  loading ??= loadPack()
  return loading
}
