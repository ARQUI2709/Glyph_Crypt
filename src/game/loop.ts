import type { Game } from './state';
import type { MovementHandlers } from './movement';
import { stepSlide } from './movement';
import { MOVE_INTERVAL } from './constants';
import type { Renderer } from '../render/canvas';

/**
 * Fixed-timestep movement accumulator driving requestAnimationFrame. The player advances
 * one cell per MOVE_INTERVAL while sliding; rendering happens every frame.
 */
export function startLoop(game: Game, renderer: Renderer, handlers: MovementHandlers): void {
  let last = 0;
  function frame(ts: number) {
    const dt = Math.min(50, ts - last);
    last = ts;
    if (game.state === 'playing' && game.moving) {
      game.moveTimer += dt;
      while (game.moveTimer >= MOVE_INTERVAL && game.moving) {
        game.moveTimer -= MOVE_INTERVAL;
        stepSlide(game, handlers);
      }
    }
    if (game.state === 'playing') renderer.draw(game, dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
