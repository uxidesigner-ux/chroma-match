export type Shape = 'circle' | 'triangle' | 'square' | 'diamond' | 'hexagon' | 'flower'

export interface GemStyle {
  name: string
  /**
   * Every colour also gets its own silhouette. Colour alone is not a reliable
   * signal — roughly one player in twelve cannot separate the red and the green
   * at a glance — so the shape carries the same information independently.
   */
  shape: Shape
  base: string
  light: string
  dark: string
}

export const PALETTE: readonly GemStyle[] = [
  { name: 'Ruby', shape: 'circle', base: '#FF4D6D', light: '#FF9BB0', dark: '#B01235' },
  { name: 'Amber', shape: 'triangle', base: '#FFB020', light: '#FFD782', dark: '#B06800' },
  { name: 'Mint', shape: 'square', base: '#34D399', light: '#8DF3C8', dark: '#0B7D57' },
  { name: 'Azure', shape: 'diamond', base: '#38BDF8', light: '#9BDFFF', dark: '#0B6E9E' },
  { name: 'Indigo', shape: 'hexagon', base: '#818CF8', light: '#C2C8FF', dark: '#3B34B8' },
  { name: 'Orchid', shape: 'flower', base: '#E879F9', light: '#F7BEFF', dark: '#96189F' },
]

export const THEME = {
  boardFill: 'rgba(255, 255, 255, 0.035)',
  boardStroke: 'rgba(255, 255, 255, 0.08)',
  cellFill: 'rgba(255, 255, 255, 0.028)',
  selectRing: 'rgba(255, 255, 255, 0.92)',
  hintRing: 'rgba(255, 255, 255, 0.42)',
  text: '#F4F6FF',
} as const

export function styleFor(kind: number): GemStyle {
  return PALETTE[kind % PALETTE.length] as GemStyle
}
