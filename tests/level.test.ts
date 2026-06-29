import { describe, it, expect } from 'vitest';
import {
  buildLevel,
  isSolvable,
  STARS_PER_LEVEL,
  levelSize,
  unlockedHazards,
  dynamicBudget,
} from '../src/core/level';
import { W, DOT, SPIKE } from '../src/core/types';

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

  it('scales board size with chamber index', () => {
    expect(levelSize(0)).toBe(15);
    expect(levelSize(4)).toBe(17);
    expect(levelSize(8)).toBe(19);
  });

  it('places spikes only on dead-end tips (one open neighbor)', () => {
    const lvl = buildLevel(6);
    const { grid } = lvl;
    for (let y = 0; y < lvl.rows; y++) {
      for (let x = 0; x < lvl.cols; x++) {
        if (grid[y][x] !== SPIKE) continue;
        let open = 0;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          if (grid[y + dy] && grid[y + dy][x + dx] !== W) open++;
        }
        expect(open).toBe(1);
      }
    }
  });

  it('builds solvable chambers across a range of indices', () => {
    for (let i = 0; i < 12; i++) {
      expect(isSolvable(buildLevel(i))).toBe(true);
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
