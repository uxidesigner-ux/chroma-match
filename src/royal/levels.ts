import { makeRng } from '../game/rng.ts'
import { isLevelId, normalizeLevelId } from './progression.ts'
import {
  cellPlayable, type Colour, type Difficulty, type GoalDefinition, type GoalKind,
  type LevelDefinition, type ObstacleDefinition, type ObstacleKind, type Power,
} from './model.ts'

export const CAMPAIGN_MAX_COLS = 8
export const CAMPAIGN_MAX_ROWS = 9
const campaignSize = (cols: number, rows: number): [number, number] => [Math.min(CAMPAIGN_MAX_COLS, cols), Math.min(CAMPAIGN_MAX_ROWS, rows)]

const powers: readonly Power[] = ['rocket-h', 'rocket-v', 'propeller', 'tnt', 'lightball']
const obstacleKinds: readonly ObstacleKind[] = ['box', 'gift', 'ice', 'stone', 'cuckoo', 'dynamite']
const goalKinds: readonly GoalKind[] = ['colour', 'box', 'toy', 'ice', 'stone', 'cuckoo', 'dynamite', 'jelly']
const difficulties: readonly Difficulty[] = ['normal', 'hard', 'super-hard', 'extreme']
const goalOrder: readonly GoalKind[] = ['toy', 'dynamite', 'cuckoo', 'box', 'ice', 'stone', 'jelly', 'colour']
const goalFor: Record<ObstacleKind, GoalKind> = { box: 'box', gift: 'toy', ice: 'ice', stone: 'stone', cuckoo: 'cuckoo', dynamite: 'dynamite' }
const integer = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const seedFor = (id: number): number => {
  const legacy = (Math.imul(id, 2654435761) ^ 0x62de991f) >>> 0
  const high = Math.floor(id / 0x100000000)
  if (!high) return legacy
  // Preserve all existing levels while removing the old forced 2^32-ID period.
  // A finite layout vocabulary can still repeat; uniqueness is not promised.
  let mixed = Math.imul(high, 0x9e3779b9)
  mixed = Math.imul(mixed ^ mixed >>> 16, 0x85ebca6b)
  mixed = Math.imul(mixed ^ mixed >>> 13, 0xc2b2ae35)
  return (legacy ^ mixed ^ mixed >>> 16) >>> 0
}
const inventory = (o: ObstacleDefinition): number => o.kind === 'gift' || o.kind === 'cuckoo' || o.kind === 'dynamite' ? o.stock ?? 1 : 1

/** The goal count is work still required; pre-painted jelly is not counted again. */
export function deriveGoals(level: LevelDefinition): GoalDefinition[] {
  const counts = new Map<GoalKind, number>()
  for (const o of level.obstacles) counts.set(goalFor[o.kind], (counts.get(goalFor[o.kind]) ?? 0) + inventory(o))
  if (level.jelly.length) {
    const remaining = level.mask.join('').split('').filter(c => c === '1').length - new Set(level.jelly).size
    if (remaining > 0) counts.set('jelly', remaining)
  }
  const goals = goalOrder.filter(kind => (counts.get(kind) ?? 0) > 0).map(kind => ({ kind, count: counts.get(kind)! }))
  return goals.length ? goals : [{ kind: 'colour', colour: 0, count: 20 }]
}

/** Editor default. All dimensions are bounded before any allocation occurs. */
export function createBlankLevel(cols = 8, rows = 9): LevelDefinition {
  cols = integer(cols, 5, 12) ? cols : 8
  rows = integer(rows, 5, 12) ? rows : 9
  return {
    version: 1, id: 1, name: '나만의 정원', cols, rows, mask: Array.from({ length: rows }, () => '1'.repeat(cols)),
    moves: 30, difficulty: 'normal', colours: 4, seed: 2026,
    goals: [{ kind: 'colour', colour: 0, count: 20 }], obstacles: [], jelly: [], provenance: 'custom',
  }
}

