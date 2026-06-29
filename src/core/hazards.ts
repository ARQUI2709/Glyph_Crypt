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

function runCells(r: Run): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < r.length; i++) out.push({ x: r.x + r.dx * i, y: r.y + r.dy * i });
  return out;
}

function inPlace(cells: Vec[], v: Vec): boolean {
  return cells.some((c) => c.x === v.x && c.y === v.y);
}

/**
 * Place dynamic hazards deterministically on straight corridors, avoiding the start, exit and
 * star cells. `kinds` is the set unlocked at this chamber (Phase A gating); `budget` caps how
 * many to place. Swept hazards (dart/saw) reserve their whole run; puffers take a single cell.
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
    const kind = kinds[rint(rng, kinds.length)];
    if (kind === 'puffer') {
      // single deadly cell at the run's interior midpoint
      const mid = Math.floor(run.length / 2);
      const cell: Vec = { x: run.x + run.dx * mid, y: run.y + run.dy * mid };
      if (inPlace(taken, cell)) continue;
      taken.push(cell);
      hazards.push({
        kind,
        x: cell.x,
        y: cell.y,
        dx: 0,
        dy: 0,
        length: 1,
        period: PUFFER_PERIOD,
        phase: rng(),
      });
    } else {
      const cells = runCells(run);
      if (blocked(cells)) continue;
      taken.push(...cells);
      hazards.push({
        kind,
        x: run.x,
        y: run.y,
        dx: run.dx,
        dy: run.dy,
        length: run.length,
        period: kind === 'dart' ? DART_PERIOD : SAW_PERIOD,
        phase: rng(),
      });
    }
  }
  return hazards;
}
