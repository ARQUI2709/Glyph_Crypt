import type { Grid, HazardKind, LevelData, Rng, Vec } from './types';
import { W, FLOOR, DOT, STAR, SPIKE, EXIT } from './types';
import { mulberry32, rint, chamberSeed } from './rng';
import { generateMaze } from './maze';
import { slideCoverage } from './coverage';
import { placeHazards } from './hazards';

export const STARS_PER_LEVEL = 3;

/** Board size scales with chamber index, growing in bands and capping at 25. */
export function levelSize(idx: number): number {
  if (idx < 3) return 15;
  if (idx < 6) return 17;
  if (idx < 9) return 19;
  if (idx < 12) return 21;
  if (idx < 16) return 23;
  return 25;
}

/**
 * Mechanic gating — which dynamic hazards may appear by chamber `idx`. Mirrors the wiki's
 * "introduce one at a time, then combine" cadence (dart → puffer → saw), scaled to Glyph
 * Crypt's chamber count. Spikes are always present (handled separately as static tiles).
 */
export function unlockedHazards(idx: number): HazardKind[] {
  const kinds: HazardKind[] = [];
  if (idx >= 2) kinds.push('dart');
  if (idx >= 4) kinds.push('puffer');
  if (idx >= 6) kinds.push('saw');
  return kinds;
}

/**
 * How many dynamic hazards to place. The debut chamber of any mechanic stays light (1); the
 * budget then ramps with `idx` and is capped so larger boards never become unfair.
 */
export function dynamicBudget(idx: number): number {
  if (idx < 2) return 0;
  if (idx < 4) return 1; // dart debut
  if (idx < 6) return 2; // puffer debut
  return Math.min(6, 2 + Math.floor((idx - 6) / 2));
}

interface CovCell {
  x: number;
  y: number;
  d: number;
}

/**
 * Build a playable chamber. Deterministic: the same `idx` always yields the same layout
 * (via a seeded RNG). Pure — returns fresh LevelData and never touches module/global state.
 * Ported from the original `buildLevel`.
 */
export function buildLevel(idx: number, rng: Rng = mulberry32(chamberSeed(idx))): LevelData {
  const size = levelSize(idx);
  let g!: Grid;
  let covArr: CovCell[] = [];

  // regenerate until we have a healthy, well-spread board
  for (let tries = 0; tries < 40; tries++) {
    g = generateMaze(size, rng);
    const { cov, dist } = slideCoverage(g, 1, 1);
    covArr = [...cov]
      .map((s) => {
        const [x, y] = s.split(',').map(Number);
        return { x, y, d: dist[s] };
      })
      .filter((c) => !(c.x === 1 && c.y === 1));
    if (covArr.length > 30) break;
  }
  const rows = g.length;
  const cols = g[0].length;

  // exit = farthest reachable cell from start
  covArr.sort((a, b) => b.d - a.d);
  const exit: Vec = { x: covArr[0].x, y: covArr[0].y };

  // 3 big stars: spread across the board, biased mid/far, kept apart from each other & exit
  const candidates = covArr.filter((c) => !(c.x === exit.x && c.y === exit.y));
  const dmax = covArr[0].d || 1;
  const stars: Vec[] = [];
  const farEnough = (c: CovCell, list: Vec[], min: number) =>
    list.every((s) => Math.abs(s.x - c.x) + Math.abs(s.y - c.y) >= min);
  const bands = [0.45, 0.65, 0.85];
  const minSpread = Math.max(4, Math.floor(size * 0.4));
  for (const band of bands) {
    const target = band * dmax;
    const pool = [...candidates].sort(
      (a, b) => Math.abs(a.d - target) - Math.abs(b.d - target),
    );
    for (const c of pool) {
      if (!stars.some((s) => s.x === c.x && s.y === c.y) && farEnough(c, stars, minSpread)) {
        stars.push({ x: c.x, y: c.y });
        break;
      }
    }
  }
  // fallback to fill 3 if spread was too strict
  let fi = 0;
  while (stars.length < STARS_PER_LEVEL && fi < candidates.length) {
    const c = candidates[fi++];
    if (!stars.some((s) => s.x === c.x && s.y === c.y) && !(c.x === exit.x && c.y === exit.y)) {
      stars.push({ x: c.x, y: c.y });
    }
  }

  // paint collectibles: every reachable floor cell becomes a dot...
  for (const c of covArr) {
    if (g[c.y][c.x] === FLOOR) g[c.y][c.x] = DOT;
  }
  // ...except the star cells
  for (const s of stars) g[s.y][s.x] = STAR;
  // exit cell is the gate (overrides any dot)
  g[exit.y][exit.x] = EXIT;
  // start cell clear
  g[1][1] = FLOOR;

  // spikes only on dead-end tips (covered DOT cell with exactly one open neighbor)
  const tips = covArr.filter((c) => {
    if (g[c.y][c.x] !== DOT) return false;
    let open = 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      if (g[c.y + dy] && g[c.y + dy][c.x + dx] !== W) open++;
    }
    return open === 1;
  });
  for (let i = tips.length - 1; i > 0; i--) {
    const j = rint(rng, i + 1);
    [tips[i], tips[j]] = [tips[j], tips[i]];
  }
  const spikeCount = Math.min(tips.length, 2 + idx);
  for (let i = 0; i < spikeCount; i++) g[tips[i].y][tips[i].x] = SPIKE;

  // dynamic hazards: placed on straight corridors, gated + budgeted by chamber index, and
  // kept off the start, exit, stars and existing static spikes.
  const reserved: Vec[] = [{ x: 1, y: 1 }, exit, ...stars];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) if (g[y][x] === SPIKE) reserved.push({ x, y });
  }
  const hazards = placeHazards(g, rng, unlockedHazards(idx), dynamicBudget(idx), reserved);

  let dotsTotal = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) if (g[y][x] === DOT) dotsTotal++;
  }

  return { grid: g, rows, cols, start: { x: 1, y: 1 }, exit, stars, hazards, dotsTotal };
}

/**
 * Verify a built level is winnable: from the start slide-coverage must reach the exit and
 * every star. Reuses {@link slideCoverage}. Used in tests and as a generation safety check.
 */
export function isSolvable(level: LevelData): boolean {
  const { cov } = slideCoverage(level.grid, level.start.x, level.start.y);
  const reached = (v: Vec) => cov.has(v.x + ',' + v.y);
  return reached(level.exit) && level.stars.every(reached);
}
