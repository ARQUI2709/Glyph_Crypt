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

/**
 * Dynamic hazards — moving/cycling dangers that can't be expressed as static tiles.
 * They live in a parallel array (not on the grid) so the grid stays pure for reachability.
 * Their lethal cells are a pure function of a clock (see `hazardCellsAt`), so they remain
 * deterministic and unit-testable.
 *
 * - `dart`  — a wall emitter fires a bolt along (dx,dy) over `length` cells, then cools down.
 * - `puffer`— stationary; deadly only during the inflated fraction of each cycle.
 * - `saw`   — oscillates end-to-end along a straight corridor of `length` cells.
 */
export type HazardKind = 'dart' | 'puffer' | 'saw';
export interface Hazard {
  kind: HazardKind;
  x: number; // anchor cell (emitter / puffer body / one corridor end)
  y: number;
  dx: number; // travel axis (unit), 0 for puffer
  dy: number;
  length: number; // corridor span in cells (1 for puffer)
  period: number; // ms for one full cycle
  phase: number; // 0..1 seeded cycle offset
}

/**
 * A spiked wall face. The player dies only if they slide in direction (dx,dy) and STOP at
 * cell (x,y) because the wall just past it — at (x+dx, y+dy) — blocks them. Sliding past the
 * cell, or stopping there from another direction, is safe: "go behind it, but hit that wall
 * head-on and you die." Lives in a parallel array so the grid stays pure for reachability.
 */
export interface SpikeFace {
  x: number; // the open cell the player stops in
  y: number;
  dx: number; // slide direction that is lethal here (unit)
  dy: number;
}

/** A built, playable chamber. Mutated in place during play (dots become FLOOR, etc.). */
export interface LevelData {
  grid: Grid;
  rows: number;
  cols: number;
  start: Vec;
  exit: Vec;
  stars: Vec[];
  spikes: SpikeFace[];
  hazards: Hazard[];
  dotsTotal: number;
}

export type GameState = 'menu' | 'map' | 'playing' | 'dead' | 'win';

/** Deterministic random source: returns a float in [0, 1). */
export type Rng = () => number;
