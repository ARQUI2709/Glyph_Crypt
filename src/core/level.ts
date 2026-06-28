import type { Grid, LevelData, Rng, Vec } from './types';
import { W, FLOOR, DOT, STAR, SPIKE, EXIT } from './types';
import { mulberry32, rint, chamberSeed } from './rng';
import { generateMaze } from './maze';
import { slideCoverage } from './coverage';

export const STARS_PER_LEVEL = 3;

/** Board size scales with chamber index, matching the original bands. */
export function levelSize(idx: number): number {
  return idx < 3 ? 15 : idx < 6 ? 17 : 19;
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

  let dotsTotal = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) if (g[y][x] === DOT) dotsTotal++;
  }

  return { grid: g, rows, cols, start: { x: 1, y: 1 }, exit, stars, dotsTotal };
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
