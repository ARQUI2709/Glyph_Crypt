import { describe, it, expect } from 'vitest';
import { slideCoverage } from '../src/core/coverage';
import { generateMaze } from '../src/core/maze';
import { mulberry32 } from '../src/core/rng';

describe('slideCoverage', () => {
  it('includes the start at distance 0', () => {
    const g = generateMaze(15, mulberry32(5));
    const { cov, dist } = slideCoverage(g, 1, 1);
    expect(cov.has('1,1')).toBe(true);
    expect(dist['1,1']).toBe(0);
  });

  it('assigns a distance to every covered cell', () => {
    const g = generateMaze(15, mulberry32(5));
    const { cov, dist } = slideCoverage(g, 1, 1);
    for (const k of cov) expect(dist[k]).toBeDefined();
  });

  it('covers many cells in a real maze', () => {
    const g = generateMaze(15, mulberry32(5));
    const { cov } = slideCoverage(g, 1, 1);
    expect(cov.size).toBeGreaterThan(20);
  });
});