/** A local design vocabulary, not original Royal Match level geometry. */
type Shape = 'rectangle' | 'rounded' | 'hourglass' | 'courtyard' | 'u' | 'stairs' | 'cross' | 'wings' | 'terrace' | 'windows' | 'arch' | 'diamond'
function shapeMask(cols: number, rows: number, shape: Shape, variation = 0): string[] {
  const left = Math.floor(cols / 3), right = cols - left
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
    let hole = false
    if (shape === 'rounded') hole = (r === 0 || r === rows - 1) && (c === 0 || c === cols - 1)
    if (shape === 'hourglass') hole = r >= 2 && r < rows - 2 && (c === 0 || c === cols - 1)
    if (shape === 'courtyard') hole = r >= 3 && r < rows - 2 && c >= left && c < right
    if (shape === 'u') hole = r >= 3 + variation % 2 && c >= left && c < right
    if (shape === 'stairs') hole = r >= rows - 3 && c < r - (rows - 3) + 1
    if (shape === 'cross') hole = (r < 2 || r >= rows - 2) && (c < 1 || c >= cols - 1)
    if (shape === 'wings') hole = Math.abs(r - (rows - 1) / 2) > 1.5 && c >= left && c < right
    if (shape === 'terrace') hole = r >= rows - 4 && c >= cols - (r - (rows - 4) + 1)
    if (shape === 'windows') hole = (r === 3 || r === rows - 3) && (c === 2 || c === cols - 3)
    if (shape === 'arch') hole = r < 2 && c >= left && c < right
    if (shape === 'diamond') {
      const inset = Math.max(0, 2 - Math.min(r, rows - 1 - r))
      hole = c < inset || c >= cols - inset
    }
    return hole ? '0' : '1'
  }).join(''))
}

