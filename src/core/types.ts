// Tile model: single-char constants mutated in place on the grid (preserved from the
// original MVP). Coordinates are (x, y) = (col, row); grid is indexed grid[y][x].
export const W = '#';
export const FLOOR = ' ';
export const DOT = '.';
export const STAR = 'S';
export const SPIKE = '^';
export const EXIT = 'E';

export type Tile = '#' | ' ' | '.' | 'S' | '^' | 'E';
export type Grid = Tile[][];

export interface Vec {
  x: number;
  y: number;
}

/** A built, playable chamber. Mutated in place during play (dots become FLOOR, etc.). */
export interface LevelData {
  grid: Grid;
  rows: number;
  cols: number;
  start: Vec;
  exit: Vec;
  stars: Vec[];
  dotsTotal: number;
}

export type GameState = 'menu' | 'map' | 'playing' | 'dead' | 'win';

/** Deterministic random source: returns a float in [0, 1). */
export type Rng = () => number;
