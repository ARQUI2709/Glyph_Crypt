import type { Grid } from './types';
import { W } from './types';

export interface Coverage {
  /** Set of "x,y" keys the sliding player can pass through. */
  cov: Set<string>;
  /** Distance (in slide-moves) from the start to each covered cell. */
  dist: Record<string, number>;
}

/**
 * Slide-coverage BFS: each "move" slides until it hits a wall, mirroring player movement.
 * The exit, star placement, and dot painting are all derived from this — NOT from raw maze
 * adjacency. Ported verbatim in behavior from the original `coverage`.
 */
export function slideCoverage(g: Grid, sx: number, sy: number): Coverage {
  const R = g.length;
  const C = g[0].length;
  const wall = (x: number, y: number) => x < 0 || y < 0 || x >= C || y >= R || g[y][x] === W;
  const key = (x: number, y: number) => x + ',' + y;
  const cov = new Set<string>([key(sx, sy)]);
  const dist: Record<string, number> = { [key(sx, sy)]: 0 };
  const seen = new Set<string>([key(sx, sy)]);
  const q: [number, number][] = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift()!;
    const base = dist[key(x, y)];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      let cx = x;
      let cy = y;
      let moved = false;
      while (!wall(cx + dx, cy + dy)) {
        cx += dx;
        cy += dy;
        const kk = key(cx, cy);
        cov.add(kk);
        if (dist[kk] === undefined) dist[kk] = base + 1; // every passed cell gets a distance
        moved = true;
      }
      if (moved && !seen.has(key(cx, cy))) {
        seen.add(key(cx, cy));
        q.push([cx, cy]);
      }
    }
  }
  return { cov, dist };
}
