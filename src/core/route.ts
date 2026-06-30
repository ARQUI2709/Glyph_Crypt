import type { Grid, Vec } from './types';
import { W } from './types';

/** A slide-arrival: the player STOPPED at (x,y) having travelled in direction (dx,dy). */
export interface Arrival {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/**
 * A constructed clearing walk through a maze, expressed in slide-to-wall moves.
 *
 * This is the backbone of route-first generation: rather than painting dots on every
 * reachable cell and hoping a clean run exists, we compute an explicit walk and only place
 * collectibles on it. Following {@link cells} therefore collects every painted dot/star and
 * ends on {@link exit} — a full clear is guaranteed by construction.
 */
export interface Route {
  /** Ordered cells the player traverses (with repeats) — the literal clearing walk. */
  cells: Vec[];
  /** One entry per slide: the cells crossed in that single uninterrupted glide (ends on a
   *  stop). A slide can't be paused mid-corridor, so hazard fairness is checked per segment. */
  segments: Vec[][];
  /** Distinct stop positions in visit order (used to space stars near/mid/far). */
  stops: Vec[];
  /** Every (cell, direction) the walk legitimately stops at — spikes must avoid these. */
  arrivals: Arrival[];
  /** Final stop of the walk; the natural place for the exit gate. */
  exit: Vec;
}

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const key = (x: number, y: number) => x + ',' + y;

/** Slide from (x,y) along (dx,dy) until a wall stops us. Returns the endpoint and the cells
 *  entered along the way (not including the origin). */
function slide(
  g: Grid,
  x: number,
  y: number,
  dx: number,
  dy: number,
): { end: Vec; cells: Vec[] } {
  const R = g.length;
  const C = g[0].length;
  const wall = (cx: number, cy: number) =>
    cx < 0 || cy < 0 || cx >= C || cy >= R || g[cy][cx] === W;
  const cells: Vec[] = [];
  let cx = x;
  let cy = y;
  while (!wall(cx + dx, cy + dy)) {
    cx += dx;
    cy += dy;
    cells.push({ x: cx, y: cy });
  }
  return { end: { x: cx, y: cy }, cells };
}

/**
 * Build a maximal-coverage clearing walk starting from (sx,sy).
 *
 * Greedy: from the current stop, take the slide that sweeps the most not-yet-covered cells.
 * When no slide from here uncovers anything new, BFS through the slide-graph to the nearest
 * stop that does, travel there, and continue — until nothing reachable remains uncovered.
 *
 * Correctness of "full clear": the caller paints dots ONLY on cells this walk traverses, so
 * replaying {@link Route.cells} necessarily collects all of them. The greedy heuristic only
 * affects how *dense* (how many cells) the walk covers, never whether it is clearable.
 */
export function buildRoute(g: Grid, sx: number, sy: number): Route {
  const covered = new Set<string>([key(sx, sy)]);
  const cells: Vec[] = [{ x: sx, y: sy }];
  const segments: Vec[][] = [];
  const stops: Vec[] = [{ x: sx, y: sy }];
  const arrivals: Arrival[] = [];
  let cur: Vec = { x: sx, y: sy };

  /** Run a slide for real: record traversed cells, mark coverage, advance the cursor. */
  const execute = (dx: number, dy: number, s: { end: Vec; cells: Vec[] }) => {
    const seg: Vec[] = [];
    for (const c of s.cells) {
      cells.push(c);
      seg.push(c);
      covered.add(key(c.x, c.y));
    }
    segments.push(seg);
    cur = s.end;
    stops.push(cur);
    arrivals.push({ x: cur.x, y: cur.y, dx, dy });
  };

  const gainOf = (s: { cells: Vec[] }) =>
    s.cells.reduce((n, c) => n + (covered.has(key(c.x, c.y)) ? 0 : 1), 0);

  const MAX_STEPS = g.length * g[0].length * 4;
  for (let step = 0; step < MAX_STEPS; step++) {
    // 1. Best immediate slide by new-coverage.
    let best: { dx: number; dy: number; s: ReturnType<typeof slide>; gain: number } | null = null;
    for (const [dx, dy] of DIRS) {
      const s = slide(g, cur.x, cur.y, dx, dy);
      if (s.cells.length === 0) continue;
      const gain = gainOf(s);
      if (gain > 0 && (!best || gain > best.gain)) best = { dx, dy, s, gain };
    }
    if (best) {
      execute(best.dx, best.dy, best.s);
      continue;
    }

    // 2. Nothing new here — BFS the slide-graph for the nearest stop that does uncover cells.
    const travel = nearestGainfulPath(g, cur, covered);
    if (!travel) break; // everything reachable from the walk is covered
    for (const move of travel) execute(move.dx, move.dy, slide(g, cur.x, cur.y, move.dx, move.dy));
  }

  return { cells, segments, stops, arrivals, exit: { ...cur } };
}

interface Move {
  dx: number;
  dy: number;
}

/**
 * BFS over stop-to-stop slides from `from`, returning the slide sequence to the nearest stop
 * from which some slide would uncover a new cell. `null` if no such stop is reachable.
 */
function nearestGainfulPath(g: Grid, from: Vec, covered: Set<string>): Move[] | null {
  const seen = new Set<string>([key(from.x, from.y)]);
  const queue: { pos: Vec; path: Move[] }[] = [{ pos: from, path: [] }];
  const uncoversSomething = (pos: Vec) =>
    DIRS.some(([dx, dy]) => {
      const s = slide(g, pos.x, pos.y, dx, dy);
      return s.cells.some((c) => !covered.has(key(c.x, c.y)));
    });

  while (queue.length) {
    const { pos, path } = queue.shift()!;
    if (path.length > 0 && uncoversSomething(pos)) return path;
    for (const [dx, dy] of DIRS) {
      const s = slide(g, pos.x, pos.y, dx, dy);
      if (s.cells.length === 0) continue;
      const k = key(s.end.x, s.end.y);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ pos: s.end, path: [...path, { dx, dy }] });
    }
  }
  return null;
}
