import type { Grid, Rng } from './types';
import { W, FLOOR } from './types';
import { rint } from './rng';

/**
 * Iterative recursive-backtracker carving on odd cells, producing a perfect maze.
 * Ported from the original `generateMaze`, with the global RNG injected for determinism.
 */
export function generateMaze(size: number, rng: Rng): Grid {
  const C = size;
  const R = size;
  const g: Grid = Array.from({ length: R }, () => Array<Grid[number][number]>(C).fill(W));
  const stack: [number, number][] = [[1, 1]];
  g[1][1] = FLOOR;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const dirs: [number, number][] = [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = rint(rng, i + 1);
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    let carved = false;
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx > 0 && ny > 0 && nx < C - 1 && ny < R - 1 && g[ny][nx] === W) {
        g[y + dy / 2][x + dx / 2] = FLOOR;
        g[ny][nx] = FLOOR;
        stack.push([nx, ny]);
        carved = true;
        break;
      }
    }
    if (!carved) stack.pop();
  }
  return g;
}
