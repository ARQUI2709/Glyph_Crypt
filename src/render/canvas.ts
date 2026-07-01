import type { Game } from '../game/state';
import type { Hazard, SpikeFace } from '../core/types';
import { W, DOT, STAR } from '../core/types';
import { MOVE_INTERVAL, CELL_SIZE, CAMERA_LOOKAHEAD } from '../game/constants';
import type { Theme } from './theme';
import { dartRender, pufferRender, sawRender } from '../core/hazards';
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
    const bx = cx + s.dx * cell * 0.6;
    const by = cy + s.dy * cell * 0.6;
    const tx = -s.dy; // tangent (along the shared edge)
    const ty = s.dx;
    const depth = cell * 0.25; // how far the spikes jut into the cell (0.3× the old 0.34)
    const half = cell * 0.5;
    ctx.fillStyle = theme.spike;
    ctx.shadowColor = theme.spikeGlow;
    ctx.shadowBlur = cell * 0.28;
    const teeth = 5;
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

  /** Draw a dynamic hazard, interpolating its motion for smooth animation. */
  private drawHazard(theme: Theme, hz: Hazard, clock: number, anim: number, cell: number): void {
    if (hz.kind === 'puffer') this.drawPuffer(theme, hz, clock, cell);
    else if (hz.kind === 'dart') this.drawDart(theme, hz, clock, cell);
    else this.drawSaw(theme, hz, clock, anim, cell);
  }

  /** Puffer: a dormant bomb sitting on its centre cell that swells gas out to fill its open 3×3,
   *  then collapses. The bomb is always drawn so the player can see (and walk over) it while it is
   *  deflated; the gas is what becomes lethal during the inflated hold. */
  private drawPuffer(theme: Theme, hz: Hazard, clock: number, cell: number): void {
    const ctx = this.ctx;
    const { scale, lethal } = pufferRender(hz, clock);
    const cells = hz.cells ?? [{ x: hz.x, y: hz.y }];
    // --- gas cloud (only while swelling/inflated) ---
    if (scale > 0) {
      ctx.save();
      ctx.fillStyle = lethal ? theme.spike : theme.wallFace;
      ctx.strokeStyle = theme.spike;
      ctx.lineWidth = Math.max(1, cell * 0.05);
      ctx.shadowColor = theme.spikeGlow;
      ctx.shadowBlur = lethal ? cell * 0.45 : cell * 0.18;
      ctx.globalAlpha = lethal ? 1 : 0.6;
      for (const c of cells) {
        // each cell reveals from the centre outward, so the gas visibly grows ring by ring
        const ring = Math.max(Math.abs(c.x - hz.x), Math.abs(c.y - hz.y)); // 0 (centre) or 1
        const reveal = Math.max(0, Math.min(1, scale * 2 - ring));
        if (reveal <= 0) continue;
        const r = cell * 0.5 * reveal;
        const px = c.x * cell + cell / 2;
        const py = c.y * cell + cell / 2;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.shadowBlur = 0;
    }
    // --- the bomb itself, always on the centre cell (a passable marker while deflated) ---
    this.drawBomb(theme, hz.x, hz.y, cell, lethal);
  }

  /** A small bomb on the puffer's centre cell: a round body with a stubby fuse. Drawn hollow/dim
   *  while dormant (the cell is walkable then) and lit red once its gas is lethal. */
  private drawBomb(theme: Theme, gx: number, gy: number, cell: number, lethal: boolean): void {
    const ctx = this.ctx;
    const px = gx * cell + cell / 2;
    const py = gy * cell + cell * 0.56;
    const r = cell * 0.24;
    ctx.save();
    ctx.lineWidth = Math.max(1, cell * 0.06);
    ctx.strokeStyle = theme.spike;
    ctx.fillStyle = lethal ? theme.spike : theme.ink;
    ctx.shadowColor = theme.spikeGlow;
    ctx.shadowBlur = lethal ? cell * 0.4 : cell * 0.15;
    ctx.globalAlpha = lethal ? 1 : 0.75;
    // body
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // fuse: a short curl rising from the top of the body
    ctx.beginPath();
    ctx.moveTo(px + r * 0.4, py - r * 0.85);
    ctx.quadraticCurveTo(px + r * 1.2, py - r * 1.4, px + r * 0.6, py - r * 1.9);
    ctx.stroke();
    // spark at the fuse tip
    ctx.fillStyle = lethal ? theme.gold : theme.spike;
    ctx.beginPath();
    ctx.arc(px + r * 0.6, py - r * 1.9, cell * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;
  }

  /** Dart: a wall box fires a bolt that flies continuously and bursts on the far wall. */
  private drawDart(theme: Theme, hz: Hazard, clock: number, cell: number): void {
    const ctx = this.ctx;
    const { stage, dist, burst } = dartRender(hz, clock);
    // Emitter box, embedded INSIDE the wall cell directly behind the bolt's path (the origin is
    // the run's first cell, so the wall sits one cell back along -dir), with a muzzle aperture
    // facing the corridor it fires into — always visible. The bolt emerges from here and bursts
    // against the far wall.
    const bx = (hz.x - hz.dx) * cell + cell / 2;
    const by = (hz.y - hz.dy) * cell + cell / 2;
    const bs = cell * 0.4;
    ctx.fillStyle = theme.wallFace;
    ctx.strokeStyle = theme.spike;
    ctx.lineWidth = Math.max(1, cell * 0.06);
    ctx.shadowColor = theme.spikeGlow;
    ctx.shadowBlur = stage === 'idle' ? cell * 0.1 : cell * 0.25;
    ctx.beginPath();
    ctx.rect(bx - bs / 2, by - bs / 2, bs, bs);
    ctx.fill();
    ctx.stroke();
    // muzzle: a bright slot straddling the box face that points down the firing direction
    // (glows while a bolt is in flight). `mw` across the barrel, `mt` its thickness.
    const mw = cell * 0.15;
    const mt = cell * 0.12;
    const fx = bx + hz.dx * (bs / 2 - cell * 0.04);
    const fy = by + hz.dy * (bs / 2 - cell * 0.04);
    const halfW = Math.abs(hz.dx) * (mt / 2) + Math.abs(hz.dy) * mw;
    const halfH = Math.abs(hz.dy) * (mt / 2) + Math.abs(hz.dx) * mw;
    ctx.fillStyle = theme.spike;
    ctx.shadowColor = theme.spikeGlow;
    ctx.shadowBlur = stage === 'flight' ? cell * 0.35 : 0;
    ctx.beginPath();
    ctx.rect(fx - halfW, fy - halfH, halfW * 2, halfH * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (stage === 'idle') return;

    // bolt head position interpolated along the flight axis (origin cell centre + dist cells)
    const px = (hz.x + hz.dx * dist) * cell + cell / 2;
    const py = (hz.y + hz.dy * dist) * cell + cell / 2;
    const tx = hz.dx;
    const ty = hz.dy;
    const nx = -ty;
    const ny = tx;
    if (stage === 'flight') {
      // Draw as a comet: a streak whose tail reaches back to the emitter mouth (so the bolt
      // visibly leaves the box) and a pointed head at the leading lethal position.
      const ex = (hz.x - hz.dx) * cell + cell / 2; // emitter cell centre (in the wall)
      const ey = (hz.y - hz.dy) * cell + cell / 2;
      ctx.save();
      ctx.strokeStyle = theme.spike;
      ctx.lineCap = 'round';
      ctx.lineWidth = cell * 0.16;
      ctx.shadowColor = theme.spikeGlow;
      ctx.shadowBlur = cell * 0.3;
      // tail: from the emitter up to a little behind the head (capped so it stays a streak)
      const back = cell * 0.7;
      const txEnd = px - tx * back;
      const tyEnd = py - ty * back;
      // start the streak from whichever is nearer the head: the emitter, or the capped tail
      const fromEmitter = Math.abs((px - ex) * tx + (py - ey) * ty) <= back;
      ctx.beginPath();
      ctx.moveTo(fromEmitter ? ex : txEnd, fromEmitter ? ey : tyEnd);
      ctx.lineTo(px, py);
      ctx.stroke();
      // pointed arrowhead at the head
      ctx.fillStyle = theme.spike;
      const along = cell * 0.2;
      const wide = cell * 0.13;
      ctx.beginPath();
      ctx.moveTo(px + tx * along, py + ty * along);
      ctx.lineTo(px + nx * wide, py + ny * wide);
      ctx.lineTo(px - nx * wide, py - ny * wide);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.shadowBlur = 0;
    } else {
      // burst flash against the wall the bolt slammed into (centred on the wall face)
      const r = cell * (0.18 + 0.32 * burst);
      ctx.save();
      ctx.globalAlpha = 1 - burst;
      ctx.fillStyle = theme.spike;
      ctx.shadowColor = theme.spikeGlow;
      ctx.shadowBlur = cell * 0.5;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.shadowBlur = 0;
    }
  }

  /** Saw: a spinning blade sliding smoothly end-to-end and back, wall to wall. */
  private drawSaw(theme: Theme, hz: Hazard, clock: number, anim: number, cell: number): void {
    const ctx = this.ctx;
    const { dist } = sawRender(hz, clock);
    const px = (hz.x + hz.dx * dist) * cell + cell / 2;
    const py = (hz.y + hz.dy * dist) * cell + cell / 2;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(anim / 120);
    ctx.fillStyle = theme.spike;
    ctx.shadowColor = theme.spikeGlow;
    ctx.shadowBlur = cell * 0.35;
    starPath(ctx, 0, 0, cell * 0.42, cell * 0.24);
    ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;
  }
}
