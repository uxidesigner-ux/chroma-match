/**
 * Friend codes.
 *
 * A code is derived from the account's uid rather than rolled at random and
 * stored. That buys three things: it is the same code on every device the
 * player signs in from, it cannot be lost by a failed write, and anybody
 * holding both halves can check that a code really belongs to the account
 * claiming it — the mapping is a pure function, not a record somebody could
 * have edited.
 *
 * The alphabet drops the characters people mistype when reading a code off a
 * friend's screen: 0/O, 1/I/L, and the vowels that let it spell something.
 */
const ALPHABET = 'BCDFGHJKMNPQRSTVWXYZ23456789'
export const CODE_LENGTH = 7

/**
 * FNV-1a, run twice over the uid with different offsets.
 *
 * One 32-bit pass gives 4.3 billion codes, which sounds like plenty until you
 * remember the birthday bound puts a first collision at around 65,000 players.
 * Two passes stretched over seven characters gives ~10^10, which moves that to
 * the hundreds of thousands — enough for a prototype, and the lookup treats a
 * duplicate as "no such code" rather than handing over the wrong person.
 */
function hash(input: string, offset: number): number {
  let h = offset >>> 0
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/** The code for an account. Stable, and the same everywhere it signs in. */
export function codeFor(uid: string): string {
  let low = hash(uid, 2166136261)
  let high = hash(uid, 84696351)
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    // Drains the low word first, then the high one, so both contribute.
    const source = i < 4 ? low : high
    const index = source % ALPHABET.length
    out += ALPHABET[index]
    if (i < 4) low = Math.floor(low / ALPHABET.length)
    else high = Math.floor(high / ALPHABET.length)
  }
  return out
}

/**
 * What a player typed, turned into a code — or '' if it could never be one.
 *
 * Case is folded and spaces and dashes dropped, because a code read off a
 * friend's screen gets written down in whatever shape feels natural. Anything
 * outside the alphabet is refused rather than guessed at: O is not in the
 * alphabet, but folding it onto Q would silently look up a *different* real
 * player, which is a worse answer than "no such code".
 */
export function normaliseCode(raw: string): string {
  const folded = raw.toUpperCase().replace(/[\s-]/g, '')
  if (folded.length !== CODE_LENGTH) return ''
  for (const char of folded) {
    if (!ALPHABET.includes(char)) return ''
  }
  return folded
}
