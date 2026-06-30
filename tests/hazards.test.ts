import { describe, it, expect } from 'vitest';
import { hazardCellsAt, isPufferInflated, placeHazards, routeAxisMap } from '../src/core/hazards';
import type { Hazard, Vec } from '../src/core/types';
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

  it('puffer is safe while swelling, deadly only during the inflated hold', () => {
    expect(isPufferInflated(puffer, 0)).toBe(false); // start of cycle: still expanding (telegraph)
    expect(hazardCellsAt(puffer, 0)).toEqual([]);
    expect(isPufferInflated(puffer, puffer.period * 0.3)).toBe(true); // mid hold: deadly
    expect(isPufferInflated(puffer, puffer.period * 0.9)).toBe(false); // collapsed
    expect(hazardCellsAt(puffer, puffer.period * 0.9)).toEqual([]);
  });

  it('puffer fills its precomputed open 3×3 footprint while inflated', () => {
    const cells: Vec[] = [
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 4, y: 3 },
    ];
    const box: Hazard = { ...puffer, cells };
    expect(hazardCellsAt(box, box.period * 0.3)).toEqual(cells);
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

describe('routeAxisMap', () => {
  it('records the slide axis of each route cell from its segments', () => {
    const horiz: Vec[] = [
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 4, y: 3 },
    ];
    const vert: Vec[] = [
      { x: 3, y: 1 },
      { x: 3, y: 2 },
    ];
    const map = routeAxisMap([horiz, vert]);
    expect(map.get('2,3')).toEqual({ h: true, v: false });
    expect(map.get('3,2')).toEqual({ h: false, v: true });
  });
});

describe('placeHazards — perpendicular moving hazards (rule 3)', () => {
  // A "+" board: a horizontal route corridor (y=3) crossing a vertical run (x=3).
  function plus() {
    const grid = Array.from({ length: 7 }, () => Array(7).fill(W));
    for (let x = 1; x <= 5; x++) grid[3][x] = FLOOR; // horizontal
    for (let y = 1; y <= 5; y++) grid[y][3] = FLOOR; // vertical
    return grid as any;
  }
  // The route slides horizontally across the centre, so (3,3) is crossed on the H axis.
  const segment: Vec[] = [
    { x: 2, y: 3 },
    { x: 3, y: 3 },
    { x: 4, y: 3 },
    { x: 5, y: 3 },
  ];

  it('mounts a dart on the axis perpendicular to the route', () => {
    const hz = placeHazards(plus(), mulberry32(1), ['dart'], 1, [], { segments: [segment] });
    expect(hz.length).toBe(1);
    const h = hz[0];
    expect(h.kind).toBe('dart');
    expect(h.dx).toBe(0); // vertical travel — perpendicular to the horizontal route
    expect(h.dy).toBe(1);
    expect(h.x).toBe(3);
  });

  it('places no moving hazard when given no route', () => {
    expect(placeHazards(plus(), mulberry32(1), ['dart'], 1, [])).toEqual([]);
  });
});
