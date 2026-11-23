/** Shared, browser-independent contracts for the private royal puzzle. */
export type Colour = 0 | 1 | 2 | 3
export type Power = 'rocket-h' | 'rocket-v' | 'propeller' | 'tnt' | 'lightball'
export type Tool = 'hammer' | 'arrow' | 'cannon' | 'shuffle'
export type ObstacleKind = 'box' | 'gift' | 'ice' | 'stone' | 'cuckoo' | 'dynamite'
export type GoalKind = 'colour' | 'box' | 'toy' | 'ice' | 'stone' | 'cuckoo' | 'dynamite' | 'jelly'
export type Difficulty = 'normal' | 'hard' | 'super-hard' | 'extreme'
export interface Piece { id: number; colour: Colour; power?: Power }
export interface ObstacleDefinition { id: string; kind: ObstacleKind; cells: number[]; hp: number; stock?: number; open?: boolean; colour?: Colour }
export interface GoalDefinition { kind: GoalKind; count: number; colour?: Colour }
export interface GoalState extends GoalDefinition { remaining: number }
export interface LevelDefinition {
  version: 1; id: number; name: string; cols: number; rows: number; mask: string[];
  moves: number; difficulty: Difficulty; colours: number; seed: number;
  goals: GoalDefinition[]; obstacles: ObstacleDefinition[]; jelly: number[];
  pieces?: { cell: number; colour: Colour; power?: Power }[];
  provenance: 'authored' | 'generated' | 'reference-reconstruction' | 'custom';
  description?: string;
}
export interface ObstacleState extends ObstacleDefinition { initialHp: number; initialStock: number }
export interface GameState {
  level: LevelDefinition; pieces: (Piece | null)[]; obstacles: ObstacleState[];
  jelly: boolean[]; goals: GoalState[]; moves: number; status: 'playing' | 'won' | 'lost';
  locked: Set<number>; turn: number; combo: number;
}
export interface EffectEvent {
  kind: 'swap' | 'invalid' | 'activate' | 'clear' | 'power' | 'rocket' | 'propeller' | 'tnt' | 'lightball' | 'damage' | 'collect' | 'fall' | 'shuffle' | 'win' | 'lose';
  /** Absolute simulation time at which this event starts. */
  at: number;
  cells: number[]; from?: number; to?: number; colour?: Colour; power?: Power; combo?: number;
  /** Blast radius in board cells; presentation only, never used to apply damage. */
  radius?: number;
  duration?: number; delay?: number; fromRow?: number;
  pieces?: { cell: number; piece: Piece }[];
  createdPiece?: Piece;
  carriedPower?: Power;
  stage?: 'launch' | 'impact';
}
export interface EngineOptions { seed?: number; unlimitedMoves?: boolean; startingBoosters?: Power[]; superLightBall?: boolean }
export const COLOUR_NAMES = ['왕관', '책', '방패', '잎'] as const
export const GOAL_NAMES: Record<GoalKind, string> = { colour: '블록', box: '상자', toy: '장난감', ice: '얼음', stone: '돌', cuckoo: '뻐꾸기', dynamite: '다이너마이트', jelly: '젤리' }
export const DIFFICULTY_NAMES: Record<Difficulty, string> = { normal: '보통', hard: '어려움', 'super-hard': '매우 어려움', extreme: '극도로 어려움' }
export const cellPlayable = (level: LevelDefinition, cell: number): boolean => cell >= 0 && cell < level.cols * level.rows && level.mask[Math.floor(cell / level.cols)]?.[cell % level.cols] === '1'
