import './styles.css';
import { createGame, loadChamber } from './game/state';
import type { Game } from './game/state';
import { STARS_PER_LEVEL } from './game/constants';
import { tryStartMove } from './game/movement';
import type { MovementHandlers } from './game/movement';
import { startLoop } from './game/loop';
import { Renderer } from './render/canvas';
import { attachKeyboard } from './input/keyboard';
import { attachTouch } from './input/touch';
import { blip } from './audio/blip';
import { showOverlay, hideOverlay } from './ui/overlays';
import { updateHud } from './ui/hud';
import { showWorldMap } from './ui/worldmap';
import { loadProgress, recordWin } from './storage/progress';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const stage = document.getElementById('stage') as HTMLElement;
const footHint = document.getElementById('footHint') as HTMLElement;

const game: Game = createGame(0);
const renderer = new Renderer(canvas, stage);
let progress = loadProgress();

function startChamber(idx: number): void {
  hideOverlay();
  loadChamber(game, idx);
  renderer.resize(game);
  updateHud(game);
  game.state = 'playing';
  footHint.textContent = 'Grab all 3 stars, then slide into the purple gate.';
}

function openWorldMap(): void {
  game.state = 'map';
  footHint.textContent = 'Select a chamber to enter.';
  showWorldMap(progress, startChamber);
}

const handlers: MovementHandlers = {
  onStarsChanged() {
    updateHud(game);
  },
  onDie() {
    game.state = 'dead';
    game.moving = null;
    blip(140, 0.25, 'sawtooth');
    showOverlay(`<h2 style="color:var(--spike)">Impaled</h2>
      <p>A hazard caught the glyph. Watch the spikes, darts, puffers and saws — time your slides.</p>
      <button id="retryBtn">Retry Chamber</button>
      <button id="mapBtn">World Map</button>`);
    (document.getElementById('retryBtn') as HTMLButtonElement).onclick = () =>
      startChamber(game.levelIndex);
    (document.getElementById('mapBtn') as HTMLButtonElement).onclick = openWorldMap;
  },
  onWin() {
    game.state = 'win';
    game.moving = null;
    blip(880, 0.12);
    const perfect = game.starsGot === STARS_PER_LEVEL && game.dotsLeft === 0;
    const filled = '★'.repeat(game.starsGot);
    const empty = '☆'.repeat(STARS_PER_LEVEL - game.starsGot);
    const dotsTotal = game.level.dotsTotal;
    progress = recordWin(progress, game.levelIndex, game.starsGot, game.dotsLeft === 0);
    showOverlay(`<h2>${perfect ? 'Perfect Chamber' : 'Chamber Cleared'}</h2>
      <div class="stars-row" style="color:var(--gold)">${filled}<span style="opacity:.3">${empty}</span></div>
      <p>Star-dots: <span class="stat">${dotsTotal - game.dotsLeft} / ${dotsTotal}</span></p>
      <button id="nextBtn">Next Chamber →</button>
      <button id="mapBtn">World Map</button>`);
    (document.getElementById('nextBtn') as HTMLButtonElement).onclick = () =>
      startChamber(game.levelIndex + 1);
    (document.getElementById('mapBtn') as HTMLButtonElement).onclick = openWorldMap;
  },
};

attachKeyboard((dx, dy) => tryStartMove(game, dx, dy));
attachTouch(stage, (dx, dy) => tryStartMove(game, dx, dy));
window.addEventListener('resize', () => {
  if (game.state === 'playing') renderer.resize(game);
});

startLoop(game, renderer, handlers);
openWorldMap();
