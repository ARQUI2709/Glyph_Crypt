import type { Game } from './state';
import { W, FLOOR, DOT, STAR, SPIKE } from '../core/types';
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

/** Begin sliding in (dx,dy) if the immediate neighbor is open. */
export function tryStartMove(game: Game, dx: number, dy: number): void {
  if (game.state !== 'playing' || game.moving) return;
  if (isWall(game, game.player.x + dx, game.player.y + dy)) return;
  game.moving = { dx, dy };
  game.moveTimer = 0;
}

/** Advance one cell along the current slide, or stop at a wall. */
export function stepSlide(game: Game, h: MovementHandlers): void {
  if (!game.moving) return;
  const nx = game.player.x + game.moving.dx;
  const ny = game.player.y + game.moving.dy;
  if (isWall(game, nx, ny)) {
    game.moving = null;
    return;
  }
  game.player.x = nx;
  game.player.y = ny;
  onEnter(game, h);
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
  } else if (t === SPIKE) {
    h.onDie();
    return;
  }
  if (checkHazards(game, h)) return;
  if (game.player.x === exit.x && game.player.y === exit.y) h.onWin();
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
