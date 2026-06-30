import type { Grid, Hazard, HazardKind, Rng, Vec } from './types';
import { W } from './types';
import { rint } from './rng';

// Tuning for the lethal duty-cycle of each hazard kind. All timing is in milliseconds and is
// resolved at runtime from a single clock, so positions never drift between frames.
//
// Each cycle is split into telegraphed sub-phases. The LETHAL window is a strict subset of the
// visible animation: a dart bursts (visual) AFTER its flight, a puffer swells (visual) BEFORE it
// is deadly and collapses (visual) after — so what kills you is always something you saw coming.
export const DART_PERIOD = 1500;
export const DART_TRAVEL = 0.5; // fraction of the cycle the bolt is in flight (lethal)
export const DART_BURST = 0.16; // fraction after flight showing the wall impact (visual only)
export const PUFFER_PERIOD = 1700;
export const PUFFER_EXPAND = 0.18; // gas swelling out from the origin (telegraph, not yet deadly)
export const PUFFER_HOLD = 0.5; // end of the fully-inflated deadly hold; lethal in [EXPAND, HOLD)
export const PUFFER_RETRACT = 0.66; // gas collapsing back in (visual only)
export const SAW_PERIOD = 2000;

/** Wrapped cycle progress in [0,1) for a hazard at clock `t`. */
export function hazardPhase(h: Hazard, t: number): number {
  const p = t / h.period + h.phase;
  return p - Math.floor(p);
}

/** A puffer's lethal footprint: its precomputed open 3×3 cells, or just its origin as a fallback. */
function pufferCells(h: Hazard): Vec[] {
  return h.cells ?? [{ x: h.x, y: h.y }];
}

/**
 * The cells that are LETHAL right now, as a pure function of the clock `t`. Empty while a
 * hazard is in its safe phase (dart cooling down, puffer deflated). This is the single source
 * of truth shared by movement (collision) and the renderer. Positions are cell-quantized; the
 * renderer interpolates between them for smooth motion (see `dartRender`/`sawRender`).
 */
export function hazardCellsAt(h: Hazard, t: number): Vec[] {
  const p = hazardPhase(h, t);
  switch (h.kind) {
    case 'dart': {
      if (p >= DART_TRAVEL) return []; // burst/cooldown — no bolt to collide with
      const step = Math.min(h.length - 1, Math.floor((p / DART_TRAVEL) * h.length));
      return [{ x: h.x + h.dx * step, y: h.y + h.dy * step }];
    }
    case 'puffer':
      return isPufferInflated(h, t) ? pufferCells(h) : [];
    case 'saw': {
      const tri = p < 0.5 ? p * 2 : (1 - p) * 2; // 0→1→0 triangle wave
      const step = Math.round(tri * (h.length - 1));
      return [{ x: h.x + h.dx * step, y: h.y + h.dy * step }];
    }
  }
}

/** True only during the puffer's fully-inflated, deadly hold (not while swelling/collapsing). */
export function isPufferInflated(h: Hazard, t: number): boolean {
  const p = hazardPhase(h, t);
  return p >= PUFFER_EXPAND && p < PUFFER_HOLD;
}

/** Continuous bolt geometry for smooth dart rendering (lethal cells still come from `hazardCellsAt`). */
export interface DartRender {
  stage: 'flight' | 'burst' | 'idle';
  dist: number; // continuous distance from the box along (dx,dy), in cells (0 → length at the wall)
  burst: number; // 0→1 impact-flash progress while `stage === 'burst'`
}
export function dartRender(h: Hazard, t: number): DartRender {
  const p = hazardPhase(h, t);
  // The far wall FACE, measured in cells from the origin: the last open cell is index length-1,
  // so its outer edge (touching the wall) is at length-0.5. The bolt flies up to there and the
  // burst sits exactly against the wall (never centred inside it, never a cell short). Clamping
  // keeps the visible head from ever lagging its lethal cell (which is always ≥ floor(p·length)).
  const wall = h.length - 0.5;
  if (p < DART_TRAVEL) {
    return { stage: 'flight', dist: Math.min((p / DART_TRAVEL) * h.length, wall), burst: 0 };
  }
  if (p < DART_TRAVEL + DART_BURST) {
    return { stage: 'burst', dist: wall, burst: (p - DART_TRAVEL) / DART_BURST };
  }
  return { stage: 'idle', dist: 0, burst: 0 };
}

/** Continuous swell for smooth puffer rendering. `scale` 0→1 grows the 3×3 gas; `lethal` mirrors
 *  the inflated hold. Expand and retract are telegraph/cooldown — visible but harmless. */
