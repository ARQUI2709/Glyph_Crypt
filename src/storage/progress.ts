/** Per-chamber saved record. */
export interface ChamberProgress {
  starsBest: number;
  dotsCleared: boolean;
  unlocked: boolean;
}

export interface Progress {
  chambers: Record<number, ChamberProgress>;
  lastPlayed: number;
}

const KEY = 'glyph-crypt:progress:v1';

function emptyProgress(): Progress {
  // Chamber 0 is always unlocked.
  return { chambers: { 0: { starsBest: 0, dotsCleared: false, unlocked: true } }, lastPlayed: 0 };
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyProgress();
    const data = JSON.parse(raw) as Progress;
    if (!data.chambers) return emptyProgress();
    if (!data.chambers[0]) data.chambers[0] = { starsBest: 0, dotsCleared: false, unlocked: true };
    return data;
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable (private mode / quota) — progress is in-memory only */
  }
}

export function isUnlocked(p: Progress, idx: number): boolean {
  return idx === 0 || !!p.chambers[idx]?.unlocked;
}

/**
 * Record the result of clearing a chamber: keep the best star count, mark a perfect
 * dots clear, and unlock the next chamber. Returns the mutated progress.
 */
export function recordWin(
  p: Progress,
  idx: number,
  stars: number,
  dotsCleared: boolean,
): Progress {
  const prev = p.chambers[idx] ?? { starsBest: 0, dotsCleared: false, unlocked: true };
  p.chambers[idx] = {
    starsBest: Math.max(prev.starsBest, stars),
    dotsCleared: prev.dotsCleared || dotsCleared,
    unlocked: true,
  };
  const next = p.chambers[idx + 1];
  if (next) next.unlocked = true;
  else p.chambers[idx + 1] = { starsBest: 0, dotsCleared: false, unlocked: true };
  p.lastPlayed = idx;
  saveProgress(p);
  return p;
}

/** Highest chamber index the player has unlocked. */
export function highestUnlocked(p: Progress): number {
  return Object.keys(p.chambers)
    .map(Number)
    .filter((i) => p.chambers[i].unlocked)
    .reduce((a, b) => Math.max(a, b), 0);
}