interface Recipe {
  name: string; size: [number, number]; shape: Shape; moves: number; difficulty?: Difficulty
  boxes?: number; gifts?: number; ice?: number; stone?: number; cuckoo?: number; dynamite?: number; jelly?: boolean
  colours?: { colour: Colour; count: number }[]; introduction: string
}
const recipes: readonly Recipe[] = [
  { name: '왕실 정원의 아침', size: [6, 7], shape: 'rectangle', moves: 22, colours: [{ colour: 0, count: 20 }], introduction: '왕관을 모으세요. 같은 블록 3개를 맞추면 목표가 줄어들어요.' },
  { name: '두 가지 색의 길', size: [7, 7], shape: 'rounded', moves: 24, colours: [{ colour: 1, count: 18 }, { colour: 2, count: 18 }], introduction: '책과 방패를 모으세요. 4개 일자는 로켓이 돼요.' },
  { name: '정원 창고', size: [7, 8], shape: 'rectangle', moves: 24, boxes: 6, introduction: '상자 옆에서 매치하면 상자가 부서져요.' },
  { name: '계단 위 상자', size: [8, 8], shape: 'stairs', moves: 25, boxes: 8, introduction: '빈 공간을 살피고 상자 가까이에서 매치하세요.' },
  { name: '첫 번째 선물', size: [7, 8], shape: 'rounded', moves: 28, gifts: 3, introduction: '선물상자를 네 번 맞춰 장난감을 꺼내세요.' },
  { name: '선물의 회랑', size: [8, 9], shape: 'u', moves: 29, gifts: 4, boxes: 3, introduction: '여러 칸짜리 선물상자는 하나의 물건이에요.' },
  { name: '보랏빛 정원', size: [7, 8], shape: 'rectangle', moves: 27, jelly: true, introduction: '젤리 위에서 매치하면 젤리가 퍼져요. 보드를 보랏빛으로 채우세요.' },
  { name: '정원의 문', size: [8, 9], shape: 'arch', moves: 27, difficulty: 'hard', boxes: 8, jelly: true, introduction: '상자를 열고 남은 칸까지 젤리를 퍼뜨리세요.' },
  { name: '얼음 길', size: [8, 8], shape: 'hourglass', moves: 28, ice: 5, introduction: '얼음 옆에서 매치하면 끝부분이 줄어들어요. 길을 열어 보세요.' },
  { name: '겨울의 선물', size: [8, 9], shape: 'cross', moves: 30, gifts: 4, ice: 3, introduction: '선물과 얼음 사이에 로켓을 만들어 보세요.' },
  { name: '뻐꾸기 시계', size: [8, 8], shape: 'rectangle', moves: 28, cuckoo: 1, boxes: 4, introduction: '둥지 문이 열린 차례에 옆에서 매치하면 새를 모을 수 있어요.' },
  { name: '두 개의 둥지', size: [8, 9], shape: 'wings', moves: 31, cuckoo: 2, jelly: true, introduction: '문은 이동마다 열리고 닫혀요. 열린 둥지를 찾아보세요.' },
  { name: '돌의 정원', size: [8, 9], shape: 'terrace', moves: 30, stone: 3, boxes: 5, introduction: '돌은 파워업으로 세 번 타격해야 부서져요.' },
  { name: '회랑의 불꽃', size: [8, 8], shape: 'rounded', moves: 29, dynamite: 1, introduction: '다이너마이트와 같은 색을 옆에서 매치하면 큰 폭발이 일어나요.' },
  { name: '왕실 금고', size: [8, 9], shape: 'courtyard', moves: 28, difficulty: 'super-hard', gifts: 5, stone: 3, introduction: '파워업끼리 합치면 두꺼운 장애물도 빠르게 열 수 있어요.' },
  { name: '햇살 아래 젤리', size: [8, 9], shape: 'diamond', moves: 30, jelly: true, colours: [{ colour: 3, count: 24 }], introduction: '잎을 모으며 가장자리까지 젤리를 퍼뜨리세요.' },
  { name: '정원 파티', size: [8, 9], shape: 'rounded', moves: 32, gifts: 6, cuckoo: 1, introduction: '선물의 장난감과 열린 둥지의 새를 함께 모으세요.' },
  { name: '유리창 너머', size: [8, 9], shape: 'windows', moves: 29, ice: 6, jelly: true, introduction: '작은 빈 칸들이 낙하 경로를 나눠요.' },
  { name: '불꽃 분수', size: [8, 9], shape: 'u', moves: 30, dynamite: 1, boxes: 10, jelly: true, introduction: '다이너마이트로 넓은 보드의 상자들을 동시에 타격하세요.' },
  { name: '왕의 시험', size: [8, 9], shape: 'wings', moves: 28, difficulty: 'extreme', gifts: 5, stone: 4, cuckoo: 1, introduction: '목표가 많은 판에서는 특수 블록 조합이 큰 도움이 돼요.' },
  { name: '새로운 산책', size: [7, 8], shape: 'cross', moves: 28, boxes: 5, colours: [{ colour: 0, count: 24 }], introduction: '잠깐 숨을 고르며 왕관과 상자를 모으세요.' },
  { name: '연못의 선물', size: [8, 9], shape: 'courtyard', moves: 32, gifts: 7, jelly: true, introduction: '선물 아래에 있던 바닥도 젤리로 채워야 해요.' },
  { name: '얼음 탑', size: [8, 9], shape: 'terrace', moves: 31, ice: 8, cuckoo: 1, introduction: '계단 모양 테라스의 얼음을 깨고 열린 둥지의 새를 모으세요.' },
  { name: '황금 다리', size: [8, 9], shape: 'wings', moves: 29, difficulty: 'hard', gifts: 6, dynamite: 1, introduction: '양쪽 날개를 잇는 중앙 통로가 중요해요.' },
  { name: '꽃잎 미로', size: [8, 9], shape: 'windows', moves: 32, boxes: 8, ice: 4, jelly: true, introduction: '여러 곳에 퍼진 젤리를 연결해 보세요.' },
  { name: '시계의 무도회', size: [8, 9], shape: 'rounded', moves: 32, cuckoo: 2, gifts: 5, introduction: '열린 둥지와 선물상자에 맞는 순서로 움직이세요.' },
  { name: '돌과 불꽃', size: [8, 9], shape: 'hourglass', moves: 30, stone: 5, dynamite: 1, introduction: '다이너마이트와 파워업으로 돌의 겹을 벗겨내세요.' },
  { name: '별빛 회랑', size: [8, 9], shape: 'u', moves: 30, difficulty: 'super-hard', gifts: 7, cuckoo: 1, jelly: true, introduction: '좁은 날개에서도 프로펠러로 먼 목표를 도울 수 있어요.' },
  { name: '왕실 축제', size: [8, 9], shape: 'arch', moves: 33, gifts: 6, ice: 4, dynamite: 1, introduction: '여러 기믹이 만난 정원에서 큰 연쇄를 만들어 보세요.' },
  { name: '왕관의 정원', size: [8, 9], shape: 'courtyard', moves: 29, difficulty: 'extreme', stone: 5, gifts: 7, cuckoo: 1, jelly: true, introduction: '목표와 남은 이동을 살피며 모든 장치를 활용하세요.' },
  { name: '비밀의 테라스', size: [8, 9], shape: 'terrace', moves: 32, boxes: 10, jelly: true, introduction: '계단 모양 가장자리까지 젤리를 퍼뜨려 보세요.' },
  { name: '축하의 불꽃', size: [8, 9], shape: 'diamond', moves: 33, dynamite: 2, gifts: 6, introduction: '색을 맞춰 다이너마이트를 연속으로 작동시키세요.' },
]

