import type { Grid, Rng, Vec } from './types';
import { W, FLOOR } from './types';
import { rint } from './rng';
import { isEscapable, slideCoverage } from './coverage';

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
 * Fixed-zoom cap: the viewport shows ~9 cells, so a single slide must never be able to travel
 * more than this many cells. We enforce it by *geometry* — generation guarantees no open
 * straight run exceeds {@link MAX_RUN}, so ordinary slide-to-wall movement is implicitly bounded
 * and the slide functions stay untouched.
 */
export const MAX_RUN = 9;

/**
 * Cap on a single straight corridor leg before it must jog sideways. Kept well below
 * {@link MAX_RUN} so that even where a corridor runs collinear into a room (max dim 5) the
 * merged open run still fits within {@link MAX_RUN}. The {@link longestRun} gate in `buildLevel`
 * is the actual guarantee; the staircase carving just makes that gate pass on the first try.
 */
const CORRIDOR_CAP = 3;

/**
 * Break every open straight run longer than `limit` (rule 6) by walling a single well-connected
 * cell inside it. We only ever wall a cell with ≥3 open neighbours — a room-interior cell — so the
 * room stays connected *around* the new hole and the board does not split. The long runs in this
 * generator come from corridors entering and leaving a room collinearly (short leg + open room +
 * short leg), so the over-length run always passes through such a cell. Deterministic (no RNG):
 * tries the most-central qualifying cells first and, when `start` is given, only commits a wall
 * that keeps the board escapable AND strands nothing but the walled cell itself (so no room is
 * orphaned from the start's slide-component). Reverts otherwise.
 */
export function enforceRunCap(grid: Grid, limit: number, start?: Vec): void {
  const rows = grid.length;
  const cols = grid[0].length;
  const open = (x: number, y: number) => grid[y]?.[x] !== undefined && grid[y][x] !== W;
  const degree = (x: number, y: number) => DIR4.filter(([dx, dy]) => open(x + dx, y + dy)).length;
  for (let guard = 0; guard < rows * cols; guard++) {
    // Find the longest over-limit run (scan rows then columns).
    let target: Vec[] | null = null;
    const consider = (run: Vec[]) => {
      if (run.length > limit && (!target || run.length > target.length)) target = run.slice();
    };
    for (let y = 0; y < rows; y++) {
      let run: Vec[] = [];
      for (let x = 0; x < cols; x++) {
        if (open(x, y)) run.push({ x, y });
        else {
          consider(run);
          run = [];
        }
      }
      consider(run);
    }
    for (let x = 0; x < cols; x++) {
      let run: Vec[] = [];
      for (let y = 0; y < rows; y++) {
        if (open(x, y)) run.push({ x, y });
        else {
          consider(run);
          run = [];
        }
      }
      consider(run);
    }
    if (!target) return;
    const cells: Vec[] = target;
    const mid = (cells.length - 1) / 2;
    // Candidate cells: ≥3 open neighbours (safe to remove) and not the only link of a dead-end
    // stub (no degree-1 neighbour), ordered from the run's middle outward.
    const candidates = cells
      .filter((c) => degree(c.x, c.y) >= 3 && !DIR4.some(([dx, dy]) => open(c.x + dx, c.y + dy) && degree(c.x + dx, c.y + dy) === 1))
      .sort((a, b) => Math.abs(cells.indexOf(a) - mid) - Math.abs(cells.indexOf(b) - mid));
    const before = start ? slideCoverage(grid, start.x, start.y).cov.size : 0;
    let walled = false;
    for (const c of candidates) {
      grid[c.y][c.x] = W;
      const safe =
        !start ||
        (slideCoverage(grid, start.x, start.y).cov.size === before - 1 &&
          isEscapable(grid, start.x, start.y));
      if (safe) {
        walled = true;
        break;
      }
      grid[c.y][c.x] = FLOOR; // reverted — this wall would strand a room or break escapability
    }
    if (!walled) {
      // No escapability-safe break exists; wall the central cell anyway so we make progress (the
      // caller's escapability gate will then reject and re-roll this terrain).
      const c = cells[Math.floor(mid)];
      grid[c.y][c.x] = W;
    }
  }
}

/** Longest maximal open (non-wall) straight run over all rows and columns. */
export function longestRun(grid: Grid): number {
  const rows = grid.length;
  const cols = grid[0].length;
  const open = (x: number, y: number) => grid[y]?.[x] !== undefined && grid[y][x] !== W;
  let best = 0;
  for (let y = 0; y < rows; y++) {
    let run = 0;
    for (let x = 0; x < cols; x++) {
      run = open(x, y) ? run + 1 : 0;
      if (run > best) best = run;
    }
  }
  for (let x = 0; x < cols; x++) {
    let run = 0;
    for (let y = 0; y < rows; y++) {
      run = open(x, y) ? run + 1 : 0;
      if (run > best) best = run;
    }
  }
  return best;
}

/**
 * Carve a 1-cell dead-end "stub" pocket off a room — a wall cell whose only open neighbour is a
 * room perimeter cell (its other three sides stay wall). Sliding into it always stops in the
 * pocket and sliding out goes back into the room, so escapability is preserved. Used to give
 * the start and exit a real dead end. Returns the carved cell, or null if the room has no spot.
 */
