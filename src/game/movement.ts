import type { Game } from './state';
import { W, FLOOR, DOT, STAR } from '../core/types';
import { STARS_PER_LEVEL } from './constants';
import { hazardCellsAt } from '../core/hazards';
import { blip } from '../audio/blip';

export interface MovementHandlers {
  onStarsChanged(): void;
  onDie(): void;
  onWin(): void;
}

function isWall(game: Game, x: number, y: number): boolean {
  const { grid, rows, cols } = game.level;
  return x < 0 || y < 0 || x >= cols || y >= rows || grid[y][x] === W;
}

/**
 * Attempt a move in (dx,dy). The player may always try any direction (rule 7): if the immediate
 * neighbor is a plain wall nothing happens, but if that wall face is spiked the tap is lethal.
 * Otherwise the slide begins.
 */
export function tryStartMove(game: Game, dx: number, dy: number, h: MovementHandlers): void {
  if (game.state !== 'playing' || game.moving) return;
  if (isWall(game, game.player.x + dx, game.player.y + dy)) {
    // Tapping into a wall is a no-op — unless its facing edge is spiked, which kills.
    if (hitsSpike(game, game.player.x, game.player.y, dx, dy)) h.onDie();
    return;
  }
  game.moving = { dx, dy };
  game.moveTimer = 0;
}

/** Advance one cell along the current slide, or stop at a wall. */
export function stepSlide(game: Game, h: MovementHandlers): void {
  if (!game.moving) return;
  const { dx, dy } = game.moving;
  const nx = game.player.x + dx;
  const ny = game.player.y + dy;
  if (isWall(game, nx, ny)) {
    game.moving = null;
    // We stopped against this wall — die if its facing edge is spiked.
    if (hitsSpike(game, game.player.x, game.player.y, dx, dy)) h.onDie();
    return;
  }
  game.player.x = nx;
  game.player.y = ny;
  onEnter(game, h);
}

/** True if a spiked wall face guards stopping at (x,y) after sliding in (dx,dy). */
function hitsSpike(game: Game, x: number, y: number, dx: number, dy: number): boolean {
  return game.level.spikes.some((s) => s.x === x && s.y === y && s.dx === dx && s.dy === dy);
}

/** Resolve the tile the player just entered: pickups, death, win. */
export function onEnter(game: Game, h: MovementHandlers): void {
  const { grid, exit } = game.level;
  const t = grid[game.player.y][game.player.x];
  if (t === DOT) {
    grid[game.player.y][game.player.x] = FLOOR;
    game.dotsLeft--;
    blip(660, 0.05);
  } else if (t === STAR) {
    grid[game.player.y][game.player.x] = FLOOR;
    game.starsGot++;
    h.onStarsChanged();
    blip(990, 0.12);
  }
  if (checkHazards(game, h)) return;
  // The gate only opens once all 3 stars are collected ("grab all 3 stars, then the gate").
  if (
    game.player.x === exit.x &&
    game.player.y === exit.y &&
    game.starsGot >= STARS_PER_LEVEL
  ) {
    h.onWin();
  }
}

/**
 * Kill the player if their cell currently intersects any lethal hazard cell. Called both on
 * entering a tile and every frame from the loop (so a hazard moving onto a still player also
 * connects). Returns true if it triggered death.
 */
export function checkHazards(game: Game, h: MovementHandlers): boolean {
  if (game.state !== 'playing') return false;
  const { x, y } = game.player;
  for (const hz of game.level.hazards) {
    for (const c of hazardCellsAt(hz, game.hazardClock)) {
      if (c.x === x && c.y === y) {
        h.onDie();
        return true;
      }
    }
  }
  return false;
}
