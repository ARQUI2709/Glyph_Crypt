import { describe, it, expect } from 'vitest';
import { hazardCellsAt, isPufferInflated, placeHazards } from '../src/core/hazards';
import type { Hazard } from '../src/core/types';
import { W, FLOOR } from '../src/core/types';
import { mulberry32 } from '../src/core/rng';

const saw: Hazard = { kind: 'saw', x: 1, y: 1, dx: 1, dy: 0, length: 5, period: 2000, phase: 0 };
const dart: Hazard = { kind: 'dart', x: 1, y: 2, dx: 1, dy: 0, length: 4, period: 1500, phase: 0 };
const puffer: Hazard = { kind: 'puffer', x: 3, y: 3, dx: 0, dy: 0, length: 1, period: 1700, phase: 0 };

describe('hazardCellsAt', () => {
  it('is a pure function of the clock (same t ⇒ same cells)', () => {
    expect(hazardCellsAt(saw, 777)).toEqual(hazardCellsAt(saw, 777));
    expect(hazardCellsAt(dart, 777)).toEqual(hazardCellsAt(dart, 777));
  });

  it('keeps a saw within its corridor bounds at all times', () => {
    for (let t = 0; t < saw.period * 3; t += 37) {
      const [c] = hazardCellsAt(saw, t);
      expect(c.y).toBe(saw.y);
      expect(c.x).toBeGreaterThanOrEqual(saw.x);
      expect(c.x).toBeLessThanOrEqual(saw.x + saw.length - 1);
    }
  });

  it('saw oscillates: starts at one end, reaches the far end mid-cycle', () => {
    expect(hazardCellsAt(saw, 0)[0].x).toBe(saw.x);
    expect(hazardCellsAt(saw, saw.period / 2)[0].x).toBe(saw.x + saw.length - 1);
  });

  it('dart flies during travel and clears the board while cooling down', () => {
    expect(hazardCellsAt(dart, 0).length).toBe(1); // launched
    expect(hazardCellsAt(dart, dart.period * 0.95).length).toBe(0); // cooldown
  });

  it('puffer toggles deadly with isPufferInflated', () => {
    expect(isPufferInflated(puffer, 0)).toBe(true);
    expect(hazardCellsAt(puffer, 0)).toEqual([{ x: 3, y: 3 }]);
    expect(isPufferInflated(puffer, puffer.period * 0.9)).toBe(false);
    expect(hazardCellsAt(puffer, puffer.period * 0.9)).toEqual([]);
  });
});

describe('placeHazards', () => {
  // a 7x3 room with a single long horizontal corridor on the middle row
  function room() {
    const cols = 7;
    const grid = [
      Array(cols).fill(W),
      [W, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, W],
      Array(cols).fill(W),
    ] as any;
    return grid;
  }

  it('returns nothing when no kinds are unlocked or budget is 0', () => {
    expect(placeHazards(room(), mulberry32(1), [], 3, [])).toEqual([]);
    expect(placeHazards(room(), mulberry32(1), ['saw'], 0, [])).toEqual([]);
  });

  it('is deterministic for the same seed and respects the budget', () => {
    const a = placeHazards(room(), mulberry32(42), ['saw', 'dart'], 1, []);
    const b = placeHazards(room(), mulberry32(42), ['saw', 'dart'], 1, []);
    expect(a).toEqual(b);
    expect(a.length).toBeLessThanOrEqual(1);
  });

  it('only emits unlocked kinds', () => {
    const hz = placeHazards(room(), mulberry32(7), ['dart'], 3, []);
    for (const h of hz) expect(h.kind).toBe('dart');
  });

  it('never places a lethal cell on a reserved cell', () => {
    const reserved = [{ x: 3, y: 1 }];
    const hz = placeHazards(room(), mulberry32(3), ['puffer'], 3, reserved);
    for (const h of hz) {
      for (let t = 0; t < h.period; t += 50) {
        for (const c of hazardCellsAt(h, t)) {
          expect(reserved).not.toContainEqual(c);
        }
      }
    }
  });
});
