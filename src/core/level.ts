import type { Grid, HazardKind, LevelData, Rng, SpikeFace, Vec } from './types';
import { W, FLOOR, DOT, STAR, EXIT } from './types';
import { mulberry32, rint, chamberSeed } from './rng';
import { roomsMaze, type Room } from './maze';
import { slideCoverage, isEscapable } from './coverage';
import { buildRoute } from './route';
import { placeHazards, pruneForRoute } from './hazards';

export const STARS_PER_LEVEL = 3;

export interface Dims {
  cols: number;
  rows: number;
}

/** Board size scales with chamber index. Portrait (taller than wide) to suit a phone screen. */
export function levelSize(idx: number): Dims {
  if (idx < 3) return { cols: 11, rows: 17 };
  if (idx < 6) return { cols: 13, rows: 19 };
  if (idx < 9) return { cols: 13, rows: 21 };
  if (idx < 12) return { cols: 15, rows: 23 };
  if (idx < 16) return { cols: 15, rows: 25 };
  return { cols: 17, rows: 27 };
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

const keyOf = (v: Vec) => v.x + ',' + v.y;

const DIR4: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** The room rectangle containing (x,y), or null if the cell is a connecting corridor. */
function roomOf(rooms: Room[], x: number, y: number): Room | null {
  for (const r of rooms) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r;
  return null;
}

/**
 * Choose the exit: the farthest reachable room cell (by slide-distance) that lies in a DIFFERENT
 * room than the start, so a level always ends in another chamber. Falls back to the farthest
 * covered cell if, somehow, no other room is reachable.
 */
function pickExit(start: Vec, rooms: Room[], covered: Vec[], g: Grid): Vec {
  const startRoom = roomOf(rooms, start.x, start.y);
  const dist = slideCoverage(g, start.x, start.y).dist;
  let best: Vec | null = null;
  let bestD = -1;
  for (const c of covered) {
    const r = roomOf(rooms, c.x, c.y);
    if (!r || r === startRoom) continue; // must be a room cell, and not the start's room
    const d = dist[keyOf(c)] ?? 0;
    if (d > bestD) {
      bestD = d;
      best = { x: c.x, y: c.y };
    }
  }
  if (best) return best;
  for (const c of covered) {
    const d = dist[keyOf(c)] ?? 0;
    if (d > bestD && !(c.x === start.x && c.y === start.y)) {
      bestD = d;
      best = { x: c.x, y: c.y };
    }
  }
  return best ?? { ...start };
}

/**
 * Build a playable chamber. Deterministic: the same `idx` always yields the same layout
 * (via a seeded RNG). Pure — returns fresh LevelData and never touches module/global state.
 *
 * Route-first: we carve a maze, then compute an explicit slide-to-wall clearing walk
 * ({@link buildRoute}). Dots are painted ONLY on cells that walk traverses and stars sit on
 * it too, so a single continuous run can always collect everything and end on the exit.
 *
 * Wrapped in a winnability gate: spikes/hazards can in principle conspire to make a chamber
 * un-completable, so we re-roll (advancing the shared RNG) until {@link isWinnable} confirms a
 * real spike-aware run collects all 3 stars and reaches the exit. Still deterministic per idx.
 */
export function buildLevel(idx: number, rng: Rng = mulberry32(chamberSeed(idx))): LevelData {
  let last!: LevelData;
  for (let attempt = 0; attempt < 16; attempt++) {
    last = buildChamberOnce(idx, rng);
    if (isWinnable(last)) return last;
  }
  return last;
}

function buildChamberOnce(idx: number, rng: Rng): LevelData {
  const { cols, rows } = levelSize(idx);
  // Terrain is connected rooms + corridors. We regenerate until it is escapable (no one-way
  // pockets), has ≥2 rooms, and the clearing walk sweeps EVERY reachable cell — so the player
  // visits every room and the dot-trail is a complete, followable path.
  let g!: ReturnType<typeof roomsMaze>['grid'];
  let start!: Vec;
  let rooms!: ReturnType<typeof roomsMaze>['rooms'];
  let route!: ReturnType<typeof buildRoute>;
  let covered!: Vec[];
  for (let tries = 0; tries < 80; tries++) {
    const built = roomsMaze(cols, rows, rng);
    g = built.grid;
    start = built.start;
    rooms = built.rooms;
    // always compute a route so g/start/route/covered are defined even on the final attempt
    route = buildRoute(g, start.x, start.y);
    const seen = new Set<string>();
    covered = [];
    for (const c of route.cells) {
      const k = keyOf(c);
      if (!seen.has(k)) {
        seen.add(k);
        covered.push(c);
      }
    }
    if (rooms.length < 2) continue;
    if (!isEscapable(g, start.x, start.y)) continue;
    const reachable = slideCoverage(g, start.x, start.y).cov;
    // require the walk to cover EVERY reachable cell (so no room is left empty/unvisited)
    if (covered.length === reachable.size && covered.length > cols + rows) break;
  }

  const exit: Vec = pickExit(start, rooms, covered, g);

  // 3 big stars: spaced along the walk (near / mid / far) and kept apart from each other.
  const distinctStops: Vec[] = [];
  const stopSeen = new Set<string>();
  for (const s of route.stops) {
    const k = keyOf(s);
    if (k === keyOf(start) || k === keyOf(exit)) continue;
    if (!stopSeen.has(k)) {
      stopSeen.add(k);
      distinctStops.push(s);
    }
  }
  const stars: Vec[] = [];
  const minSpread = Math.max(4, Math.floor(Math.min(cols, rows) * 0.4));
  const farEnough = (c: Vec, list: Vec[], min: number) =>
    list.every((s) => Math.abs(s.x - c.x) + Math.abs(s.y - c.y) >= min);
  const n = distinctStops.length;
  for (const frac of [0.3, 0.6, 0.9]) {
    const anchor = Math.min(n - 1, Math.floor(frac * n));
    // search outward from the anchor index for a stop far enough from the ones placed
    let placed = false;
    for (let off = 0; off < n && !placed; off++) {
      for (const i of [anchor + off, anchor - off]) {
        if (i < 0 || i >= n) continue;
        const c = distinctStops[i];
        if (!stars.some((s) => keyOf(s) === keyOf(c)) && farEnough(c, stars, minSpread)) {
          stars.push({ x: c.x, y: c.y });
          placed = true;
          break;
        }
      }
    }
  }
  // fallback to fill 3 if spacing was too strict
  for (let i = 0; i < n && stars.length < STARS_PER_LEVEL; i++) {
    const c = distinctStops[i];
    if (!stars.some((s) => keyOf(s) === keyOf(c))) stars.push({ x: c.x, y: c.y });
  }

  // paint collectibles: every cell the walk traverses becomes a dot...
  for (const c of covered) g[c.y][c.x] = DOT;
  // ...except the star cells, the exit gate, and the (clear) start.
  for (const s of stars) g[s.y][s.x] = STAR;
  g[exit.y][exit.x] = EXIT;
  g[start.y][start.x] = FLOOR;

  // Spiked wall faces: lethal only when the player slides INTO that wall and stops against it.
  // Candidates are wall faces the clearing walk never legitimately stops at, so the guaranteed
  // route is always safe; open rooms give the player other edges to stop at, making the spike
  // dodge-able. Reserved cells (start/exit/stars) are never guarded.
  const routeArrivals = new Set(route.arrivals.map((a) => a.x + ',' + a.y + ',' + a.dx + ',' + a.dy));
  const reservedCells = new Set<string>([keyOf(start), keyOf(exit), ...stars.map(keyOf)]);
  const spikeCandidates: SpikeFace[] = [];
  for (const c of covered) {
    if (reservedCells.has(keyOf(c))) continue;
    for (const [dx, dy] of DIR4) {
      const wx = c.x + dx;
      const wy = c.y + dy;
      const isWall = !g[wy] || g[wy][wx] === undefined || g[wy][wx] === W;
      if (!isWall) continue; // no wall to mount the spike on in this direction
      if (routeArrivals.has(c.x + ',' + c.y + ',' + dx + ',' + dy)) continue; // route stops here
      spikeCandidates.push({ x: c.x, y: c.y, dx, dy });
    }
  }
  for (let i = spikeCandidates.length - 1; i > 0; i--) {
    const j = rint(rng, i + 1);
    [spikeCandidates[i], spikeCandidates[j]] = [spikeCandidates[j], spikeCandidates[i]];
  }
  const spikes = spikeCandidates.slice(0, Math.min(spikeCandidates.length, 3 + idx));

  // dynamic hazards: placed on straight corridors, gated + budgeted by chamber index, kept off
  // the start, exit, stars and every route stop — then pruned so the guaranteed clearing walk
  // stays crossable (no hazard is ever the sole blocker).
  const reserved: Vec[] = [start, exit, ...stars, ...route.stops];
  const placed = placeHazards(g, rng, unlockedHazards(idx), dynamicBudget(idx), reserved);
  const hazards = pruneForRoute(placed, route.segments, route.stops);

  let dotsTotal = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) if (g[y][x] === DOT) dotsTotal++;
  }

  return { grid: g, rows, cols, start, exit, stars, spikes, hazards, dotsTotal };
}