/** Keep a wide free match area in the centre, rather than fencing off every spawn. */
function decorate(level: LevelDefinition, recipe: Recipe): void {
  const rng = makeRng(level.seed)
  const occupied = new Set<number>()
  const centerR = Math.floor(level.rows / 2), centerC = Math.floor(level.cols / 2)
  const reserved = new Set<number>()
  // Prefer a real free 3×3 region. Wings/U boards may need an off-centre region.
  outer: for (let r = 0; r <= level.rows - 3; r++) for (let c = 0; c <= level.cols - 3; c++) {
    const block = Array.from({ length: 9 }, (_, i) => (r + Math.floor(i / 3)) * level.cols + c + i % 3)
    if (block.every(cell => cellPlayable(level, cell))) { block.forEach(cell => reserved.add(cell)); break outer }
  }
  const anchors = Array.from({ length: level.cols * level.rows }, (_, i) => i).filter(i => cellPlayable(level, i))
  // Seeded shuffle gives each authored recipe its own stable authored placement.
  for (let i = anchors.length - 1; i > 0; i--) { const j = rng.int(i + 1); [anchors[i], anchors[j]] = [anchors[j]!, anchors[i]!] }
  anchors.sort((a, b) => {
    const da = Math.abs(Math.floor(a / level.cols) - centerR) + Math.abs(a % level.cols - centerC)
    const db = Math.abs(Math.floor(b / level.cols) - centerR) + Math.abs(b % level.cols - centerC)
    return db - da
  })
  const place = (kind: ObstacleKind, count: number, width: number, height: number): void => {
    for (let i = 0; i < count; i++) {
      let placed = false
      for (const anchor of anchors) {
        const c = anchor % level.cols, r = Math.floor(anchor / level.cols)
        if (c + width > level.cols || r + height > level.rows) continue
        const cells = Array.from({ length: width * height }, (_, k) => (r + Math.floor(k / width)) * level.cols + c + k % width)
        if (cells.some(cell => !cellPlayable(level, cell) || occupied.has(cell) || reserved.has(cell))) continue
        const o: ObstacleDefinition = { id: `${kind}-${i + 1}`, kind, cells, hp: kind === 'gift' ? 4 : kind === 'stone' ? 3 : kind === 'ice' ? 3 : kind === 'box' ? level.id > 12 ? 3 : 2 : 1 }
        if (kind === 'gift') o.stock = 1
        if (kind === 'cuckoo') { o.stock = 2; o.open = true }
        if (kind === 'dynamite') { o.stock = 4; o.colour = i % 4 as Colour }
        level.obstacles.push(o); cells.forEach(cell => occupied.add(cell)); placed = true; break
      }
      if (!placed) break
    }
  }
  // Big objects get their footprints before small obstacles fill remaining space.
  place('dynamite', recipe.dynamite ?? 0, 2, 2)
  place('cuckoo', recipe.cuckoo ?? 0, 2, 2)
  place('gift', recipe.gifts ?? 0, 1, 2)
  place('stone', recipe.stone ?? 0, 1, 1)
  place('ice', recipe.ice ?? 0, 1, 3)
  place('box', recipe.boxes ?? 0, 1, 1)
  if (recipe.jelly) {
    const components = boardComponents(level)
    level.jelly = components.flatMap(component => {
      const free = component.filter(cell => !occupied.has(cell))
      const choices = free.length ? free : component
      return [choices[Math.floor(choices.length / 3)]!, choices[Math.floor(choices.length * 2 / 3)]!]
    }).filter((cell, i, a) => a.indexOf(cell) === i)
  }
  level.goals = deriveGoals(level)
  if (recipe.colours?.length) {
    if (!level.obstacles.length && !level.jelly.length) level.goals = []
    level.goals.push(...recipe.colours.map(g => ({ kind: 'colour' as const, ...g })))
  }
}

