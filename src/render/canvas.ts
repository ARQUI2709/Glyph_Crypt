import type { Game } from '../game/state';
import type { Hazard, SpikeFace } from '../core/types';
import { W, DOT, STAR } from '../core/types';
import { MOVE_INTERVAL, CELL_SIZE, CAMERA_LOOKAHEAD } from '../game/constants';
import type { Theme } from './theme';
import { hazardCellsAt, isPufferInflated } from '../core/hazards';
import { starPath } from './stars';

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  /** Viewport size in CSS px (the canvas fills the portrait stage rectangle). */
  private viewW = 0;
  private viewH = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private stage: HTMLElement,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
  }

  /** Fit the canvas to the (portrait) stage rectangle. Cell size is FIXED (CELL_SIZE) — bigger
   *  chambers scroll under the follow-camera instead of shrinking — so zoom is identical. */
  resize(game: Game): void {
    const w = Math.max(1, this.stage.clientWidth);
    const h = Math.max(1, this.stage.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewW = w;
    this.viewH = h;
    game.cell = CELL_SIZE;
    // snap the camera onto the player so a fresh chamber opens centered, no pan-in.
    const c = game.cell;
    const t = this.cameraTarget(game, (game.player.x + 0.5) * c, (game.player.y + 0.5) * c, null);
    game.camera.x = t.x;
    game.camera.y = t.y;
  }

  /** Clamped top-left camera offset so `(fx,fy)` (plus look-ahead in `dir`) is centered. */
  private cameraTarget(
    game: Game,
    fx: number,
    fy: number,
    dir: { dx: number; dy: number } | null,
  ): { x: number; y: number } {
    const cell = game.cell;
    const lead = dir ? CAMERA_LOOKAHEAD * cell : 0;
    const cx = fx + (dir ? dir.dx * lead : 0);
    const cy = fy + (dir ? dir.dy * lead : 0);
    const clamp = (target: number, world: number, view: number) =>
      world <= view ? (world - view) / 2 : Math.max(0, Math.min(world - view, target - view / 2));
    return {
      x: clamp(cx, game.level.cols * cell, this.viewW),
      y: clamp(cy, game.level.rows * cell, this.viewH),
    };
  }

  /** Full redraw of the board, collectibles, exit gate and interpolated player. */
  draw(game: Game, dt: number): void {
    const ctx = this.ctx;
    const theme = game.theme;
    const { grid, rows, cols, exit, hazards } = game.level;
    const cell = game.cell;
    const viewW = this.viewW;
    const viewH = this.viewH;
    game.anim.t += dt;

    // interpolated player position (needed up front to drive the camera)
    const moving = game.moving;
    const f = moving ? Math.min(1, game.moveTimer / MOVE_INTERVAL) : 1;
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const dX = (moving ? lerp(game.player.x - moving.dx, game.player.x, f) : game.player.x) * cell;
    const dY = (moving ? lerp(game.player.y - moving.dy, game.player.y, f) : game.player.y) * cell;
    const pcx = dX + cell / 2;
    const pcy = dY + cell / 2;

    // smooth the follow-camera toward its clamped, look-ahead target
    const target = this.cameraTarget(game, pcx, pcy, moving);
    const k = Math.min(1, dt / 120);
    game.camera.x += (target.x - game.camera.x) * k;
    game.camera.y += (target.y - game.camera.y) * k;
    const camX = game.camera.x;
    const camY = game.camera.y;

    // background fills the whole viewport (board may not cover it on big chambers)
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.save();
    ctx.translate(-camX, -camY);

    // cull to the visible window (+1 cell margin) for big scrolling boards
    const x0 = Math.max(0, Math.floor(camX / cell) - 1);
    const y0 = Math.max(0, Math.floor(camY / cell) - 1);
    const x1 = Math.min(cols - 1, Math.ceil((camX + viewW) / cell) + 1);
    const y1 = Math.min(rows - 1, Math.ceil((camY + viewH) / cell) + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = grid[y][x];
        const cx = x * cell;
        const cy = y * cell;
        if (t === W) {
          this.drawWall(theme, cx, cy, cell);
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
        }
      }
    }

    // spiked wall faces (mounted on the wall, pointing into the open cell)
    for (const s of game.level.spikes) this.drawSpikeFace(theme, s, cell);

    // dynamic hazards (above tiles, below exit/player)
    for (const hz of hazards) this.drawHazard(theme, hz, game.hazardClock, game.anim.t, cell);

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

    // player glyph (interpolated between cells; position computed above for the camera)
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

    ctx.restore();
  }

  /** Draw a spike row on the wall face the player would impale themselves on. */
  private drawSpikeFace(theme: Theme, s: SpikeFace, cell: number): void {
    const ctx = this.ctx;
    const cx = (s.x + 0.5) * cell;
    const cy = (s.y + 0.5) * cell;
    // Boundary midpoint between the open cell and the spiked wall, and the edge's tangent.
    const bx = cx + s.dx * cell * 0.5;
    const by = cy + s.dy * cell * 0.5;
    const tx = -s.dy; // tangent (along the shared edge)
    const ty = s.dx;
    const depth = cell * 0.34; // how far the spikes jut into the cell
    const half = cell * 0.5;
    ctx.fillStyle = theme.spike;
    ctx.shadowColor = theme.spikeGlow;
    ctx.shadowBlur = cell * 0.28;
    const teeth = 3;
    for (let i = 0; i < teeth; i++) {
      const a = -half + (cell / teeth) * i;
      const b = a + cell / teeth;
      ctx.beginPath();
      ctx.moveTo(bx + tx * a, by + ty * a);
      ctx.lineTo(bx + tx * b, by + ty * b);
      // tip points into the open cell (opposite the wall direction)
      const mid = (a + b) / 2;
      ctx.lineTo(bx + tx * mid - s.dx * depth, by + ty * mid - s.dy * depth);
      ctx.closePath();
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  /** Draw one wall cell in the chamber's current texture style. */
  private drawWall(theme: Theme, cx: number, cy: number, cell: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = theme.wallFace;
    ctx.fillRect(cx, cy, cell, cell);
    ctx.strokeStyle = theme.wallGlow;
    ctx.lineWidth = Math.max(1, cell * 0.06);
    ctx.shadowColor = theme.wallGlowSoft;
    ctx.shadowBlur = cell * 0.35;
    if (theme.texture === 'solid') {
      ctx.strokeRect(cx + cell * 0.06, cy + cell * 0.06, cell * 0.88, cell * 0.88);
    } else if (theme.texture === 'hatch') {
      ctx.strokeRect(cx + cell * 0.12, cy + cell * 0.12, cell * 0.76, cell * 0.76);
      ctx.beginPath();
      ctx.moveTo(cx + cell * 0.2, cy + cell * 0.8);
      ctx.lineTo(cx + cell * 0.8, cy + cell * 0.2);
      ctx.stroke();
    } else {
      // 'outline' (default / palette 0)
      ctx.strokeRect(cx + cell * 0.12, cy + cell * 0.12, cell * 0.76, cell * 0.76);
    }
    ctx.shadowBlur = 0;
  }

  /** Draw a dynamic hazard at its current lethal/passive position. */
  private drawHazard(theme: Theme, hz: Hazard, clock: number, anim: number, cell: number): void {
    const ctx = this.ctx;
    if (hz.kind === 'puffer') {
      const inflated = isPufferInflated(hz, clock);
      const px = hz.x * cell + cell / 2;
      const py = hz.y * cell + cell / 2;
      const r = inflated ? cell * 0.4 : cell * 0.22;
      ctx.fillStyle = inflated ? theme.spike : theme.wallFace;
      ctx.strokeStyle = theme.spike;
      ctx.lineWidth = Math.max(1, cell * 0.05);
      ctx.shadowColor = theme.spikeGlow;
      ctx.shadowBlur = inflated ? cell * 0.4 : cell * 0.12;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      return;
    }
    const cells = hazardCellsAt(hz, clock);
    if (cells.length === 0) return; // dart cooling down — nothing lethal on board
    const c = cells[0];
    const px = c.x * cell + cell / 2;
    const py = c.y * cell + cell / 2;
    if (hz.kind === 'dart') {
      ctx.fillStyle = theme.spike;
      ctx.shadowColor = theme.spikeGlow;
      ctx.shadowBlur = cell * 0.3;
      ctx.beginPath();
      ctx.arc(px, py, cell * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      // saw — spinning blade
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(anim / 120);
      ctx.fillStyle = theme.spike;
      ctx.shadowColor = theme.spikeGlow;
      ctx.shadowBlur = cell * 0.35;
      starPath(ctx, 0, 0, cell * 0.38, cell * 0.24);
      ctx.fill();
      ctx.restore();
      ctx.shadowBlur = 0;
    }
  }
}
