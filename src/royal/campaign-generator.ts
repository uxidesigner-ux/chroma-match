import { makeRng } from '../game/rng.ts'
import type { Colour, GoalDefinition, LevelDefinition, ObstacleDefinition, ObstacleKind } from './model.ts'
import { campaignGeometry, connected, matchableCells, neighbours, openSquares, playableCells, selectJellySeeds } from './campaign-geometry.ts'
import { campaignMoves, campaignProfile, type CampaignProfile } from './campaign-profile.ts'

const themes: { name: string; kinds: ObstacleKind[]; jelly: boolean }[] = [
  { name: '정원', kinds: ['box', 'gift', 'ice', 'cuckoo'], jelly: true },
  { name: '회랑', kinds: ['gift', 'cuckoo', 'box', 'stone'], jelly: false },
  { name: '테라스', kinds: ['ice', 'dynamite', 'box', 'gift'], jelly: true },
  { name: '왕실', kinds: ['stone', 'box', 'dynamite', 'gift'], jelly: false },
  { name: '분수', kinds: ['cuckoo', 'gift', 'ice', 'stone'], jelly: true },
  { name: '탑', kinds: ['gift', 'ice', 'dynamite', 'box'], jelly: false },
]
const footprint = (kind: ObstacleKind, profile: CampaignProfile): [number, number] => kind === 'cuckoo' || kind === 'dynamite' ? [2, 2] : kind === 'gift' ? [1, 2] : kind === 'ice' ? [1, profile.iceLength] : [1, 1]

function obstacle(kind: ObstacleKind, cells: number[], serial: number, profile: CampaignProfile, colour: Colour): ObstacleDefinition {
  const hp = kind === 'box' ? profile.boxHp : kind === 'gift' ? profile.giftHp : kind === 'stone' ? profile.stoneHp : kind === 'ice' ? cells.length : 1
  const result: ObstacleDefinition = { id: `${kind}-${serial}`, kind, cells, hp }
  if (kind === 'gift') result.stock = 1
  if (kind === 'cuckoo') { result.stock = profile.birdStock; result.open = true }
  if (kind === 'dynamite') { result.stock = 2; result.colour = colour }
  return result
}

