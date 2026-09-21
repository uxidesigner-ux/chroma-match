let preference: MediaQueryList | undefined

/** Cache the query, not its value: OS changes must work mid-run too. */
export function reducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  preference ??= window.matchMedia('(prefers-reduced-motion: reduce)')
  return preference.matches
}
