# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**Glyph Crypt** is a browser slide-maze arcade game: the player flicks a direction and the
glyph slides until it hits a wall, sweeping star-dots through connected **rooms**, collecting
3 big stars, and reaching the gate in a **different room** (which only opens once all 3 stars
are collected) while dodging wall spikes and timed hazards. Boards are **portrait** for phones
and scroll under a follow-camera. Every chamber is generated so it is **escapable** (no
soft-locks) and **fully winnable with all 3 stars**. It began as a single self-contained HTML
file and was rebuilt into a typed, tested, modular **Vite + TypeScript** project. The name and
theming are original (the player is a neon "glyph", not a mask) to avoid IP overlap with
similarly themed games. The original prototype is preserved as `Tomb of the mask.html`.

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
- **`types.ts`** — tile char constants (`W` wall, `FLOOR`, `DOT`, `STAR`, `EXIT`; `SPIKE` is
  legacy/unused — spikes now live in a parallel array), `Grid`, `Vec`, `LevelData`,
  `SpikeFace` (directional wall-face spike), `GameState`, `Rng`, plus the dynamic-`Hazard`
  model (`HazardKind` = `dart | puffer | saw`).
- **`rng.ts`** — seeded `mulberry32` PRNG + `rint`. `chamberSeed(idx)` derives a stable seed
  per chamber, so **chamber N always generates the same layout** (reproducible, testable,
  shareable). All generation takes an injected `Rng` instead of `Math.random`.
- **`maze.ts`** — `roomsMaze(cols, rows, rng)`: a **Tomb-of-the-Mask-style layout** of open
  rectangular rooms joined by 1-wide **staircased** corridors, chained for connectivity with a
  few extra loop links; returns `{ grid, start, startRoom, rooms }`. The **start is a carved
  dead-end stub** off a room (rule 4 — `carveDeadEndStub`). Open rooms are what make spikes
  dodge-able and prevent soft-locks. **Fixed-zoom run cap (rule 6)**: `MAX_RUN = 9`; `longestRun`
  measures the longest open straight run and `enforceRunCap(grid, MAX_RUN, start)` breaks any
  over-length run by walling a well-connected (room-interior) cell — only when that keeps the
  board escapable and orphans nothing (reverts otherwise). (`generateMaze` — the old perfect-maze
  backtracker — is kept for tests.)
- **`coverage.ts`** — `slideCoverage(grid, sx, sy)`: BFS where each "move" slides until a
  wall, mirroring player movement (covered cells + distance map). `isEscapable(grid, sx, sy)`:
  is the slide-stop graph **strongly connected** (can you always slide back to start)? Used as
  a generation gate so there are **no one-way pockets to get stuck in**.
- **`route.ts`** — `buildRoute(grid, sx, sy)`: builds an explicit **slide-to-wall clearing
  walk** (greedy max-coverage; BFS-travels to the nearest cell that uncovers more). Returns the
  ordered `cells`, per-slide `segments`, `stops`, `arrivals` (where it stops & from which
  direction), and `exit`. **This is the backbone of route-first generation**: dots are only
  painted where this walk goes, so 100% is always collectible.
