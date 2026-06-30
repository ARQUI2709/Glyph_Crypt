import { describe, it, expect, vi } from 'vitest';
import { tryStartMove } from '../src/game/movement';
import type { Game } from '../src/game/state';
import type { MovementHandlers } from '../src/game/movement';
import { W, FLOOR } from '../src/core/types';
import type { SpikeFace } from '../src/core/types';

// Minimal playing game: player at (1,1); (1,0) open above, walls elsewhere, (1,2) wall below.
function makeGame(spikes: SpikeFace[]): Game {
  const grid = [
    [W, FLOOR, W],
    [W, FLOOR, W],
    [W, W, W],
  ] as any;
  return {
    state: 'playing',
    moving: null,
    moveTimer: 0,
    player: { x: 1, y: 1 },
    level: { grid, rows: 3, cols: 3, spikes } as any,
  } as unknown as Game;
}

const handlers = (): MovementHandlers => ({ onStarsChanged: vi.fn(), onDie: vi.fn(), onWin: vi.fn() });

describe('tryStartMove (rule 7 — every direction is always tappable)', () => {
  it('starts a slide when the neighbour is open', () => {
    const g = makeGame([]);
    const h = handlers();
    tryStartMove(g, 0, -1, h); // up into (1,0)
    expect(g.moving).toEqual({ dx: 0, dy: -1 });
    expect(h.onDie).not.toHaveBeenCalled();
  });

  it('is a harmless no-op when tapping into a plain wall', () => {
    const g = makeGame([]);
    const h = handlers();
    tryStartMove(g, 1, 0, h); // right into a plain wall (2,1)
    expect(g.moving).toBeNull();
    expect(h.onDie).not.toHaveBeenCalled();
  });

  it('kills the player when tapping into a spiked wall face', () => {
    const g = makeGame([{ x: 1, y: 1, dx: 0, dy: 1 }]); // spike on the wall directly below
    const h = handlers();
    tryStartMove(g, 0, 1, h); // down into the spiked wall (1,2)
    expect(g.moving).toBeNull();
    expect(h.onDie).toHaveBeenCalledTimes(1);
  });
});
