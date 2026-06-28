import type { MoveFn } from './keyboard';

/** Wire swipe gestures on the stage element to a move callback. */
export function attachTouch(stage: HTMLElement, move: MoveFn): void {
  let touchStart: { x: number; y: number } | null = null;
  stage.addEventListener(
    'touchstart',
    (e) => {
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    { passive: true },
  );
  stage.addEventListener(
    'touchend',
    (e) => {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) {
        touchStart = null;
        return;
      }
      if (Math.abs(dx) > Math.abs(dy)) move(Math.sign(dx), 0);
      else move(0, Math.sign(dy));
      touchStart = null;
    },
    { passive: true },
  );
}
