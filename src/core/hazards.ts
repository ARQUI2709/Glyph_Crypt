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
 * Place dynamic hazards deterministically on straight corridors, avoiding the start, exit and
 * star cells. `kinds` is the set unlocked at this chamber (Phase A gating); `budget` caps how
 * many to place.
 *
 * Hazards anchor on the INTERIOR of a straight run (excluding its two end cells). In a single
 * corridor those end cells are turn-stops where the player rests, so keeping them clear means
 * there is always a safe place to stage from and time the crossing of the threatened interior.
 */
export function placeHazards(
  grid: Grid,
  rng: Rng,
  kinds: HazardKind[],
  budget: number,
  reserved: Vec[],
): Hazard[] {
  if (kinds.length === 0 || budget <= 0) return [];
  const runs = straightRuns(grid);
  // Fisher–Yates shuffle (seeded) so placement is varied but reproducible.
  for (let i = runs.length - 1; i > 0; i--) {
    const j = rint(rng, i + 1);
    [runs[i], runs[j]] = [runs[j], runs[i]];
  }

  const hazards: Hazard[] = [];
  const taken: Vec[] = [...reserved];
  const blocked = (cells: Vec[]) => cells.some((c) => inPlace(taken, c));

  for (const run of runs) {
    if (hazards.length >= budget) break;
    const inLen = run.length - 2; // interior length (drop the two turn-stop ends)
    if (inLen < 1) continue;
    const ax = run.x + run.dx; // interior start cell
    const ay = run.y + run.dy;
    // saws are always lethal somewhere on their span, so they need ≥2 interior cells to leave a
    // gap to slip through; darts/puffers work on a single interior cell.
    const fit = kinds.filter((k) => k !== 'saw' || inLen >= 2);
    if (fit.length === 0) continue;
    const kind = fit[rint(rng, fit.length)];

    if (kind === 'puffer') {
      const mid = Math.floor(run.length / 2); // an interior index (1..run.length-2)
      const cell: Vec = { x: run.x + run.dx * mid, y: run.y + run.dy * mid };
      if (inPlace(taken, cell)) continue;
      taken.push(cell);
      hazards.push({ kind, x: cell.x, y: cell.y, dx: 0, dy: 0, length: 1, period: PUFFER_PERIOD, phase: rng() });
    } else {
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
  return hazards;
}
