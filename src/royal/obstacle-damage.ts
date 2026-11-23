import type { ObstacleState } from './model.ts'

/** Presentation only: a shell may refill when a cuckoo/dynamite item is collected. */
export function obstacleDamage(obstacle: ObstacleState): {
  shellHits: number; remainingHits: number; contentCount: number; repeating: boolean;
  wear: number; extraLayers: number;
} {
  const shellHits = Math.max(0, obstacle.hp)
  const initial = Math.max(1, obstacle.initialHp)
  const repeating = obstacle.kind === 'cuckoo' || obstacle.kind === 'dynamite'
  const contentCount = Math.max(0, obstacle.stock ?? 1)
  const normalShell = obstacle.kind === 'gift' ? 4 : 3
  // Authored thin shells already look less reinforced; custom high-HP shells
  // progressively wear within each cycle rather than resetting on every draw.
  const wear = Math.max(1 - Math.min(shellHits, normalShell) / normalShell, (initial - shellHits) / Math.max(1, initial - 1))
  return {
    shellHits,
    remainingHits: repeating ? shellHits + Math.max(0, contentCount - 1) * initial : shellHits,
    contentCount, repeating,
    wear: Math.max(0, Math.min(1, wear)),
    extraLayers: Math.max(0, shellHits - (repeating ? 1 : normalShell)),
  }
}
