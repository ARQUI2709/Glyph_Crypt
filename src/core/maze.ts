import type { Grid, Rng, Vec } from './types';
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

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A Tomb-of-the-Mask-style layout: open rectangular rooms joined by 1-wide corridors, with a
 * few extra links woven in for loops. Open rooms are what make the rest of the design work —
 * the player can slide to any edge (so spikes are dodge-able and you can always navigate back),
 * dots fill the floors, and there is plenty of space for saws and other hazards.
 *
 * Boards are rectangular (`cols` × `rows`) so they can be portrait for phones. Returns the grid,
 * the spawn cell, and the room rectangles (so callers can put the exit in a *different* room and
 * confirm every room is reachable). Connectivity is guaranteed by chaining every room into a
 * spanning path; escapability under sliding is then confirmed by the caller.
 */
export function roomsMaze(
  cols: number,
  rows: number,
  rng: Rng,
): { grid: Grid; start: Vec; rooms: Room[] } {
  const g: Grid = Array.from({ length: rows }, () => Array<Grid[number][number]>(cols).fill(W));
  const rooms: Room[] = [];
  // inflate-by-1 overlap test keeps a wall between rooms so they read as distinct chambers
  const overlaps = (a: Room, b: Room) =>
    !(a.x + a.w + 1 <= b.x || b.x + b.w + 1 <= a.x || a.y + a.h + 1 <= b.y || b.y + b.h + 1 <= a.y);

  const attempts = (cols + rows) * 2;
  for (let t = 0; t < attempts; t++) {
    const w = 2 + rint(rng, 4); // 2..5
    const h = 2 + rint(rng, 4);
    if (cols - 2 - w < 1 || rows - 2 - h < 1) continue;
    const x = 1 + rint(rng, cols - 2 - w);
    const y = 1 + rint(rng, rows - 2 - h);
    const r: Room = { x, y, w, h };
    if (rooms.some((o) => overlaps(o, r))) continue;
    rooms.push(r);
  }

  for (const r of rooms) {
    for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) g[yy][xx] = FLOOR;
  }

  const cx = (r: Room) => r.x + (r.w >> 1);
  const cy = (r: Room) => r.y + (r.h >> 1);
  const carveH = (x1: number, x2: number, y: number) => {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) g[y][x] = FLOOR;
  };
  const carveV = (y1: number, y2: number, x: number) => {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) g[y][x] = FLOOR;
  };
  const connect = (a: Room, b: Room) => {
    // L-shaped 1-wide corridor between room centres (elbow order varies for variety)
    if (rng() < 0.5) {
      carveH(cx(a), cx(b), cy(a));
      carveV(cy(a), cy(b), cx(b));
    } else {
      carveV(cy(a), cy(b), cx(a));
      carveH(cx(a), cx(b), cy(b));
    }
  };

  // Chain rooms top-to-bottom for a readable overall flow, then add a few loop links.
  rooms.sort((a, b) => cy(a) - cy(b) || cx(a) - cx(b));
  for (let i = 1; i < rooms.length; i++) connect(rooms[i - 1], rooms[i]);
  const extra = Math.floor(rooms.length / 3);
  for (let k = 0; k < extra && rooms.length > 2; k++) {
    const a = rooms[rint(rng, rooms.length)];
    const b = rooms[rint(rng, rooms.length)];
    if (a !== b) connect(a, b);
  }

  const s = rooms[0] ?? { x: 1, y: 1, w: 1, h: 1 };
  if (!rooms.length) g[1][1] = FLOOR;
  return { grid: g, start: { x: s.x, y: s.y }, rooms };
}
