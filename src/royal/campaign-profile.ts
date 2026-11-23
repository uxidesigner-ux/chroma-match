import type { Difficulty, LevelDefinition } from './model.ts'
export interface CampaignProfile {
  growth: number; phase: number; recovery: boolean; difficulty: Difficulty; rank: number;
  density: number; kinds: number; boxHp: number; giftHp: number; stoneHp: number; iceLength: number; birdStock: number;
}
/** A visible, deterministic rhythm; no outcomes or player failures enter it. */
export function campaignProfile(level: number): CampaignProfile {
  const step = level - 33, phase = step % 10, chapter = Math.floor(step / 10)
  const recovery = phase === 0 || phase === 5
  const difficulty: Difficulty = phase === 9 ? chapter % 4 === 3 ? 'extreme' : 'super-hard' : phase === 3 || phase === 7 ? 'hard' : 'normal'
  const rank = ['normal', 'hard', 'super-hard', 'extreme'].indexOf(difficulty)
  const growth = Math.min(1, Math.log1p(step / 40) / Math.log1p(100000 / 40))
  return {
    growth, phase, recovery, difficulty, rank,
    density: recovery ? .22 + .09 * growth : Math.min(.52, .29 + .12 * growth + rank * .035),
    kinds: recovery ? 2 : Math.min(4, 2 + Math.floor(growth * 2) + (rank >= 1 ? 1 : 0)),
    boxHp: Math.min(4, 2 + Math.floor(growth * 2 + rank * .2)),
    giftHp: Math.min(5, 3 + Math.floor(growth * 2 + rank * .2)),
    stoneHp: Math.min(4, 2 + Math.floor(growth * 1.4 + rank * .2)),
    iceLength: growth >= .35 || rank >= 1 ? 3 : 2,
    birdStock: 2 + Math.floor(growth * 2),
  }
}
export interface CampaignWork {
  playable: number; occupied: number; density: number; hitWork: number; stoneHits: number; birdHits: number;
  dynamiteHits: number; dynamiteStock: number; jellyRemaining: number; kinds: number; effort: number;
}
/** Structural workload, not an estimate or promise of a human win rate. */
export function campaignWork(level: LevelDefinition): CampaignWork {
  const playable = level.mask.join('').split('').filter(c => c === '1').length
  let occupied = 0, hitWork = 0, stoneHits = 0, birdHits = 0, dynamiteHits = 0, dynamiteStock = 0
  for (const o of level.obstacles) {
    occupied += o.cells.length
    const hits = o.hp * (o.kind === 'cuckoo' || o.kind === 'dynamite' ? o.stock ?? 1 : 1)
    hitWork += hits
    if (o.kind === 'stone') stoneHits += hits
    if (o.kind === 'cuckoo') birdHits += hits
    if (o.kind === 'dynamite') { dynamiteHits += hits; dynamiteStock += o.stock ?? 1 }
  }
  const jellyRemaining = level.goals.find(goal => goal.kind === 'jelly')?.count ?? 0
  const blastCredit = Math.min((hitWork - dynamiteHits) * .2, dynamiteStock * 1.5)
  const effort = hitWork + stoneHits * .45 + birdHits * .35 + jellyRemaining * .2 - blastCredit
  return { playable, occupied, density: occupied / playable, hitWork, stoneHits, birdHits, dynamiteHits, dynamiteStock, jellyRemaining, kinds: new Set(level.obstacles.map(o => o.kind)).size, effort }
}
export function campaignMoves(level: LevelDefinition, profile: CampaignProfile): number {
  return Math.max(24, Math.min(54, Math.ceil(19 + campaignWork(level).effort * .35) + (profile.recovery ? 6 : 0) - profile.rank))
}
