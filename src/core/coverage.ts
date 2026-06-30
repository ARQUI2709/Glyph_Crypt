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

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Escapability check: is the slide-stop graph reachable from (sx,sy) strongly connected, i.e.
 * can the player slide back to the start from EVERY stop they can reach? If so there are no
 * one-way pockets — from anywhere you can get to, you can still reach the exit and every star,
 * so the level can always be finished. Used as a generation gate alongside braiding.
 */
export function isEscapable(g: Grid, sx: number, sy: number): boolean {
  const R = g.length;
  const C = g[0].length;
  const wall = (x: number, y: number) => x < 0 || y < 0 || x >= C || y >= R || g[y][x] === W;
  const key = (x: number, y: number) => x + ',' + y;
  const slideEnd = (x: number, y: number, dx: number, dy: number): string | null => {
    let cx = x;
    let cy = y;
    while (!wall(cx + dx, cy + dy)) {
      cx += dx;
      cy += dy;
    }
    return cx === x && cy === y ? null : key(cx, cy);
  };

  // Forward BFS from start: collect all reachable stops + their slide edges.
  const start = key(sx, sy);
  const fwd = new Map<string, string[]>();
  const nodes = new Set<string>([start]);
  const queue: [number, number][] = [[sx, sy]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    const adj: string[] = [];
    for (const [dx, dy] of DIRS) {
      const e = slideEnd(x, y, dx, dy);
      if (!e) continue;
      adj.push(e);
      if (!nodes.has(e)) {
        nodes.add(e);
        const [ex, ey] = e.split(',').map(Number);
        queue.push([ex, ey]);
      }
    }
    fwd.set(key(x, y), adj);
  }

  // Reverse the edges, then BFS from start: which stops can slide back to it?
  const rev = new Map<string, string[]>();
  for (const n of nodes) rev.set(n, []);
  for (const [from, adj] of fwd) for (const to of adj) rev.get(to)!.push(from);
  const canReachStart = new Set<string>([start]);
  const q2: string[] = [start];
  while (q2.length) {
    const k = q2.shift()!;
    for (const p of rev.get(k) ?? []) {
      if (!canReachStart.has(p)) {
        canReachStart.add(p);
        q2.push(p);
      }
    }
  }
  return canReachStart.size === nodes.size;
}
