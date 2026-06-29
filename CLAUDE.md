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
- `pnpm build` — typecheck + production build to `dist/` (base `/Glyph_Crypt/`); also emits the
  PWA service worker (`sw.js`) and `manifest.webmanifest` via `vite-plugin-pwa`.
- `pnpm preview` — serve the production build locally.
- `pnpm generate-pwa-assets` — regenerate the PWA icon set into `public/` from
  `public/glyph.svg` (config in `pwa-assets.config.ts`). Run after editing the source icon.

The `esbuild` and `sharp` build scripts must be allowed — handled by `pnpm-workspace.yaml`
(`allowBuilds: esbuild: true`, `sharp: true`; `sharp` powers PWA icon generation). If a fresh
`pnpm install` reports an ignored build, run `pnpm rebuild esbuild`.

## Architecture

ES modules under `src/`, in dependency order. The runtime is wired in `src/main.ts`.

### `src/core` — pure, deterministic generation (no DOM)
- **`types.ts`** — tile char constants (`W` wall, `FLOOR`, `DOT`, `STAR`, `SPIKE`, `EXIT`),
  `Grid`, `Vec`, `LevelData`, `GameState`, `Rng`, plus the dynamic-`Hazard` model
  (`HazardKind` = `dart | puffer | saw`).
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
  near/mid/far distance bands, paints reachable floor as dots, puts spikes on dead-end tips,
  and adds gated **dynamic hazards**. `isSolvable(level)` re-runs coverage to assert exit + all
  stars are reachable (on the **static** grid — timing hazards are avoidable and don't change
  reachability). **Progression** (wiki-inspired): `levelSize(idx)` grows in bands (15→25),
  `unlockedHazards(idx)` introduces one mechanic at a time (dart @2, puffer @4, saw @6, then
  combine), and `dynamicBudget(idx)` ramps the hazard count with a cap.
- **`hazards.ts`** — dynamic hazards as a parallel array on `LevelData` (not grid tiles).
  `hazardCellsAt(hazard, t)` returns the **lethal cells as a pure function of a clock** `t`
  (deterministic, no frame drift) — the single source shared by collision + rendering.
  `placeHazards(...)` lays them on straight corridors, seeded, off the start/exit/stars/spikes.

### `src/game` — runtime
- **`state.ts`** — `Game` runtime object + `createGame` / `loadChamber`. Per chamber it also
  resets `hazardClock` (drives hazard timing) and resolves `theme` via `themeForChamber(idx)`.
- **`constants.ts`** — `MOVE_INTERVAL`, `STARS_PER_LEVEL`.
- **`movement.ts`** — `tryStartMove` / `stepSlide` / `onEnter`, acting on a `Game` with
  injected `MovementHandlers` (`onStarsChanged` / `onDie` / `onWin`). Mutates tiles in place.
  `checkHazards(game, h)` kills the player when their cell intersects a lethal hazard cell.
- **`loop.ts`** — `requestAnimationFrame` with a fixed-timestep movement accumulator; also
  advances `game.hazardClock` and calls `checkHazards` each frame (so a hazard sliding onto a
  still player connects).

### `src/render` — canvas
- **`canvas.ts`** — `Renderer` with `resize` (computes `game.cell`) and `draw` (full neon
  redraw each frame; player position interpolated between cells; draws dynamic hazards from
  `hazardCellsAt`). Reads the per-chamber palette from `game.theme`.
- **`theme.ts`** — colors/glow source of truth, mirrored from the CSS `:root` block (variant 0).
  `themeForChamber(idx)` rotates the neon **palette every 5 chambers** and the wall **texture
  every 10** (wiki-style zone variety). Keep palette 0 in sync with the CSS when retheming.
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

## PWA

Installable + offline via `vite-plugin-pwa` (configured in `vite.config.ts`,
`registerType: 'autoUpdate'`). Workbox precaches the whole built app, so it plays fully offline
once installed. The manifest (`display: standalone`, portrait, `theme_color #060911`) and SW
register script are injected at build; `scope`/`start_url` derive from `base` (`/Glyph_Crypt/`).
Icons are generated from `public/glyph.svg` (`pwa-assets.config.ts`, minimal-2023 preset) — edit
the SVG then run `pnpm generate-pwa-assets`. `index.html` carries the apple-mobile-web-app metas
and `styles.css` adds `env(safe-area-inset-*)` padding for notched phones. Service workers need
HTTPS — GitHub Pages provides it.

## Testing

Vitest (`tests/*.test.ts`, jsdom env). Covers RNG determinism, maze invariants, coverage
reachability, `buildLevel` (reproducibility, 3 stars, exit≠start, spike placement, solvability,
dot counts), **hazard gating/budget + placement**, **`hazardCellsAt` purity/bounds/collision**,
**theme rotation cadence**, and progress save/load. The seeded RNG + clock-as-pure-input is what
makes generation and hazards unit-testable.

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml` (install → test → build → deploy to
GitHub Pages). Repo: `https://github.com/ARQUI2709/Glyph_Crypt`. One-time: set **Settings →
Pages** source to **GitHub Actions**. Live URL: `https://arqui2709.github.io/Glyph_Crypt/`.
The `base` in `vite.config.ts` (`/Glyph_Crypt/`) must match the repo name exactly.