export function generateCampaignLevel(id: number, seed: number, deriveGoals: (level: LevelDefinition) => GoalDefinition[]): LevelDefinition {
  const geometry = campaignGeometry(id), profile = campaignProfile(id), rng = makeRng(seed)
  const { cols, rows, mask } = geometry, theme = themes[rng.int(themes.length)]!
  const kinds = theme.kinds.slice(0, Math.min(profile.kinds, theme.jelly ? 3 : 4))
  const playable = playableCells(geometry), all = [...playable], squares = openSquares(playable, cols, rows)
  const pattern = (id - 33) % 6, focal = all[rng.int(all.length)]!, second = all[rng.int(all.length)]!, stripe = rng.int(3)
  const jitter = Array.from({ length: cols * rows }, () => rng.next())
  const distance = (a: number, b: number): number => Math.abs(a % cols - b % cols) + Math.abs(Math.floor(a / cols) - Math.floor(b / cols))
  const score = (cell: number): number => {
    const c = cell % cols, r = Math.floor(cell / cols)
    const value = pattern === 0 ? Math.min(distance(cell, focal), distance(cell, second))
      : pattern === 1 ? (r + stripe) % 3 * 2
      : pattern === 2 ? Math.abs(c - (cols - 1) / 2) + Math.abs(r - (rows - 1) / 2)
      : pattern === 3 ? Math.min(c, cols - 1 - c, r, rows - 1 - r)
      : pattern === 4 ? Math.abs(c / (cols - 1) - r / (rows - 1)) * 8
      : ((Math.floor(c / 2) + Math.floor(r / 2) + stripe) % 2) * 4
    return value + jitter[cell]! * 1.5
  }
  const anchors = [...all].sort((a, b) => score(a) - score(b))
  for (let i = squares.length - 1; i > 0; i--) { const j = rng.int(i + 1); [squares[i], squares[j]] = [squares[j]!, squares[i]!] }
  const requiredFootprint = kinds.reduce((sum, kind) => { const [w, h] = footprint(kind, profile); return sum + w * h }, 0)
  const budget = Math.min(Math.floor(playable.size * .52), Math.max(requiredFootprint, Math.round(playable.size * profile.density)))
  let best: ObstacleDefinition[] = [], bestKinds = -1, bestOccupied = -1
  // At most six different free match areas, independent of the level number.
  for (const square of squares.slice(0, 6)) {
    const reserved = new Set(square), free = new Set(playable), placed: ObstacleDefinition[] = []
    let used = 0
    const place = (kind: ObstacleKind): boolean => {
      const [width, height] = footprint(kind, profile)
      if (used + width * height > budget) return false
      if (kind === 'dynamite' && placed.some(o => o.kind === kind)) return false
      if (kind === 'cuckoo' && placed.filter(o => o.kind === kind).length >= 2) return false
      // Recovery keeps the mechanic, but cannot fill half its board with stones
      // that each require a newly made power-up. Other requested kinds fill it.
      if (kind === 'stone' && profile.recovery && !kinds.includes('dynamite') && placed.filter(o => o.kind === kind).length >= 2) return false
      for (const anchor of anchors) {
        if (anchor % cols + width > cols || Math.floor(anchor / cols) + height > rows) continue
        const cells = Array.from({ length: width * height }, (_, i) => anchor + Math.floor(i / width) * cols + i % width)
        if (cells.some(cell => !free.has(cell) || reserved.has(cell))) continue
        cells.forEach(cell => free.delete(cell))
        if (free.size < 20 || !connected(free, cols, rows)) { cells.forEach(cell => free.add(cell)); continue }
        const venues = matchableCells(free, cols, rows)
        const accessible = (candidate: Pick<ObstacleDefinition, 'kind' | 'cells'>): boolean => candidate.kind === 'stone' || candidate.cells.some(cell => neighbours(cell, cols, rows).some(n => venues.has(n)))
        if (venues.size < Math.ceil(free.size * .7) || !accessible({ kind, cells }) || placed.some(o => !accessible(o))) { cells.forEach(cell => free.add(cell)); continue }
        placed.push(obstacle(kind, cells, placed.length + 1, profile, rng.int(4) as Colour)); used += cells.length
        return true
      }
      return false
    }
    // Reserve room for each requested mechanic before filling its pattern.
    const order = [...kinds].sort((a, b) => { const x = footprint(a, profile), y = footprint(b, profile); return y[0] * y[1] - x[0] * x[1] })
    for (const kind of order) place(kind)
    let progress = true
    while (progress && used < budget) { progress = false; for (const kind of kinds) if (place(kind)) progress = true }
    const foundKinds = new Set(placed.map(o => o.kind)).size
    if (foundKinds > bestKinds || foundKinds === bestKinds && used > bestOccupied) { best = placed; bestKinds = foundKinds; bestOccupied = used }
    if (foundKinds === kinds.length && used >= budget - 1) break
  }
  const level: LevelDefinition = {
    version: 1, id, name: `${theme.name}의 ${profile.recovery ? '산책' : profile.rank > 1 ? '도전' : '모험'}`,
    cols, rows, mask, seed, moves: 30, difficulty: profile.difficulty, colours: 4, obstacles: best, jelly: [], goals: [], provenance: 'generated',
    description: profile.recovery ? '잠깐 숨을 고르며 새로운 모양의 정원을 둘러보세요.' : '열린 길에서 파워업을 만들고 여러 목표를 함께 해결해 보세요.',
  }
  if (theme.jelly) {
    const occupied = new Set(best.flatMap(o => o.cells)), free = new Set(all.filter(cell => !occupied.has(cell)))
    level.jelly = selectJellySeeds(free, cols, rows, seed)
  }
  level.goals = deriveGoals(level)
  level.moves = campaignMoves(level, profile)
  return level
}
