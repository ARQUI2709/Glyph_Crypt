# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**Glyph Crypt** is a browser slide-maze arcade game: the player flicks a direction and the
glyph slides until it hits a wall, sweeping star-dots, collecting 3 big stars, and reaching a
gate while avoiding spikes on dead-end tips. It began as a single self-contained HTML file and
was rebuilt into a typed, tested, modular **Vite + TypeScript** project. The name and theming
are original (the player is a neon "glyph", not a mask) to avoid IP overlap with similarly
themed games. The original prototype is preserved as `Tomb of the mask.html` for reference.

## Commands

Uses **pnpm** (never npm). Node 20+.

- `pnpm dev` — Vite dev server with HMR (served from `/`).
- `pnpm test` / `pnpm test:watch` — Vitest unit suite.
- `pnpm typecheck` — `tsc --noEmit`.
- `pnpm build` — typecheck + production build to `dist/` (base `/glyph-crypt/`).
- `pnpm preview` — serve the production build locally.

The `esbuild` build script must be allowed for Vite to run — handled by `pnpm-workspace.yaml`
(`allowBuilds: esbuild: true`). If a fresh `pnpm install` reports an ignored build, run
`pnpm rebuild esbuild`.

## Architecture

ES modules under `src/`, in dependency order. The runtime is wired in `src/main.ts`.

### `src/core` — pure, deterministic generation (no DOM)
- **`types.ts`** — tile char constants (`W` wall, `FLOOR`, `DOT`, `STAR`, `SPIKE`, `EXIT`),
  `Grid`, `Vec`, `LevelData`, `GameState`, `Rng`.
- **`rng.ts`** — seeded `mulberry32` PRNG + `rint`. `chamberSeed(idx)` derives a stable seed
  per chamber, so **chamber N always generates the same layout** (reproducible, testable,
  shareable). All generation takes an injected `Rng` instead of `Math.random`.
- **`maze.ts`** — `generateMaze(size, rng)`: iterative recursive-backtracker on odd cells → a
  perfect maze.
- **`coverage.ts`** — `slideCoverage(grid, sx, sy)`: BFS where each "move" slides until a
  wall, mirroring player movement. Returns covered cells + a distance map. **This is the key
  abstraction** — exit, star placement, and dot painting are all derived from slide-coverage,
  not raw maze adjacency. Changing movement rules means changing both this and `movement.ts`.
- **`level.ts`** — `buildLevel(idx)` → `LevelData` (pure, seeded): regenerates until coverage
  is healthy, places the exit at the farthest reachable cell, spreads 3 stars across
  near/mid/far distance bands, paints reachable floor as dots, and puts spikes only on
  dead-end tips. `isSolvable(level)` re-runs coverage to assert exit + all stars are reachable.

### `src/game` — runtime
- **`state.ts`** — `Game` runtime object + `createGame` / `loadChamber`.
- **`constants.ts`** — `MOVE_INTERVAL`, `STARS_PER_LEVEL`.
- **`movement.ts`** — `tryStartMove` / `stepSlide` / `onEnter`, acting on a `Game` with
  injected `MovementHandlers` (`onStarsChanged` / `onDie` / `onWin`). Mutates tiles in place.
- **`loop.ts`** — `requestAnimationFrame` with a fixed-timestep movement accumulator.

### `src/render` — canvas
- **`canvas.ts`** — `Renderer` with `resize` (computes `game.cell`) and `draw` (full neon
  redraw each frame; player position interpolated between cells).
- **`theme.ts`** — colors/glow as the **single source of truth**, mirrored from the CSS
  `:root` block in `src/styles.css`. Keep the two in sync when retheming.
- **`stars.ts`** — `starPath` polygon helper.

### `src/input`, `src/audio`, `src/ui`, `src/storage`
- **`input/keyboard.ts`**, **`input/touch.ts`** — arrows/WASD and swipe → a move callback.
- **`audio/blip.ts`** — lazy WebAudio oscillator beeps.
- **`ui/overlays.ts`**, **`ui/hud.ts`** — overlay show/hide and chamber/stars HUD.
- **`ui/worldmap.ts`** — the **level-select world map** (the navigation hub): a grid of
  chamber nodes showing best stars and lock state; clicking an unlocked chamber starts it.
- **`storage/progress.ts`** — `localStorage` progress under key `glyph-crypt:progress:v1`:
  per-chamber `{ starsBest, dotsCleared, unlocked }`. `recordWin` keeps the best star count
  and unlocks the next chamber; chamber 0 is always unlocked.

## State machine

`Game.state` is `menu | map | playing | dead | win`. Boot goes straight to the world map
(`openWorldMap` in `main.ts`). Win/death overlays offer "Next Chamber" / "Retry" and "World
Map". The render loop only draws while `playing`.

## Conventions

- Tiles are single chars mutated in place on `grid` (eating a dot sets the cell to `FLOOR`).
- Coordinates are `(x, y)` = `(col, row)`; `grid` is indexed `[y][x]`.
- Generation is deterministic per chamber index — prefer seeded `Rng` over `Math.random` in
  any new core logic so it stays testable.
- Visual styling lives in `src/styles.css` `:root` and is mirrored in `render/theme.ts`.

## Testing

Vitest (`tests/*.test.ts`, jsdom env). Covers RNG determinism, maze invariants, coverage
reachability, `buildLevel` (reproducibility, 3 stars, exit≠start, spike placement, solvability,
dot counts), and progress save/load. The seeded RNG is what makes generation unit-testable.

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml` (install → test → build → deploy to
GitHub Pages). Repo: `https://github.com/ARQUI2709/Glyph_Crypt`. One-time: set **Settings →
Pages** source to **GitHub Actions**. Live URL: `https://arqui2709.github.io/Glyph_Crypt/`.
The `base` in `vite.config.ts` (`/Glyph_Crypt/`) must match the repo name exactly.
