import type { Grid, Hazard, HazardKind, Rng, Vec } from './types';
import { W } from './types';
import { rint } from './rng';

// Tuning for the lethal duty-cycle of each hazard kind. All timing is in milliseconds and is
// resolved at runtime from a single clock, so positions never drift between frames.
const DART_PERIOD = 1500;
const DART_TRAVEL = 0.55; // fraction of the cycle the bolt is in flight (else cooling down)
const PUFFER_PERIOD = 1700;
const PUFFER_INFLATED = 0.45; // fraction of the cycle the puffer is inflated (deadly)
const SAW_PERIOD = 2000;

/** Wrapped cycle progress in [0,1) for a hazard at clock `t`. */
function progress(h: Hazard, t: number): number {
  const p = t / h.period + h.phase;
  return p - Math.floor(p);
}

/**
 * The cells that are LETHAL right now, as a pure function of the clock `t`. Empty while a
 * hazard is in its safe phase (dart cooling down, puffer deflated). This is the single source
 * of truth shared by movement (collision) and the renderer.
 */
export function hazardCellsAt(h: Hazard, t: number): Vec[] {
  const p = progress(h, t);
  switch (h.kind) {
    case 'dart': {
      if (p >= DART_TRAVEL) return []; // cooldown — no bolt on the board
      const step = Math.min(h.length - 1, Math.floor((p / DART_TRAVEL) * h.length));
      return [{ x: h.x + h.dx * step, y: h.y + h.dy * step }];
    }
    case 'puffer':
      return p < PUFFER_INFLATED ? [{ x: h.x, y: h.y }] : [];
    case 'saw': {
      const tri = p < 0.5 ? p * 2 : (1 - p) * 2; // 0→1→0 triangle wave
      const step = Math.round(tri * (h.length - 1));
      return [{ x: h.x + h.dx * step, y: h.y + h.dy * step }];
    }
  }
}

/** True if the puffer is currently inflated (deadly). Convenience for the renderer. */
export function isPufferInflated(h: Hazard, t: number): boolean {
  return progress(h, t) < PUFFER_INFLATED;
}

/** Ms the player spends crossing one cell while sliding. Mirrors game `MOVE_INTERVAL`
 *  (kept here so core stays free of a game-layer import, like theme mirrors the CSS). */
const CROSS_MS = 40;

/** Every cell a hazard could EVER be lethal on, ignoring timing (its spatial footprint). */
function footprint(h: Hazard): Vec[] {
  if (h.kind === 'puffer') return [{ x: h.x, y: h.y }];
  const out: Vec[] = [];
  for (let i = 0; i < h.length; i++) out.push({ x: h.x + h.dx * i, y: h.y + h.dy * i });
  return out;
}

function intersects(cells: Vec[], targets: Set<string>): boolean {
  return cells.some((c) => targets.has(c.x + ',' + c.y));
}

/** Is `cell` lethal at clock `t` for any of `hazards`? */
function lethalAt(hazards: Hazard[], t: number, cell: Vec): boolean {
  for (const h of hazards) {
    for (const c of hazardCellsAt(h, t)) if (c.x === cell.x && c.y === cell.y) return true;
  }
  return false;
}

/**
 * Can the player glide across `segment` (one uninterrupted slide) without being hit? They may
 * pick any launch time τ from the safe stop before it, then occupy cell i at τ + i·CROSS_MS.
 * We sweep τ across a few periods of the involved hazards; if any launch is clean, it's
 * passable. Empty/uninvolved segments are trivially passable.
 */
function segmentPassable(segment: Vec[], hazards: Hazard[]): boolean {
  const set = new Set(segment.map((c) => c.x + ',' + c.y));
  const involved = hazards.filter((h) => intersects(footprint(h), set));
  if (involved.length === 0) return true;
  const horizon = Math.max(...involved.map((h) => h.period)) * 4;
  for (let tau = 0; tau <= horizon; tau += CROSS_MS / 2) {
    let clean = true;
    for (let i = 0; i < segment.length; i++) {
      if (lethalAt(involved, tau + i * CROSS_MS, segment[i])) {
        clean = false;
        break;
      }
    }
    if (clean) return true;
  }
  return false;
}

/**
 * Drop hazards that would make the guaranteed clearing walk unfair: any hazard whose footprint
 * can threaten a route STOP cell (where the player rests and must be able to wait safely), and
 * just enough hazards on any un-crossable route slide-segment to make every segment passable.
 * Guarantees "always a way through, never the sole blocker".
 */