export interface PufferRender {
  scale: number;
  lethal: boolean;
}
export function pufferRender(h: Hazard, t: number): PufferRender {
  const p = hazardPhase(h, t);
  if (p < PUFFER_EXPAND) return { scale: p / PUFFER_EXPAND, lethal: false };
  if (p < PUFFER_HOLD) return { scale: 1, lethal: true };
  if (p < PUFFER_RETRACT) return { scale: 1 - (p - PUFFER_HOLD) / (PUFFER_RETRACT - PUFFER_HOLD), lethal: false };
  return { scale: 0, lethal: false };
}

/** Continuous blade position for smooth saw rendering: a triangle wave sliding wall to wall.
 *  A small overshoot at each extreme lets the blade visibly kiss the wall borders it bounces off
 *  (visual only — the lethal end cells from `hazardCellsAt` stay within [0, length-1]). */
const SAW_OVERSHOOT = 0.2; // cells the blade dips into each wall at the turnaround
export function sawRender(h: Hazard, t: number): { dist: number } {
  const p = hazardPhase(h, t);
  const tri = p < 0.5 ? p * 2 : (1 - p) * 2;
  return { dist: -SAW_OVERSHOOT + tri * (h.length - 1 + 2 * SAW_OVERSHOOT) };
}

/** Ms the player spends crossing one cell while sliding. Mirrors game `MOVE_INTERVAL`
 *  (kept here so core stays free of a game-layer import, like theme mirrors the CSS). */
const CROSS_MS = 40;

/** Every cell a hazard could EVER be lethal on, ignoring timing (its spatial footprint). */
function footprint(h: Hazard): Vec[] {
  if (h.kind === 'puffer') return h.cells ?? [{ x: h.x, y: h.y }];
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

  // Reserve a share of the budget for stationary puffers so the moving-hazard pass below can't
  // greedily consume every slot — otherwise puffers (placed last) never spawn at all. Any reserved
  // slots that puffers can't fill are handed back to the moving pass, which is capped at full budget.
  const pufferCap = kinds.includes('puffer') ? Math.min(budget, Math.max(1, Math.round(budget / 3))) : 0;

  // --- stationary puffers: interior of any straight run (exempt from rule 3) ---
  // A puffer swells from its origin into a 3×3 box of gas, so its lethal footprint is the OPEN
  // cells of that 3×3 (walls clip it). We claim the whole footprint so the gas never overlaps a
  // reserved/already-taken cell; pruneForRoute later drops any whose gas would block a route stop.
  if (pufferCap > 0) {
    const open = (x: number, y: number) => grid[y]?.[x] !== undefined && grid[y][x] !== W;
    const runs = straightRuns(grid);
    for (let i = runs.length - 1; i > 0; i--) {
      const j = rint(rng, i + 1);
      [runs[i], runs[j]] = [runs[j], runs[i]];
    }
    for (const run of runs) {
      if (hazards.length >= pufferCap) break;
      if (run.length - 2 < 1) continue;
      const mid = Math.floor(run.length / 2); // an interior index (1..run.length-2)
      const cx = run.x + run.dx * mid;
      const cy = run.y + run.dy * mid;
      const cells: Vec[] = [];
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (open(cx + ox, cy + oy)) cells.push({ x: cx + ox, y: cy + oy });
        }
      }
      if (blocked(cells)) continue;
      taken.push(...cells);
      hazards.push({ kind: 'puffer', x: cx, y: cy, dx: 0, dy: 0, length: 1, period: PUFFER_PERIOD, phase: rng(), cells });
    }
  }

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
      const inLen = run.length - 2; // interior length, used only to size-gate saws below
      if (inLen < 1) continue;
      // saws are always lethal somewhere on their span, so they need ≥2 interior cells to leave a
      // gap to slip through; darts only threaten during their flight (then cool down).
      const fit = movingKinds.filter((kk) => kk !== 'saw' || inLen >= 2);
      if (fit.length === 0) continue;
      const kind = fit[rint(rng, fit.length)];
      // Both kinds sweep the FULL corridor, wall to wall (span includes the two end cells against
      // the walls): a saw bounces end to end; a dart fires from the wall behind it and bursts
      // against the far wall, with its emitter embedded in the near wall.
      const len = run.length;
      const ax = run.x;
      const ay = run.y;
      const cells: Vec[] = [];
      for (let i = 0; i < len; i++) cells.push({ x: ax + run.dx * i, y: ay + run.dy * i });
      if (blocked(cells)) continue;
      taken.push(...cells);
      hazards.push({
        kind,
        x: ax,
        y: ay,
        dx: run.dx,
        dy: run.dy,
        length: len,
        period: kind === 'saw' ? SAW_PERIOD : DART_PERIOD,
        phase: rng(),
      });
    }
  }

  return hazards;
}
