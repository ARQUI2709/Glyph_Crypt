import type { Rng } from './types';

/**
 * mulberry32 — a tiny, fast, deterministic PRNG. Same seed → same sequence,
 * which is what makes maze/coverage/level generation reproducible and testable.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, n). Drop-in replacement for the original `rint`. */
export function rint(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

/** Base seed for the world; chamber N derives from this so layouts are stable. */
export const WORLD_SEED = 0x9e3779b1;

/** Deterministic per-chamber seed. */
export function chamberSeed(index: number): number {
  // Mix the chamber index into the world seed (avoids adjacent-seed correlation).
  return (WORLD_SEED ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0;
}