function authored(id: number): LevelDefinition {
  const recipe = recipes[id - 1]!
  const [cols, rows] = campaignSize(...recipe.size)
  const level: LevelDefinition = {
    version: 1, id, name: recipe.name, cols, rows, mask: shapeMask(cols, rows, recipe.shape), moves: recipe.moves,
    difficulty: recipe.difficulty ?? 'normal', colours: 4, seed: seedFor(id), goals: [], obstacles: [], jelly: [],
    provenance: 'authored', description: recipe.introduction,
  }
  decorate(level, recipe)
  return level
}

function reference12297(): LevelDefinition {
  const level: LevelDefinition = {
    version: 1, id: 12297, name: '왕실의 선물', cols: 9, rows: 11,
    mask: ['111111111', '111111111', '111111111', '111111111', ...Array.from({ length: 7 }, () => '111001111')],
    moves: 32, difficulty: 'extreme', colours: 4, seed: seedFor(12297), goals: [], obstacles: [], jelly: [77, 78, 86, 87],
    provenance: 'reference-reconstruction',
    description: '공유한 레벨 12297의 보드와 기믹을 참고한 재구성입니다. 시작 배치와 이동 수는 개인 플레이에 맞춰 정했습니다.',
  }
  const giftPositions: [number, number][] = [[0, 0], [1, 0], [2, 0], [0, 3], [1, 4], [2, 5], [0, 7], [1, 8], [2, 9]]
  level.obstacles = giftPositions.map(([c, r], i) => ({ id: `gift-${i + 1}`, kind: 'gift', cells: [r * 9 + c, (r + 1) * 9 + c], hp: 4, stock: 2 }))
  level.obstacles.push(
    { id: 'dynamite-1', kind: 'dynamite', cells: [21, 22, 30, 31], hp: 1, stock: 8, colour: 0 },
    { id: 'cuckoo-1', kind: 'cuckoo', cells: [24, 25, 33, 34], hp: 1, stock: 2, open: true },
  )
  level.goals = deriveGoals(level)
  return level
}

function generated(id: number): LevelDefinition {
  const seed = seedFor(id), rng = makeRng(seed)
  // Keep both original RNG draws so existing compact boards, shape families,
  // difficulty and move budgets retain their seeded campaign identities.
  const designedCols = 7 + rng.int(4), designedRows = 8 + rng.int(4)
  const [cols, rows] = campaignSize(designedCols, designedRows)
  const shapes: Shape[] = ['rectangle', 'rounded', 'hourglass', 'courtyard', 'u', 'stairs', 'cross', 'wings', 'terrace', 'windows', 'arch', 'diamond']
  const shape = rng.pick(shapes)
  const roll = rng.int(20)
  const difficulty: Difficulty = roll === 0 ? 'extreme' : roll < 4 ? 'super-hard' : roll < 9 ? 'hard' : 'normal'
  const tier = Math.min(4, Math.floor((id - 33) / 20))
  const rank = difficulties.indexOf(difficulty)
  const archetype = rng.int(6)
  const recipe: Recipe = {
    name: `${['정원', '회랑', '테라스', '왕실', '분수', '탑'][archetype]}의 모험`, size: [cols, rows], shape,
    moves: 33 + Math.floor((designedCols * designedRows - 70) / 12) - rank * 2, difficulty,
    introduction: '목표와 보드 모양에 맞춰 특수 블록을 활용해 보세요.',
  }
  if (archetype === 0) { recipe.boxes = 7 + tier + rank; recipe.gifts = 3 + rank; recipe.jelly = true }
  if (archetype === 1) { recipe.gifts = 5 + tier; recipe.cuckoo = rank > 1 ? 2 : 1 }
  if (archetype === 2) { recipe.ice = 6 + tier; recipe.dynamite = 1; recipe.jelly = true }
  if (archetype === 3) { recipe.stone = 3 + rank; recipe.boxes = 5 + tier; recipe.dynamite = 1 }
  if (archetype === 4) { recipe.cuckoo = 2; recipe.gifts = 4 + rank; recipe.jelly = true }
  if (archetype === 5) { recipe.gifts = 4 + tier; recipe.ice = 3 + rank; recipe.dynamite = 1 }
  const level: LevelDefinition = {
    version: 1, id, name: recipe.name, cols, rows, mask: shapeMask(cols, rows, shape, rng.int(3)), moves: recipe.moves,
    difficulty, colours: 4, seed, goals: [], obstacles: [], jelly: [], provenance: 'generated', description: recipe.introduction,
  }
  decorate(level, recipe)
  return level
}

