import { findMatches, findMoves, powerFor } from './board.ts'
import type { Move } from './board.ts'
import type { Game } from './game.ts'

/**
 * A simulated player.
 *
 * This lived in the tuning script, where it decides every number the sweep
 * reports. It is out here now because the same player is worth driving the real
 * UI with: a board measured by one heuristic and demonstrated with another is
 * two different games. The debug handle exposes it as `chroma.best()`.
 */
/**
 * Stands in for a player who is paying attention but not solving the board:
 * takes the swap with the largest immediate clear, preferring one that leaves a
 * power gem. It does not look ahead to cascades, which no casual player does.
 */
export function bestMove(game: Game): Move | null {
  const moves = findMoves(game.geom, game.grid)
  if (moves.length === 0) return null
  let best = moves[0] as Move
  let bestScore = -1
  for (const move of moves) {
    const a = game.grid[move.a] ?? null
    const b = game.grid[move.b] ?? null
    if (!a || !b) continue
    game.grid[move.a] = b
    game.grid[move.b] = a
    let score = 0
    // Swapping a rainbow forms no line, so findMatches reports nothing for it.
    // Scoring that as zero would leave the simulated player never firing the
    // strongest move in the game, and understate what the board can produce.
    if (a.power === 'rainbow' || b.power === 'rainbow') {
      const colour = a.power === 'rainbow' ? b.kind : a.kind
      score = game.grid.filter((g) => g && g.kind === colour).length + 4
    }
    for (const group of findMatches(game.geom, game.grid)) {
      score += group.cells.length
      const power = powerFor(group)
      if (power === 'rainbow') score += 8
      else if (power === 'bomb') score += 5
      else if (power !== 'none') score += 3
    }
    game.grid[move.a] = a
    game.grid[move.b] = b
    if (score > bestScore) {
      bestScore = score
      best = move
    }
  }
  return best
}