export function pruneForRoute(hazards: Hazard[], segments: Vec[][], stops: Vec[]): Hazard[] {
  const stopSet = new Set(stops.map((s) => s.x + ',' + s.y));
  // 1. No hazard may ever be lethal on a resting stop.
  let result = hazards.filter((h) => !intersects(footprint(h), stopSet));
  // 2. Make each single-slide segment timing-crossable, dropping the latest offenders.
  for (const seg of segments) {
    while (!segmentPassable(seg, result)) {
      const segSet = new Set(seg.map((c) => c.x + ',' + c.y));
      let removed = -1;
      for (let i = result.length - 1; i >= 0; i--) {
        if (intersects(footprint(result[i]), segSet)) {
          removed = i;
          break;
        }
      }
      if (removed === -1) break;
      result.splice(removed, 1);
    }
  }
  return result;
}

interface Run {
  x: number;
  y: number;
  dx: number;
  dy: number;
  length: number;
}

/** Maximal straight open (non-wall) runs of length ≥ 3, one entry per axis direction. */
function straightRuns(grid: Grid): Run[] {
  const rows = grid.length;
  const cols = grid[0].length;
  const runs: Run[] = [];
  const open = (x: number, y: number) => grid[y]?.[x] !== undefined && grid[y][x] !== W;
  // horizontal
  for (let y = 0; y < rows; y++) {
    let x = 0;
    while (x < cols) {
      if (!open(x, y)) {
        x++;
        continue;
      }
      let len = 0;
      while (open(x + len, y)) len++;
      if (len >= 3) runs.push({ x, y, dx: 1, dy: 0, length: len });
      x += len;
    }
  }
  // vertical
  for (let x = 0; x < cols; x++) {
    let y = 0;
    while (y < rows) {
      if (!open(x, y)) {
        y++;
        continue;
      }
      let len = 0;
      while (open(x, y + len)) len++;
      if (len >= 3) runs.push({ x, y, dx: 0, dy: 1, length: len });
      y += len;
    }
  }
  return runs;
}


function inPlace(cells: Vec[], v: Vec): boolean {
  return cells.some((c) => c.x === v.x && c.y === v.y);
}

/**
 * For each route cell, which axis/axes the clearing walk slides through it on ('h' = horizontal,
 * 'v' = vertical). Derived from each segment's own colinear cells, so it needs only the segments.
 * Used to mount moving hazards on the PERPENDICULAR axis (rule 3). Single-cell segments are
 * skipped (their axis is ambiguous without the origin stop, and they are too short to host one).
 */
export function routeAxisMap(segments: Vec[][]): Map<string, { h: boolean; v: boolean }> {
  const map = new Map<string, { h: boolean; v: boolean }>();
  for (const seg of segments) {
    if (seg.length < 2) continue;
    const horizontal = seg[0].y === seg[1].y;
    for (const c of seg) {
      const k = c.x + ',' + c.y;
      const e = map.get(k) ?? { h: false, v: false };
      if (horizontal) e.h = true;
      else e.v = true;
      map.set(k, e);
    }
  }
  return map;
}

/** The maximal open (non-wall) straight run through (x,y) along axis 'h' or 'v'. */
function maximalRun(grid: Grid, x: number, y: number, axis: 'h' | 'v'): Run | null {
  const open = (cx: number, cy: number) => grid[cy]?.[cx] !== undefined && grid[cy][cx] !== W;
  if (!open(x, y)) return null;
  const dx = axis === 'h' ? 1 : 0;
  const dy = axis === 'h' ? 0 : 1;
  let sx = x;
  let sy = y;
  while (open(sx - dx, sy - dy)) {
    sx -= dx;
    sy -= dy;
  }
  let length = 0;
  while (open(sx + dx * length, sy + dy * length)) length++;
  return { x: sx, y: sy, dx, dy, length };
}

/** Route geometry placement needs from the clearing walk (just the per-slide segments). */
export interface RouteInfo {
  segments: Vec[][];
}

/**
 * Place dynamic hazards deterministically, avoiding the start, exit, star and route-stop cells
 * (passed in `reserved`). `kinds` is the set unlocked at this chamber; `budget` caps the count.
 *
 * Moving hazards (dart/saw) are mounted PERPENDICULAR to the route's direction through a crossing
 * cell, so they sweep ACROSS the guaranteed path (a timed threat the player glides past) rather
 * than run along and block it — this needs the `route`. Stationary puffers (exempt from rule 3)
 * sit on the interior of any straight run. Hazards anchor on a run's INTERIOR (excluding its two
 * turn-stop ends), so there is always a safe staging cell to time the crossing from.
 */
