# Glyph Crypt

A neon slide-maze arcade game for the browser. Flick a direction — the glyph **slides until it
hits a wall**. Sweep up the star-dots, grab all 3 big stars, and slide from the start to the
glowing gate. Dead-ends bite: spikes wait at the tips.

> Originally a single-file prototype; rebuilt as a typed, tested, modular Vite project. The
> name and theming are original to avoid any IP overlap with similarly-themed games.

## Play

Live: `https://arqui2709.github.io/Glyph_Crypt/`

Controls: arrow keys / WASD, or swipe on touch.

## Develop

Requires Node 20+ and [pnpm](https://pnpm.io).

```sh
pnpm install      # install dependencies
pnpm dev          # Vite dev server with HMR
pnpm test         # run the Vitest unit suite
pnpm test:watch   # tests in watch mode
pnpm typecheck    # tsc --noEmit
pnpm build        # typecheck + production build to dist/
pnpm preview      # serve the production build locally
```

When developing locally the production `base` is `/Glyph_Crypt/`; `pnpm dev` serves from `/`.

## Architecture

See [CLAUDE.md](CLAUDE.md) for the module map and design notes. In short:

- `src/core` — pure, seeded game generation: `rng`, `maze`, `coverage`, `level`. Deterministic
  per chamber index, so layouts are reproducible and unit-testable.
- `src/game` — runtime state machine, movement (slide physics), fixed-timestep loop.
- `src/render` — canvas drawing and the neon theme (single source of truth for colors).
- `src/input` — keyboard and touch.
- `src/ui` — overlays, HUD, and the world-map level select.
- `src/storage` — `localStorage` progress (best stars + unlock state per chamber).

## Deploy

Pushing to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): it
installs, tests, builds, and publishes `dist/` to GitHub Pages.

One-time setup: in the GitHub repo's **Settings → Pages** set the source to **GitHub
Actions**. Push to `main` and the workflow deploys automatically.

```sh
git remote add origin https://github.com/ARQUI2709/Glyph_Crypt.git
git push -u origin main
```

The deploy `base` in [vite.config.ts](vite.config.ts) must match the repo name (`/Glyph_Crypt/`).