export function carveDeadEndStub(
  grid: Grid,
  room: Room,
  rng: Rng,
  taken: ReadonlySet<string> = new Set(),
): Vec | null {
  const rows = grid.length;
  const cols = grid[0].length;
  const open = (x: number, y: number) => grid[y]?.[x] !== undefined && grid[y][x] !== W;
  const inBounds = (x: number, y: number) => x >= 1 && y >= 1 && x < cols - 1 && y < rows - 1;
  const candidates: Vec[] = [];
  // Walk the room's perimeter cells and probe outward for a fully-enclosed wall pocket.
  for (let yy = room.y; yy < room.y + room.h; yy++) {
    for (let xx = room.x; xx < room.x + room.w; xx++) {
      const onEdge = xx === room.x || xx === room.x + room.w - 1 || yy === room.y || yy === room.y + room.h - 1;
      if (!onEdge) continue;
      for (const [dx, dy] of DIR4) {
        const sx = xx + dx;
        const sy = yy + dy;
        if (!inBounds(sx, sy) || open(sx, sy)) continue;
        if (taken.has(sx + ',' + sy)) continue;
        // s must touch exactly one open cell (this room edge cell) to be a true dead end.
        let openN = 0;
        for (const [nx, ny] of DIR4) if (open(sx + nx, sy + ny)) openN++;
        if (openN === 1) candidates.push({ x: sx, y: sy });
      }
    }
  }
  if (candidates.length === 0) return null;
  const pick = candidates[rint(rng, candidates.length)];
  grid[pick.y][pick.x] = FLOOR;
  return pick;
}

const DIR4: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * A Tomb-of-the-Mask-style layout: open rectangular rooms joined by 1-wide corridors, with a
 * few extra links woven in for loops. Open rooms are what make the rest of the design work —
 * the player can slide to any edge (so spikes are dodge-able and you can always navigate back),
 * dots fill the floors, and there is plenty of space for saws and other hazards.
 *
 * Corridors are carved as **staircases** (no straight leg longer than {@link CORRIDOR_CAP}) so
 * the fixed-zoom slide cap (no run > {@link MAX_RUN}) holds. The **start** is a carved dead-end
 * stub off the first room.
 *
 * Boards are rectangular (`cols` × `rows`) so they can be portrait for phones. Returns the grid,
 * the spawn cell, the room the spawn attaches to, and the room rectangles (so callers can put
 * the exit in a *different* room and confirm every room is reachable). Connectivity is guaranteed
 * by chaining every room into a spanning path; escapability under sliding is confirmed by the caller.
 */
export function roomsMaze(
  cols: number,
  rows: number,
  rng: Rng,
): { grid: Grid; start: Vec; startRoom: Room | null; rooms: Room[] } {
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
  const carve = (x: number, y: number) => {
    if (x >= 1 && y >= 1 && x < cols - 1 && y < rows - 1) g[y][x] = FLOOR;
  };
  // Connect two room centres with a 1-wide staircase: walk toward the target, and whenever the
  // current straight leg would exceed CORRIDOR_CAP, jog one cell on the perpendicular axis. No
  // straight run in the corridor therefore exceeds CORRIDOR_CAP + 1, keeping merges under MAX_RUN.
  const connect = (a: Room, b: Room) => {
    const bx = cx(b);
    const by = cy(b);
    let x = cx(a);
    let y = cy(a);
    carve(x, y);
    let runAxis: 'x' | 'y' | null = null;
    let runLen = 0;
    const sign = (v: number) => (v < 0 ? -1 : v > 0 ? 1 : 0);
    const step = (nx: number, ny: number) => {
      const axis: 'x' | 'y' = nx !== x ? 'x' : 'y';
      runLen = axis === runAxis ? runLen + 1 : 1;
      runAxis = axis;
      x = nx;
      y = ny;
      carve(x, y);
    };
    let guard = 0;
    while ((x !== bx || y !== by) && guard++ < cols * rows * 4) {
      const dxr = bx - x;
      const dyr = by - y;
      const wantX = dxr !== 0 && (Math.abs(dxr) >= Math.abs(dyr) || dyr === 0);
      if (wantX && runAxis === 'x' && runLen >= CORRIDOR_CAP) {
        const jy = dyr !== 0 ? sign(dyr) : y + 1 < rows - 1 ? 1 : -1; // jog to break the run
        step(x, y + jy);
      } else if (!wantX && runAxis === 'y' && runLen >= CORRIDOR_CAP) {
        const jx = dxr !== 0 ? sign(dxr) : x + 1 < cols - 1 ? 1 : -1;
        step(x + jx, y);
      } else if (wantX) {
        step(x + sign(dxr), y);
      } else {
        step(x, y + sign(dyr));
      }
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

  // Start is a carved dead-end stub off a room (rule 4). Try rooms in order until one fits.
  let start: Vec | null = null;
  let startRoom: Room | null = null;
  for (const r of rooms) {
    const stub = carveDeadEndStub(g, r, rng);
    if (stub) {
      start = stub;
      startRoom = r;
      break;
    }
  }
  if (!start) {
    const s = rooms[0] ?? { x: 1, y: 1, w: 1, h: 1 };
    if (!rooms.length) g[1][1] = FLOOR;
    start = { x: s.x, y: s.y };
    startRoom = rooms[0] ?? null;
  }

  // Rule 6: guarantee no slide can travel past the viewport — break any over-length open run.
  // Run AFTER the start stub so its +1 extension is capped too (stubs are protected from walling).
  enforceRunCap(g, MAX_RUN, start);
  return { grid: g, start, startRoom, rooms };
}
