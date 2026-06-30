import { describe, it, expect } from 'vitest';
import {
  buildLevel,
  isSolvable,
  isWinnable,
  STARS_PER_LEVEL,
  levelSize,
  unlockedHazards,
  dynamicBudget,
} from '../src/core/level';
import { W, DOT, STAR } from '../src/core/types';
import { buildRoute } from '../src/core/route';
import { isEscapable } from '../src/core/coverage';

describe('buildLevel', () => {
  it('is deterministic per chamber index', () => {
    const a = buildLevel(2);
    const b = buildLevel(2);
    expect(a.grid).toEqual(b.grid);
    expect(a.exit).toEqual(b.exit);
    expect(a.stars).toEqual(b.stars);
  });

  it('different chambers differ', () => {
    expect(buildLevel(0).grid).not.toEqual(buildLevel(1).grid);
  });

  it('places exactly 3 big stars, none on the exit or start', () => {
    const lvl = buildLevel(4);
    expect(lvl.stars.length).toBe(STARS_PER_LEVEL);
    for (const s of lvl.stars) {
      expect(s).not.toEqual(lvl.exit);
      expect(s).not.toEqual(lvl.start);
    }
  });

  it('puts the exit away from the start', () => {
    const lvl = buildLevel(3);
    expect(lvl.exit).not.toEqual(lvl.start);
  });

  it('scales board size with chamber index, and stays portrait (taller than wide)', () => {
    expect(levelSize(0)).toEqual({ cols: 11, rows: 17 });
    expect(levelSize(4)).toEqual({ cols: 13, rows: 19 });
    for (let i = 0; i < 20; i++) {
      const { cols, rows } = levelSize(i);
      expect(rows).toBeGreaterThan(cols);
    }
  });

  it('puts the exit in a different room than the start', () => {
    for (let i = 0; i < 12; i++) {
      const lvl = buildLevel(i);
      expect(lvl.exit).not.toEqual(lvl.start);
      // exit and start should not be adjacent/same area: at minimum, distinct cells far apart
      const dist = Math.abs(lvl.exit.x - lvl.start.x) + Math.abs(lvl.exit.y - lvl.start.y);
      expect(dist).toBeGreaterThan(2);
    }
  });

  it('mounts every spike on a real wall the clearing route never stops against', () => {
    const key = (x: number, y: number) => x + ',' + y;
    for (let i = 0; i < 12; i++) {
      const lvl = buildLevel(i);
      const { grid } = lvl;
      const route = buildRoute(grid, lvl.start.x, lvl.start.y);
      const arrivals = new Set(route.arrivals.map((a) => a.x + ',' + a.y + ',' + a.dx + ',' + a.dy));
      const reserved = new Set([key(lvl.start.x, lvl.start.y), key(lvl.exit.x, lvl.exit.y)]);
      for (const s of lvl.stars) reserved.add(key(s.x, s.y));
      for (const sp of lvl.spikes) {
        expect(grid[sp.y][sp.x]).not.toBe(W); // spike sits in an open cell...
        const wall = grid[sp.y + sp.dy]?.[sp.x + sp.dx];
        expect(wall === undefined || wall === W).toBe(true); // ...with a wall on the lethal side
        // never the wall the guaranteed route stops against, never on start/exit/star
        expect(arrivals.has(key(sp.x, sp.y) + ',' + sp.dx + ',' + sp.dy)).toBe(false);
        expect(reserved.has(key(sp.x, sp.y))).toBe(false);
      }
    }
  });

  it('guarantees a single run collects every dot + star and ends on the exit', () => {
    for (let i = 0; i < 12; i++) {
      const lvl = buildLevel(i);
      // walls are unchanged by painting, so the walk recomputes identically.
      const route = buildRoute(lvl.grid, lvl.start.x, lvl.start.y);
      const covered = new Set(route.cells.map((c) => c.x + ',' + c.y));
      // every dot, every star, AND the exit lie on the single clearing walk
      for (let y = 0; y < lvl.rows; y++) {
        for (let x = 0; x < lvl.cols; x++) {
          if (lvl.grid[y][x] === DOT || lvl.grid[y][x] === STAR) {
            expect(covered.has(x + ',' + y)).toBe(true);
          }
        }
      }
      expect(covered.has(lvl.exit.x + ',' + lvl.exit.y)).toBe(true);
    }
  });

  it('builds solvable chambers across a range of indices', () => {
    for (let i = 0; i < 12; i++) {
      expect(isSolvable(buildLevel(i))).toBe(true);
    }
  });

  it('is fully winnable with all 3 stars despite spikes, across many chambers', () => {
    for (let i = 0; i < 20; i++) {
      const lvl = buildLevel(i);
      expect(lvl.stars.length).toBe(STARS_PER_LEVEL);
      expect(isWinnable(lvl)).toBe(true);
    }
  });

  it('ships only escapable chambers — no one-way pockets to get trapped in', () => {
    for (let i = 0; i < 16; i++) {
      const lvl = buildLevel(i);
      expect(isEscapable(lvl.grid, lvl.start.x, lvl.start.y)).toBe(true);
    }
  });

  it('never lets a hazard threaten a resting stop cell on the clearing route', () => {
    for (let i = 2; i < 14; i++) {
      const lvl = buildLevel(i);
      const route = buildRoute(lvl.grid, lvl.start.x, lvl.start.y);
      const stops = new Set(route.stops.map((s) => s.x + ',' + s.y));
      for (const h of lvl.hazards) {
        const footprint =
          h.kind === 'puffer'
            ? [{ x: h.x, y: h.y }]
            : Array.from({ length: h.length }, (_, k) => ({ x: h.x + h.dx * k, y: h.y + h.dy * k }));
        for (const c of footprint) expect(stops.has(c.x + ',' + c.y)).toBe(false);
      }
    }
  });

  it('counts dots correctly', () => {
    const lvl = buildLevel(1);
    let dots = 0;
    for (const row of lvl.grid) for (const t of row) if (t === DOT) dots++;
    expect(lvl.dotsTotal).toBe(dots);
    expect(lvl.dotsTotal).toBeGreaterThan(0);
  });
});

describe('hazard gating + budget', () => {
  it('introduces dynamic hazards one kind at a time, in wiki order', () => {
    expect(unlockedHazards(0)).toEqual([]);
    expect(unlockedHazards(1)).toEqual([]);
    expect(unlockedHazards(2)).toEqual(['dart']);
    expect(unlockedHazards(4)).toEqual(['dart', 'puffer']);
    expect(unlockedHazards(6)).toEqual(['dart', 'puffer', 'saw']);
  });

  it('keeps the budget at 0 before the first mechanic and ramps with a cap', () => {
    expect(dynamicBudget(0)).toBe(0);
    expect(dynamicBudget(1)).toBe(0);
    expect(dynamicBudget(2)).toBe(1);
    expect(dynamicBudget(99)).toBeLessThanOrEqual(6);
  });

  it('only contains hazard kinds unlocked by the chamber index', () => {
    for (let i = 0; i < 14; i++) {
      const allowed = unlockedHazards(i);
      for (const hz of buildLevel(i).hazards) {
        expect(allowed).toContain(hz.kind);
      }
      expect(buildLevel(i).hazards.length).toBeLessThanOrEqual(dynamicBudget(i));
    }
  });

  it('produces identical hazards for the same chamber index', () => {
    expect(buildLevel(8).hazards).toEqual(buildLevel(8).hazards);
  });
});
