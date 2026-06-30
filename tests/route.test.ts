import { describe, it, expect } from 'vitest';
import { buildRoute } from '../src/core/route';
import { roomsMaze } from '../src/core/maze';
import { mulberry32, chamberSeed } from '../src/core/rng';
import { slideCoverage, isEscapable } from '../src/core/coverage';
import { W } from '../src/core/types';

// Mirror buildLevel's terrain: connected rooms + corridors (portrait).
function board(idx: number) {
  return roomsMaze(idx < 3 ? 11 : 13, idx < 3 ? 17 : 19, mulberry32(chamberSeed(idx)));
}

describe('buildRoute', () => {
  it('is a deterministic, pure function of the grid', () => {
    const { grid, start } = board(5);
    expect(buildRoute(grid, start.x, start.y)).toEqual(buildRoute(grid, start.x, start.y));
  });

  it('starts at the given origin and ends on a real stop cell', () => {
    const { grid, start } = board(3);
    const r = buildRoute(grid, start.x, start.y);
    expect(r.cells[0]).toEqual(start);
    expect(grid[r.exit.y][r.exit.x]).not.toBe(W);
  });

  it('only ever traverses open cells', () => {
    const { grid, start } = board(7);
    for (const c of buildRoute(grid, start.x, start.y).cells) expect(grid[c.y][c.x]).not.toBe(W);
  });

  it('covers every reachable cell on an escapable board (no stranded dots)', () => {
    let checked = 0;
    for (let i = 0; i < 14; i++) {
      const { grid, start } = board(i);
      if (!isEscapable(grid, start.x, start.y)) continue;
      checked++;
      const covered = new Set(buildRoute(grid, start.x, start.y).cells.map((c) => c.x + ',' + c.y));
      const { cov } = slideCoverage(grid, start.x, start.y);
      for (const k of cov) expect(covered.has(k)).toBe(true);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('exposes one segment per slide, each ending on the next stop', () => {
    const { grid, start } = board(6);
    const r = buildRoute(grid, start.x, start.y);
    expect(r.segments.length).toBe(r.stops.length - 1);
    for (let i = 0; i < r.segments.length; i++) {
      const seg = r.segments[i];
      expect(seg[seg.length - 1]).toEqual(r.stops[i + 1]);
    }
  });
});

describe('roomsMaze', () => {
  it('is deterministic per seed', () => {
    expect(roomsMaze(13, 19, mulberry32(42))).toEqual(roomsMaze(13, 19, mulberry32(42)));
  });

  it('produces a portrait grid, solid border, and an open spawn cell', () => {
    const { grid, start } = roomsMaze(13, 19, mulberry32(7));
    expect(grid.length).toBe(19); // rows
    expect(grid[0].length).toBe(13); // cols
    const rows = grid.length;
    const cols = grid[0].length;
    for (let x = 0; x < cols; x++) {
      expect(grid[0][x]).toBe(W);
      expect(grid[rows - 1][x]).toBe(W);
    }
    for (let y = 0; y < rows; y++) {
      expect(grid[y][0]).toBe(W);
      expect(grid[y][cols - 1]).toBe(W);
    }
    expect(grid[start.y][start.x]).not.toBe(W);
  });
});
