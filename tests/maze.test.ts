import { describe, it, expect } from 'vitest';
import { generateMaze, roomsMaze, longestRun, enforceRunCap, MAX_RUN } from '../src/core/maze';
import { mulberry32, chamberSeed } from '../src/core/rng';
import { isEscapable } from '../src/core/coverage';
import { W, FLOOR } from '../src/core/types';

describe('generateMaze', () => {
  it('produces a square grid of the requested size', () => {
    const g = generateMaze(15, mulberry32(1));
    expect(g.length).toBe(15);
    expect(g.every((row) => row.length === 15)).toBe(true);
  });

  it('keeps the outer border as walls', () => {
    const g = generateMaze(15, mulberry32(1));
    const n = g.length;
    for (let i = 0; i < n; i++) {
      expect(g[0][i]).toBe(W);
      expect(g[n - 1][i]).toBe(W);
      expect(g[i][0]).toBe(W);
      expect(g[i][n - 1]).toBe(W);
    }
  });

  it('carves the start cell open', () => {
    const g = generateMaze(15, mulberry32(1));
    expect(g[1][1]).toBe(FLOOR);
  });

  it('is deterministic for the same seed', () => {
    const a = generateMaze(17, mulberry32(99));
    const b = generateMaze(17, mulberry32(99));
    expect(a).toEqual(b);
  });
});

describe('rule 6 — fixed-zoom run cap', () => {
  it('roomsMaze never leaves an open straight run longer than MAX_RUN', () => {
    for (let i = 0; i < 24; i++) {
      const { cols, rows } = i < 6 ? { cols: 13, rows: 19 } : { cols: 17, rows: 27 };
      const { grid } = roomsMaze(cols, rows, mulberry32(chamberSeed(i)));
      expect(longestRun(grid)).toBeLessThanOrEqual(MAX_RUN);
    }
  });

  it('the spawn is a dead end (exactly one open neighbour) — rule 4', () => {
    for (let i = 0; i < 12; i++) {
      const { grid, start } = roomsMaze(13, 21, mulberry32(chamberSeed(i)));
      const open = (x: number, y: number) => grid[y]?.[x] !== undefined && grid[y][x] !== W;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => open(start.x + dx, start.y + dy)).length;
      expect(nb).toBe(1);
    }
  });

  it('enforceRunCap breaks an over-long run while keeping the board escapable', () => {
    // A length-11 corridor on row 1 passing through a 5-wide, 2-tall room (row 2, x=4..8). The
    // central corridor cell has a 2D bypass through the room, so capping it stays connected.
    const cols = 13;
    const open1 = (x: number) => (x >= 1 && x <= 11 ? FLOOR : W);
    const open2 = (x: number) => (x >= 4 && x <= 8 ? FLOOR : W);
    const grid = [
      Array(cols).fill(W),
      Array.from({ length: cols }, (_, x) => open1(x)),
      Array.from({ length: cols }, (_, x) => open2(x)),
      Array(cols).fill(W),
    ] as any;
    expect(longestRun(grid)).toBe(11);
    enforceRunCap(grid, MAX_RUN, { x: 1, y: 1 });
    expect(longestRun(grid)).toBeLessThanOrEqual(MAX_RUN);
    expect(isEscapable(grid, 1, 1)).toBe(true);
  });
});
