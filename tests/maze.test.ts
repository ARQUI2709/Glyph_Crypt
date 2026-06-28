import { describe, it, expect } from 'vitest';
import { generateMaze } from '../src/core/maze';
import { mulberry32 } from '../src/core/rng';
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