/**
 * Verify a built level is winnable: from the start slide-coverage must reach the exit and
 * every star. Reuses {@link slideCoverage}. Used in tests and as a generation safety check.
 * NOTE: ignores spikes/hazards — see {@link isWinnable} for the full check.
 */
export function isSolvable(level: LevelData): boolean {
  const { cov } = slideCoverage(level.grid, level.start.x, level.start.y);
  const reached = (v: Vec) => cov.has(v.x + ',' + v.y);
  return reached(level.exit) && level.stars.every(reached);
}

/**
 * Full spike-aware completability check: does there exist a sequence of slides from the start
 * that collects ALL 3 stars and then reaches the exit, never ending a slide impaled on a spiked
 * wall? Stars are picked up on pass-through; a move is forbidden only if it STOPS against a
 * spike (that would kill the player). Searches the state graph of (stop cell × stars-collected).
 *
 * This is the guarantee behind the "always completable with all stars" promise — timing hazards
 * are excluded here because they're avoidable and don't change which cells are reachable.
 */
export function isWinnable(level: LevelData): boolean {
  const { grid, start, exit, stars, spikes } = level;
  const R = grid.length;
  const C = grid[0].length;
  const wall = (x: number, y: number) => x < 0 || y < 0 || x >= C || y >= R || grid[y][x] === W;
  const starIdx = new Map(stars.map((s, i) => [keyOf(s), i]));
  const allMask = (1 << stars.length) - 1;
  const spikeSet = new Set(spikes.map((s) => s.x + ',' + s.y + ',' + s.dx + ',' + s.dy));
  const exitKey = keyOf(exit);
  if (stars.length < STARS_PER_LEVEL) return false; // must actually have 3 stars to collect

  const seen = new Set<string>([keyOf(start) + '|0']);
  const queue: { x: number; y: number; mask: number }[] = [{ x: start.x, y: start.y, mask: 0 }];
  while (queue.length) {
    const st = queue.shift()!;
    for (const [dx, dy] of DIR4) {
      let cx = st.x;
      let cy = st.y;
      let mask = st.mask;
      let moved = false;
      while (!wall(cx + dx, cy + dy)) {
        cx += dx;
        cy += dy;
        moved = true;
        const si = starIdx.get(cx + ',' + cy);
        if (si !== undefined) mask |= 1 << si;
        if (cx + ',' + cy === exitKey && mask === allMask) return true; // reach exit with all stars
      }
      if (!moved) continue; // immediate wall, no slide
      if (spikeSet.has(cx + ',' + cy + ',' + dx + ',' + dy)) continue; // stopping here = death
      const key = cx + ',' + cy + '|' + mask;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ x: cx, y: cy, mask });
      }
    }
  }
  return false;
}