export function placeHazards(
  grid: Grid,
  rng: Rng,
  kinds: HazardKind[],
  budget: number,
  reserved: Vec[],
  route?: RouteInfo,
): Hazard[] {
  if (kinds.length === 0 || budget <= 0) return [];
  const hazards: Hazard[] = [];
  const taken: Vec[] = [...reserved];
  const blocked = (cells: Vec[]) => cells.some((c) => inPlace(taken, c));

  // --- moving hazards: perpendicular crossings of the route (rule 3) ---
  const movingKinds = kinds.filter((k) => k !== 'puffer');
  if (route && movingKinds.length) {
    const axis = routeAxisMap(route.segments);
    const crossings: Run[] = [];
    for (const [k, a] of axis) {
      if (a.h && a.v) continue; // route slides both ways here — no single perpendicular
      const [cx, cy] = k.split(',').map(Number);
      const run = maximalRun(grid, cx, cy, a.h ? 'v' : 'h');
      if (!run || run.length < 3) continue;
      const atStart = cx === run.x && cy === run.y;
      const atEnd = cx === run.x + run.dx * (run.length - 1) && cy === run.y + run.dy * (run.length - 1);
      if (atStart || atEnd) continue; // crossing must be INTERIOR to its perpendicular run
      // The route must only ever CROSS this line, never travel ALONG it — otherwise the hazard
      // would run with the route, not across it. Skip runs the route slides down on their own axis.
      const runAxisChar = run.dx !== 0 ? 'h' : 'v';
      let alongRoute = false;
      for (let s = 0; s < run.length && !alongRoute; s++) {
        const a2 = axis.get(run.x + run.dx * s + ',' + (run.y + run.dy * s));
        if (a2 && a2[runAxisChar]) alongRoute = true;
      }
      if (alongRoute) continue;
      crossings.push(run);
    }
    // Fisher–Yates shuffle (seeded) so placement is varied but reproducible.
    for (let i = crossings.length - 1; i > 0; i--) {
      const j = rint(rng, i + 1);
      [crossings[i], crossings[j]] = [crossings[j], crossings[i]];
    }
    for (const run of crossings) {
      if (hazards.length >= budget) break;
      const inLen = run.length - 2; // interior length (drop the two turn-stop ends)
      if (inLen < 1) continue;
      // saws are always lethal somewhere on their span, so they need ≥2 interior cells to leave a
      // gap to slip through; darts work on a single interior cell.
      const fit = movingKinds.filter((kk) => kk !== 'saw' || inLen >= 2);
      if (fit.length === 0) continue;
      const kind = fit[rint(rng, fit.length)];
      const ax = run.x + run.dx;
      const ay = run.y + run.dy;
      const cells: Vec[] = [];
      for (let i = 0; i < inLen; i++) cells.push({ x: ax + run.dx * i, y: ay + run.dy * i });
      if (blocked(cells)) continue;
      taken.push(...cells);
      hazards.push({
        kind,
        x: ax,
        y: ay,
        dx: run.dx,
        dy: run.dy,
        length: inLen,
        period: kind === 'dart' ? DART_PERIOD : SAW_PERIOD,
        phase: rng(),
      });
    }
  }

  // --- stationary puffers: interior of any straight run (exempt from rule 3) ---
  if (kinds.includes('puffer') && hazards.length < budget) {
    const runs = straightRuns(grid);
    for (let i = runs.length - 1; i > 0; i--) {
      const j = rint(rng, i + 1);
      [runs[i], runs[j]] = [runs[j], runs[i]];
    }
    for (const run of runs) {
      if (hazards.length >= budget) break;
      if (run.length - 2 < 1) continue;
      const mid = Math.floor(run.length / 2); // an interior index (1..run.length-2)
      const cell: Vec = { x: run.x + run.dx * mid, y: run.y + run.dy * mid };
      if (inPlace(taken, cell)) continue;
      taken.push(cell);
      hazards.push({ kind: 'puffer', x: cell.x, y: cell.y, dx: 0, dy: 0, length: 1, period: PUFFER_PERIOD, phase: rng() });
    }
  }

  return hazards;
}
