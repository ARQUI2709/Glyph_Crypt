import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadProgress,
  saveProgress,
  recordWin,
  isUnlocked,
  highestUnlocked,
} from '../src/storage/progress';

beforeEach(() => {
  localStorage.clear();
});

describe('progress storage', () => {
  it('starts with only chamber 0 unlocked', () => {
    const p = loadProgress();
    expect(isUnlocked(p, 0)).toBe(true);
    expect(isUnlocked(p, 1)).toBe(false);
  });

  it('round-trips through localStorage', () => {
    const p = loadProgress();
    recordWin(p, 0, 2, false);
    const reloaded = loadProgress();
    expect(reloaded.chambers[0].starsBest).toBe(2);
    expect(isUnlocked(reloaded, 1)).toBe(true);
  });

  it('keeps the best star count (high-water mark)', () => {
    let p = loadProgress();
    p = recordWin(p, 0, 3, true);
    p = recordWin(p, 0, 1, false);
    expect(p.chambers[0].starsBest).toBe(3);
    expect(p.chambers[0].dotsCleared).toBe(true);
  });

  it('unlocks the next chamber on win', () => {
    let p = loadProgress();
    p = recordWin(p, 0, 1, false);
    p = recordWin(p, 1, 1, false);
    expect(isUnlocked(p, 2)).toBe(true);
    expect(highestUnlocked(p)).toBe(2);
  });

  it('falls back to empty progress on corrupt data', () => {
    localStorage.setItem('glyph-crypt:progress:v1', '{not json');
    const p = loadProgress();
    expect(isUnlocked(p, 0)).toBe(true);
  });

  it('saveProgress then loadProgress preserves lastPlayed', () => {
    const p = loadProgress();
    p.lastPlayed = 5;
    saveProgress(p);
    expect(loadProgress().lastPlayed).toBe(5);
  });
});
