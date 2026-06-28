import type { GameState, LevelData, Vec } from '../core/types';
import { buildLevel, STARS_PER_LEVEL } from '../core/level';

/** Mutable runtime for an in-progress run. Mirrors the original module-level globals. */
export interface Game {
  level: LevelData;
  levelIndex: number;
  player: Vec;
  moving: { dx: number; dy: number } | null;
  moveTimer: number;
  dotsLeft: number;
  starsGot: number;
  state: GameState;
  cell: number; // pixel size of one cell, set by the renderer's resize()
  anim: { t: number };
}

/** Load a chamber into the runtime (fresh deterministic layout for `idx`). */
export function loadChamber(game: Game, idx: number): void {
  game.levelIndex = idx;
  game.level = buildLevel(idx);
  game.player = { ...game.level.start };
  game.moving = null;
  game.moveTimer = 0;
  game.dotsLeft = game.level.dotsTotal;
  game.starsGot = 0;
  game.anim.t = game.anim.t || 0;
}

export function createGame(idx = 0): Game {
  const game: Game = {
    level: buildLevel(idx),
    levelIndex: idx,
    player: { x: 1, y: 1 },
    moving: null,
    moveTimer: 0,
    dotsLeft: 0,
    starsGot: 0,
    state: 'menu',
    cell: 0,
    anim: { t: 0 },
  };
  loadChamber(game, idx);
  game.state = 'menu';
  return game;
}

export { STARS_PER_LEVEL };
