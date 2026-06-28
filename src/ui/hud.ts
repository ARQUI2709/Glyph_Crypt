import type { Game } from '../game/state';
import { STARS_PER_LEVEL } from '../game/constants';

const lvlEl = document.getElementById('lvl') as HTMLElement;
const starsEl = document.getElementById('stars') as HTMLElement;

export function updateHud(game: Game): void {
  lvlEl.textContent = String(game.levelIndex + 1);
  starsEl.textContent = game.starsGot + ' / ' + STARS_PER_LEVEL;
}