/** Returns a fresh independent definition, so editor changes never mutate the campaign. */
export function getLevel(requested: number): LevelDefinition {
  const id = normalizeLevelId(requested)
  return id === 12297 ? reference12297() : id <= recipes.length ? authored(id) : generated(id)
}

export const AUTHORED_LEVEL_COUNT = recipes.length
export const LEVEL_PREVIEWS = recipes.map((recipe, i) => {
  const [cols, rows] = campaignSize(...recipe.size)
  return { id: i + 1, name: recipe.name, difficulty: recipe.difficulty ?? 'normal' as Difficulty, cols, rows }
})

function adjacent(cell: number, cols: number, total: number): number[] {
  return [cell % cols > 0 ? cell - 1 : -1, cell % cols < cols - 1 ? cell + 1 : -1, cell - cols, cell + cols].filter(c => c >= 0 && c < total)
}
function boardComponents(level: Pick<LevelDefinition, 'cols' | 'rows' | 'mask'>): number[][] {
  const cells = new Set(Array.from({ length: level.cols * level.rows }, (_, i) => i).filter(i => level.mask[Math.floor(i / level.cols)]?.[i % level.cols] === '1'))
  const result: number[][] = []
  while (cells.size) {
    const start = cells.values().next().value as number
    const component = [start]; cells.delete(start)
    for (let p = 0; p < component.length; p++) for (const cell of adjacent(component[p]!, level.cols, level.cols * level.rows)) {
      if (cells.delete(cell)) component.push(cell)
    }
    result.push(component)
  }
  return result
}

