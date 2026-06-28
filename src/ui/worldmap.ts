import type { Progress } from '../storage/progress';
import { isUnlocked, highestUnlocked } from '../storage/progress';
import { STARS_PER_LEVEL } from '../game/constants';
import { showOverlay, overlayEl } from './overlays';

/**
 * Render the level-select world map into the overlay. Chambers show best stars earned and
 * lock state (chamber i unlocks when i-1 is cleared). Clicking an unlocked chamber starts it.
 */
export function showWorldMap(progress: Progress, onSelect: (idx: number) => void): void {
  const count = Math.max(8, highestUnlocked(progress) + 2);
  let cells = '';
  for (let i = 0; i < count; i++) {
    const unlocked = isUnlocked(progress, i);
    const rec = progress.chambers[i];
    const best = rec?.starsBest ?? 0;
    const cleared = best > 0 || rec?.dotsCleared;
    const stars = unlocked
      ? '★'.repeat(best) + '☆'.repeat(STARS_PER_LEVEL - best)
      : '🔒';
    const cls = ['chamber'];
    if (!unlocked) cls.push('locked');
    if (cleared) cls.push('cleared');
    cells += `<button class="${cls.join(' ')}" data-idx="${i}" ${unlocked ? '' : 'disabled'}>
      <span class="num">${i + 1}</span><span class="cstars">${stars}</span></button>`;
  }
  showOverlay(`<h1>Glyph Crypt</h1>
    <p>Choose a chamber. Slide until you hit a wall — sweep the star-dots, grab all 3 stars, reach the gate.</p>
    <div class="map-grid">${cells}</div>
    <div class="hint">Arrow keys / WASD · or swipe on touch</div>`);

  overlayEl()
    .querySelectorAll<HTMLButtonElement>('.chamber:not(.locked)')
    .forEach((btn) => {
      btn.onclick = () => onSelect(Number(btn.dataset.idx));
    });
}
