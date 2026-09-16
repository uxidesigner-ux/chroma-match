/**
 * mulberry32 — a small, fast, seedable PRNG.
 *
 * The board is seeded so a run can be reproduced from its seed alone, which
 * makes bug reports ("board 4820193 deadlocks on move 12") actually actionable.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number
  /** Integer in [0, n). */
  int(n: number): number
  /** A uniformly chosen element. Throws on an empty list. */
  pick<T>(items: readonly T[]): T
  readonly seed: number
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    seed,
    next,
    int: (n) => Math.floor(next() * n),
    pick<T>(items: readonly T[]): T {
      const v = items[Math.floor(next() * items.length)]
      if (v === undefined) throw new Error('pick() from an empty list')
      return v
    },
  }
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0
}
