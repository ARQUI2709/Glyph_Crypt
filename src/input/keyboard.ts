export type MoveFn = (dx: number, dy: number) => void;

const keyMap: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
};

/** Wire arrow/WASD keys to a move callback. */
export function attachKeyboard(move: MoveFn): void {
  window.addEventListener('keydown', (e) => {
    const m = keyMap[e.code];
    if (m) {
      e.preventDefault();
      move(m[0], m[1]);
    }
  });
}
