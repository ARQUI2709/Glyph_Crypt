import { describe, it, expect } from 'vitest';
import { mulberry32, rint, chamberSeed } from '../src/core/rng';

describe('mulberry32', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different streams for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toEqual(b());
  });

  it('returns floats in [0, 1)', () => {
    const r = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('rint stays within [0, n)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = rint(r, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('chamberSeed is stable and distinct per index', () => {
    expect(chamberSeed(3)).toBe(chamberSeed(3));
    expect(chamberSeed(3)).not.toBe(chamberSeed(4));
  });
});
