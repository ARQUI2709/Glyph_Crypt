import type { Game } from '../game/state';
import { W, DOT, STAR, SPIKE } from '../core/types';
import { MOVE_INTERVAL } from '../game/constants';
import { theme } from './theme';
import { starPath } from './stars';

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;

  constructor(
    private canvas: HTMLCanvasElement,
    private stage: HTMLElement,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
  }

  /** Fit the canvas to the stage and compute the cell size for the current grid. */
  resize(game: Game): void {
    const size = Math.min(this.stage.clientWidth, this.stage.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    game.cell = size / game.level.cols;
  }

  /** Full redraw of the board, collectibles, exit gate and interpolated player. */
  draw(game: Game, dt: number): void {
    const ctx = this.ctx;
    const { grid, rows, cols, exit } = game.level;
    const cell = game.cell;
    game.anim.t += dt;
    const w = cols * cell;
    const h = rows * cell;
    ctx.clearRect(0, 0, w, h);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const t = grid[y][x];
        const cx = x * cell;
        const cy = y * cell;
        if (t === W) {
          ctx.fillStyle = theme.wallFace;
          ctx.fillRect(cx, cy, cell, cell);
          ctx.strokeStyle = theme.wallGlow;
          ctx.lineWidth = Math.max(1, cell * 0.06);
          ctx.shadowColor = theme.wallGlowSoft;
          ctx.shadowBlur = cell * 0.35;
          ctx.strokeRect(cx + cell * 0.12, cy + cell * 0.12, cell * 0.76, cell * 0.76);
          ctx.shadowBlur = 0;
        } else if (t === DOT) {
          const p = 0.5 + 0.5 * Math.sin(game.anim.t / 240 + (x + y));
          ctx.fillStyle = 'rgba(255,203,61,' + (0.6 + 0.35 * p) + ')';
          ctx.shadowColor = theme.goldGlow;
          ctx.shadowBlur = cell * 0.25;
          starPath(ctx, cx + cell / 2, cy + cell / 2, cell * 0.14, cell * 0.06);
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (t === STAR) {
          const p = 0.5 + 0.5 * Math.sin(game.anim.t / 200);
          const rot = game.anim.t / 900;
          ctx.save();
          ctx.translate(cx + cell / 2, cy + cell / 2);
          ctx.rotate(rot);
          ctx.fillStyle = 'rgba(255,203,61,' + (0.85 + 0.15 * p) + ')';
          ctx.shadowColor = theme.goldGlowStrong;
          ctx.shadowBlur = cell * 0.55;
          starPath(ctx, 0, 0, cell * 0.34, cell * 0.15);
          ctx.fill();
          ctx.restore();
          ctx.shadowBlur = 0;
        } else if (t === SPIKE) {
          ctx.fillStyle = theme.spike;
          ctx.shadowColor = theme.spikeGlow;
          ctx.shadowBlur = cell * 0.28;
          const m = cell * 0.18;
          const s = cell - m * 2;
          for (let i = 0; i < 3; i++) {
            const bx = cx + m + (s / 3) * i;
            ctx.beginPath();
            ctx.moveTo(bx, cy + cell - m);
            ctx.lineTo(bx + s / 6, cy + m);
            ctx.lineTo(bx + s / 3, cy + cell - m);
            ctx.closePath();
            ctx.fill();
          }
          ctx.shadowBlur = 0;
        }
      }
    }

    // exit gate
    const ex = exit.x * cell;
    const ey = exit.y * cell;
    const glow = 0.5 + 0.5 * Math.sin(game.anim.t / 200);
    ctx.strokeStyle = theme.exit + (0.7 + 0.3 * glow) + ')';
    ctx.lineWidth = Math.max(2, cell * 0.1);
    ctx.shadowColor = theme.exitGlow;
    ctx.shadowBlur = cell * 0.6;
    ctx.strokeRect(ex + cell * 0.16, ey + cell * 0.16, cell * 0.68, cell * 0.68);
    ctx.beginPath();
    ctx.arc(ex + cell / 2, ey + cell / 2, cell * 0.12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // player glyph (interpolated between cells)
    const moving = game.moving;
    const f = moving ? Math.min(1, game.moveTimer / MOVE_INTERVAL) : 1;
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const dX = (moving ? lerp(game.player.x - moving.dx, game.player.x, f) : game.player.x) * cell;
    const dY = (moving ? lerp(game.player.y - moving.dy, game.player.y, f) : game.player.y) * cell;
    const pcx = dX + cell / 2;
    const pcy = dY + cell / 2;
    ctx.fillStyle = theme.neon;
    ctx.shadowColor = theme.neonGlow;
    ctx.shadowBlur = cell * 0.5;
    ctx.beginPath();
    ctx.arc(pcx, pcy, cell * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = theme.ink;
    const eo = cell * 0.12;
    ctx.fillRect(pcx - eo - cell * 0.05, pcy - cell * 0.06, cell * 0.1, cell * 0.14);
    ctx.fillRect(pcx + eo - cell * 0.05, pcy - cell * 0.06, cell * 0.1, cell * 0.14);
  }
}