- **`level.ts`** — `buildLevel(idx)` → `LevelData` (pure, seeded). Re-rolls terrain until every
  gate passes: run cap ≤ `MAX_RUN` (rule 6), **escapable**, **every room reachable** (rule 2),
  and the clearing walk **covers every reachable cell** (so every room gets a collectible — rule
  1, asserted by `everyRoomHasCollectible`). `buildChamberOnce` returns a `valid` flag so
  `buildLevel` only ships a chamber that passed all gates **and** is `isWinnable`. `carveExit`
  carves the exit as a **dead-end stub** (rule 5) off the farthest **different room** than the
  start; 3 stars spaced along the walk; dots on all covered floor; **`SpikeFace` spikes** mounted
  on wall faces the walk never stops against (dodge-able, off the guaranteed route); gated
  **dynamic hazards** (the route's segments are passed in so moving ones land perpendicular). The
  whole thing is wrapped in a **winnability gate** — `isWinnable(level)` searches `(stop ×
  stars-collected)` states to confirm a real spike-aware run collects all 3 stars and reaches the
  exit; re-rolls if not.
  `isSolvable` is the older spike-agnostic reachability check. **Progression**: `levelSize(idx)`
  returns portrait `{cols, rows}` bands, `unlockedHazards(idx)` (dart @2, puffer @4, saw @6),
  `dynamicBudget(idx)` caps the count.
- **`hazards.ts`** — dynamic hazards as a parallel array on `LevelData`. `hazardCellsAt(h, t)`
  returns the **lethal cells as a pure function of a clock** `t` (the single source shared by
  collision + rendering — cell-quantized so collision matches the gates). Each kind cycles through
  telegraphed sub-phases where the **lethal window is a strict subset of the visible animation**: a
  **dart** fires from a wall box, flies the corridor and **bursts on the far wall** (lethal only in
  flight); a **puffer** **swells from its origin into its open 3×3 footprint** (`Hazard.cells`,
  precomputed at placement) and is deadly only during the fully-inflated hold (the swell/collapse are
  telegraph); a **saw** slides **wall to wall and back**. `dartRender`/`pufferRender`/`sawRender` are
  pure helpers giving the renderer **continuous interpolated** geometry between the quantized lethal
  cells. `placeHazards(..., route)` places **moving** hazards (dart/saw)
  **perpendicular to the route** (rule 3): `routeAxisMap` records each route cell's slide axis,
  and a dart/saw is mounted on a perpendicular straight run that the route only ever *crosses*
  (never travels along), so it sweeps across the path rather than block it. Stationary **puffers**
  (exempt) sit on the interior of straight runs (claiming their whole 3×3 of gas) and are placed
  **first against a reserved budget share** (`~budget/3`, min 1) so the moving-hazard pass can't
  greedily eat every slot and starve them — unfilled puffer slots fall back to moving hazards. All
  anchor on a run's **interior** (never the turn-stops where the player rests). `pruneForRoute(...)` then drops
  any hazard whose footprint threatens a route stop or makes a route segment un-crossable — so a
  hazard is **never the sole blocker** and the clear-walk is always timing-passable.

### `src/game` — runtime
- **`state.ts`** — `Game` runtime object + `createGame` / `loadChamber`. Per chamber it also
  resets `hazardClock` (drives hazard timing) and resolves `theme` via `themeForChamber(idx)`.
- **`constants.ts`** — `MOVE_INTERVAL`, `STARS_PER_LEVEL`, `CELL_SIZE` (fixed on-screen cell
  size — boards scroll, never shrink), `CAMERA_LOOKAHEAD`.
- **`movement.ts`** — `tryStartMove(game, dx, dy, handlers)` / `stepSlide` / `onEnter`, acting on
  a `Game` with injected `MovementHandlers` (`onStarsChanged` / `onDie` / `onWin`). Mutates tiles
  in place. Every direction is always tappable (rule 7): tapping into a plain wall is a no-op, but
  tapping into an **immediately-adjacent spiked wall face is lethal**. Stopping a slide against a
  **spiked wall face** (`SpikeFace` matching the stop cell + slide direction) also kills.
  `checkHazards(game, h)` kills on intersecting a lethal hazard cell. The **exit gate only opens
  once all 3 stars are collected**.
- **`loop.ts`** — `requestAnimationFrame` with a fixed-timestep movement accumulator; also
  advances `game.hazardClock` and calls `checkHazards` each frame (so a hazard sliding onto a
  still player connects).

### `src/render` — canvas
- **`canvas.ts`** — `Renderer` with `resize` (fits the **portrait** stage rectangle, sets the
  fixed `game.cell = CELL_SIZE`) and `draw` (full neon redraw under a **follow-camera**: the
  view scrolls to keep the player centred — clamped to board bounds, with `CAMERA_LOOKAHEAD` in
  the slide direction — and culls off-screen cells). Draws spikes as wall-face teeth and dynamic
  hazards from `hazardCellsAt`. Reads the per-chamber palette from `game.theme`.
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
reachability + **escapability**, `route.ts` (deterministic clearing walk, full coverage on
escapable boards, segment/stop structure), `roomsMaze` (portrait, border, ≥ spawn), `buildLevel`
(reproducibility, portrait dims, 3 stars, **exit in a different room**, dodge-able spike faces,
**full winnability with all 3 stars despite spikes**, dot counts), **hazard gating/budget +
interior placement + route-passability**, **`hazardCellsAt` purity/bounds/collision**, **theme
rotation cadence**, and progress save/load. The seeded RNG + clock-as-pure-input is what makes
generation and hazards unit-testable.

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml` (install → test → build → deploy to
GitHub Pages). Repo: `https://github.com/ARQUI2709/Glyph_Crypt`. One-time: set **Settings →
Pages** source to **GitHub Actions**. Live URL: `https://arqui2709.github.io/Glyph_Crypt/`.
The `base` in `vite.config.ts` (`/Glyph_Crypt/`) must match the repo name exactly.