/** Validate bounded imported data before it can allocate board state or reach rendering. */
export function validateLevel(value: unknown): { level?: LevelDefinition; errors: string[] } {
  const errors: string[] = []
  if (!record(value)) return { errors: ['레벨은 JSON 객체여야 합니다.'] }
  const v = value
  const topKeys = new Set(['version', 'id', 'name', 'cols', 'rows', 'mask', 'moves', 'difficulty', 'colours', 'seed', 'goals', 'obstacles', 'jelly', 'pieces', 'provenance', 'description'])
  if (Object.keys(v).some(key => !topKeys.has(key))) errors.push('알 수 없는 레벨 속성이 있습니다.')
  const bad = (condition: boolean, message: string): void => { if (condition) errors.push(message) }
  bad(v.version !== 1, '지원하는 레벨 형식은 version 1입니다.')
  bad(!isLevelId(v.id), '레벨 번호는 1 이상의 안전한 정수여야 합니다.')
  bad(typeof v.name !== 'string' || v.name.trim().length < 1 || v.name.length > 80, '이름은 1~80자로 입력하세요.')
  bad(!integer(v.cols, 5, 12) || !integer(v.rows, 5, 12), '보드 가로·세로는 각각 5~12칸이어야 합니다.')
  bad(!integer(v.moves, 1, 200), '이동 횟수는 1~200 정수여야 합니다.')
  bad(!integer(v.colours, 3, 4), '블록 색상 수는 3 또는 4여야 합니다.')
  bad(!integer(v.seed, 0, 0xffffffff), '배치 번호는 0~4294967295 정수여야 합니다.')
  bad(!difficulties.includes(v.difficulty as Difficulty), '난이도 값이 올바르지 않습니다.')
  bad(!['authored', 'generated', 'reference-reconstruction', 'custom'].includes(v.provenance as string), '레벨 출처 값이 올바르지 않습니다.')
  bad(v.description !== undefined && (typeof v.description !== 'string' || v.description.length > 1000), '설명은 1000자 이하 문자열이어야 합니다.')
  if (!integer(v.cols, 5, 12) || !integer(v.rows, 5, 12)) return { errors }
  const cols = v.cols, rows = v.rows, total = cols * rows
  if (!Array.isArray(v.mask) || v.mask.length !== rows || v.mask.some(row => typeof row !== 'string' || row.length !== cols || !/^[01]+$/.test(row))) {
    errors.push('보드 모양은 행 수와 같은 길이의 0·1 문자열 배열이어야 합니다.')
    return { errors }
  }
  const mask = v.mask as string[]
  const playable = (cell: unknown): cell is number => integer(cell, 0, total - 1) && mask[Math.floor(cell / cols)]![cell % cols] === '1'
  const cellCount = mask.join('').split('').filter(c => c === '1').length
  bad(cellCount < 12, '사용 가능한 보드 칸이 최소 12개 필요합니다.')
  const obstacles: ObstacleDefinition[] = [], occupied = new Set<number>(), ids = new Set<string>()
  if (!Array.isArray(v.obstacles) || v.obstacles.length > total) errors.push('장애물 목록이 올바르지 않거나 너무 많습니다.')
  else for (const [index, raw] of v.obstacles.entries()) {
    const prefix = `장애물 ${index + 1}: `
    if (!record(raw)) { errors.push(prefix + '객체여야 합니다.'); continue }
    const before = errors.length
    bad(Object.keys(raw).some(key => !['id', 'kind', 'cells', 'hp', 'stock', 'open', 'colour'].includes(key)), prefix + '알 수 없는 속성이 있습니다.')
    bad(typeof raw.id !== 'string' || raw.id.length < 1 || raw.id.length > 48 || ids.has(raw.id), prefix + '고유한 ID가 필요합니다.')
    if (typeof raw.id === 'string') ids.add(raw.id)
    bad(!obstacleKinds.includes(raw.kind as ObstacleKind), prefix + '종류가 올바르지 않습니다.')
    bad(!integer(raw.hp, 1, 12), prefix + '내구도는 1~12 정수여야 합니다.')
    bad(raw.stock !== undefined && !integer(raw.stock, 1, 100), prefix + '수량은 1~100 정수여야 합니다.')
    bad(raw.open !== undefined && typeof raw.open !== 'boolean', prefix + '문 상태는 true 또는 false여야 합니다.')
    bad(raw.colour !== undefined && (!integer(raw.colour, 0, 3) || (typeof v.colours === 'number' && raw.colour >= v.colours)), prefix + '색상 값이 올바르지 않습니다.')
    if (!Array.isArray(raw.cells) || raw.cells.length < 1 || raw.cells.length > 16 || raw.cells.some(cell => !playable(cell))) errors.push(prefix + '점유 칸은 실제 보드 안의 1~16칸이어야 합니다.')
    else {
      const cells = raw.cells as number[], own = new Set(cells)
      bad(own.size !== cells.length || cells.some(cell => occupied.has(cell)), prefix + '다른 장애물 또는 자기 자신과 겹칩니다.')
      const seen = new Set<number>([cells[0]!]), queue = [cells[0]!]
      for (let p = 0; p < queue.length; p++) for (const next of adjacent(queue[p]!, cols, total)) if (own.has(next) && !seen.has(next)) { seen.add(next); queue.push(next) }
      bad(seen.size !== own.size, prefix + '점유 칸들은 서로 연결되어야 합니다.')
      cells.forEach(cell => occupied.add(cell))
    }
    if (errors.length === before) {
      const obstacle: ObstacleDefinition = { id: raw.id as string, kind: raw.kind as ObstacleKind, cells: [...raw.cells as number[]], hp: raw.hp as number }
      if (raw.stock !== undefined) obstacle.stock = raw.stock as number
      if (raw.open !== undefined) obstacle.open = raw.open as boolean
      if (raw.colour !== undefined) obstacle.colour = raw.colour as Colour
      obstacles.push(obstacle)
    }
  }
  const jelly: number[] = []
  if (!Array.isArray(v.jelly) || v.jelly.length > total || v.jelly.some(cell => !playable(cell)) || new Set(v.jelly).size !== v.jelly.length) errors.push('젤리 위치는 중복되지 않는 보드 칸이어야 합니다.')
  else jelly.push(...v.jelly as number[])
  const goals: GoalDefinition[] = [], goalIds = new Set<string>()
  if (!Array.isArray(v.goals) || v.goals.length < 1 || v.goals.length > 8) errors.push('목표는 1~8개가 필요합니다.')
  else for (const [index, raw] of v.goals.entries()) {
    const prefix = `목표 ${index + 1}: `
    if (!record(raw)) { errors.push(prefix + '객체여야 합니다.'); continue }
    const before = errors.length
    bad(Object.keys(raw).some(key => !['kind', 'count', 'colour'].includes(key)), prefix + '알 수 없는 속성이 있습니다.')
    bad(!goalKinds.includes(raw.kind as GoalKind), prefix + '종류가 올바르지 않습니다.')
    bad(!integer(raw.count, 1, 2000), prefix + '수량은 1~2000 정수여야 합니다.')
    if (raw.kind === 'colour') bad(!integer(raw.colour, 0, 3) || (typeof v.colours === 'number' && raw.colour >= v.colours), prefix + '모을 색을 지정하세요.')
    else bad(raw.colour !== undefined, prefix + '색상은 블록 수집 목표에만 지정할 수 있습니다.')
    const identity = `${String(raw.kind)}:${String(raw.colour ?? '')}`
    bad(goalIds.has(identity), prefix + '동일한 목표가 중복됩니다.'); goalIds.add(identity)
    if (errors.length === before) {
      const goal: GoalDefinition = { kind: raw.kind as GoalKind, count: raw.count as number }
      if (raw.colour !== undefined) goal.colour = raw.colour as Colour
      goals.push(goal)
    }
  }
  let pieces: LevelDefinition['pieces']
  if (v.pieces !== undefined) {
    pieces = []; const pieceCells = new Set<number>()
    if (!Array.isArray(v.pieces) || v.pieces.length > total) errors.push('초기 블록 목록이 올바르지 않습니다.')
    else for (const [index, raw] of v.pieces.entries()) {
      const prefix = `초기 블록 ${index + 1}: `
      if (!record(raw)) { errors.push(prefix + '객체여야 합니다.'); continue }
      const before = errors.length
      bad(Object.keys(raw).some(key => !['cell', 'colour', 'power'].includes(key)), prefix + '알 수 없는 속성이 있습니다.')
      bad(!playable(raw.cell) || occupied.has(raw.cell as number) || pieceCells.has(raw.cell as number), prefix + '칸이 비어 있거나 장애물·다른 블록과 겹칩니다.')
      if (typeof raw.cell === 'number') pieceCells.add(raw.cell)
      bad(!integer(raw.colour, 0, 3) || (typeof v.colours === 'number' && raw.colour >= v.colours), prefix + '색상이 올바르지 않습니다.')
      bad(raw.power !== undefined && !powers.includes(raw.power as Power), prefix + '특수 블록 종류가 올바르지 않습니다.')
      if (errors.length === before) {
        const piece: NonNullable<LevelDefinition['pieces']>[number] = { cell: raw.cell as number, colour: raw.colour as Colour }
        if (raw.power !== undefined) piece.power = raw.power as Power
        pieces.push(piece)
      }
    }
  }
  const free = Array.from({ length: total }, (_, i) => i).filter(cell => playable(cell) && !occupied.has(cell))
  bad(free.length < 9, '장애물을 제외한 빈 칸이 최소 9개 필요합니다.')
  const freeSet = new Set(free)
  const matchSpace = free.some(cell => {
    const c = cell % cols, r = Math.floor(cell / cols)
    return (c + 2 < cols && [cell + 1, cell + 2].every(n => freeSet.has(n))) || (r + 2 < rows && [cell + cols, cell + cols * 2].every(n => freeSet.has(n)))
  })
  bad(!matchSpace, '일반 매치를 만들 수 있는 연속된 빈 칸이 필요합니다.')
  const capacity = new Map<GoalKind, number>()
  for (const o of obstacles) capacity.set(goalFor[o.kind], (capacity.get(goalFor[o.kind]) ?? 0) + inventory(o))
  for (const goal of goals) {
    if (goal.kind === 'jelly') {
      bad(jelly.length === 0, '젤리 목표에는 시작 젤리가 필요합니다.')
      bad(goal.count > cellCount - jelly.length, '젤리 목표가 아직 칠하지 않은 보드 칸보다 많습니다.')
      for (const component of boardComponents({ cols, rows, mask })) bad(component.some(cell => !jelly.includes(cell)) && !component.some(cell => jelly.includes(cell)), '분리된 각 보드에는 시작 젤리가 필요합니다.')
    } else if (goal.kind !== 'colour') bad(goal.count > (capacity.get(goal.kind) ?? 0), '목표 수량이 실제 장애물·아이템 수량보다 많습니다.')
  }
  if (errors.length) return { errors: [...new Set(errors)] }
  const level: LevelDefinition = {
    version: 1, id: v.id as number, name: (v.name as string).trim(), cols, rows, mask: [...mask], moves: v.moves as number,
    difficulty: v.difficulty as Difficulty, colours: v.colours as number, seed: v.seed as number, goals, obstacles, jelly,
    provenance: v.provenance as LevelDefinition['provenance'],
  }
  if (typeof v.description === 'string') level.description = v.description
  if (pieces) level.pieces = pieces
  return { level, errors: [] }
}
