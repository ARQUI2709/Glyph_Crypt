# Plan — Stage progression + PWA

Wiki-informed improvements for **Glyph Crypt** (a slide-maze arcade game), adapted from the
*Tomb of the Mask* Fandom wiki (**Stages → Design**, **Hazards**) but with original theming
per `CLAUDE.md`. Source wiki pages were paywalled to scrapers (HTTP 402); content was
reconstructed from search snippets and the Wikipedia article.

Work order: **C → A → B → E**, with `pnpm typecheck` + `pnpm test` after each phase.

---

## Design principles taken from the wiki

- **Stages/Design:** each stage = dots + coins + exactly 3 stars + an exit; hazards are
  introduced **one at a time** in a deliberately easy debut stage, then **combined** with
  earlier hazards; difficulty also rises via **larger size** and **tighter hazard proximity**.
- **Visual rotation:** colors change every 5 stages, textures every 10 (13×6 in the original).
- **Hazard roster + debut order:** spikes (2) → bats (12) → dart trap (16) → pufferfish (20)
  → saw (24) → pipe trap (Arcade-secret). We adopt the **order**, scaled to Glyph Crypt's
  shorter chamber count, and pick hazards whose behavior is a **pure function of time**
  (deterministic, testable, layout-seeded). Bats + pipe trap are deferred (need Freeze
  power-up / Arcade mode); the true saw "chaser" is modeled as a deterministic oscillator.

---

## Phase C — Dynamic hazards (foundation)

Static single-char tiles can't express moving hazards, so dynamic hazards live in a parallel
`hazards` array on `LevelData`. The grid stays pure for static tiles + reachability.

- **`src/core/types.ts`**
  - Add `HazardKind = 'dart' | 'puffer' | 'saw'` and:
    ```ts
    interface Hazard { kind: HazardKind; x: number; y: number; dx: number; dy: number;
                       length: number; period: number; phase: number; }
    ```
  - Add `hazards: Hazard[]` to `LevelData`.
- **`src/core/hazards.ts`** (new, pure & seeded)
  - `placeHazards(grid, covArr, idx, rng): Hazard[]` — finds straight corridor runs and places
    hazards per the gating/budget rules (Phase A).
  - `hazardCellsAt(hazard, t): Vec[]` — **position purely from clock `t`** (no frame drift).
    - **dart:** projectile travels `dx,dy` over `length`, resets each `period` (inert phase
      modeled as off-grid).
    - **puffer:** stationary; deadly only during the inflated fraction of each `period`.
    - **saw:** oscillates between the two corridor ends over `period`.
- **`src/game/state.ts`** — add `hazardClock: number`; reset in `loadChamber`.
- **`src/game/loop.ts`** — while `playing`, `hazardClock += dt`; call `checkHazards` each frame.
- **`src/game/movement.ts`** — `checkHazards(game, h)`: die if player's cell ∈ any
  `hazardCellsAt(hz, game.hazardClock)`. Call on `onEnter` and from the loop tick.
- **`src/render/canvas.ts`** — draw dart bolts, puffer (passive/inflated), spinning saw.

## Phase A — Difficulty curve + mechanic gating

- **`src/core/level.ts`**
  - Extend `levelSize(idx)` bands beyond 19 (…21, 23, cap ~25).
  - `unlockedHazards(idx)`: spikes 0+, **dart 2+**, **puffer 4+**, **saw 6+**, combine 7+.
    Each debut chamber is light (1 instance, sparse); later chambers mix + scale.
  - Hazard **budget** grows with `idx` (cap the existing `2 + idx` spike curve; add a parallel
    dynamic-hazard budget).
  - `buildLevel` returns the `hazards` array via `placeHazards`.
  - `isSolvable` stays on the **static** grid — timing hazards are avoidable by design and do
    not change reachability.

## Phase B — Zone theming rotation

- **`src/render/theme.ts`** — keep current `theme` as variant 0; add a small array of original
  neon-family **palettes** + **wall-texture** styles. `themeForChamber(idx)`:
  color = `floor(idx/5) % palettes.length`, texture = `floor(idx/10) % textures.length`.
- **`src/game/state.ts`** — resolve `game.theme` in `loadChamber`.
- **`src/render/canvas.ts`** — read `game.theme` instead of the static import.
- Keep CSS `:root` as the base/source-of-truth for page chrome; document that the renderer
  drives per-chamber variants.

## Phase E — PWA (installable + offline)

The game is 100% client-side (canvas + WebAudio + localStorage) → fully offline-capable.
GitHub Pages serves HTTPS, which service workers require.

- **`vite.config.ts`** — add `vite-plugin-pwa` (dev dep): `registerType: 'autoUpdate'`,
  Workbox precache of all build assets (js/css/html/png/svg). `scope`/`start_url` honor the
  existing `base: '/Glyph_Crypt/'`.
- **Manifest** — `name`/`short_name` "Glyph Crypt", `display: standalone`,
  `orientation: portrait`, `theme_color: #060911`, matching `background_color`, icon set.
- **Icons** — author one neon-glyph **SVG**; generate PNGs (192, 512, maskable,
  apple-touch-icon, favicon) via **`@vite-pwa/assets-generator`** behind a
  `pnpm generate-pwa-assets` script → `public/`. Reproducible, no hand-built binaries.
- **`index.html`** — add `theme-color` meta, `apple-touch-icon` link, `apple-mobile-web-app-*`
  metas (plugin injects the manifest link).
- **`src/styles.css`** — add `env(safe-area-inset-*)` padding for notched phones in standalone.
- **Deploy** — `.github/workflows/deploy.yml` already builds `dist/`; SW ships with it. Confirm
  install step picks up the new devDeps.

---

## Tests & verification

- New Vitest files (seeded/deterministic):
  - `tests/level.test.ts` — chamber-N hazards ⊆ `unlockedHazards(N)`, size bands, budget grows,
    still solvable, same `idx` ⇒ identical hazards.
  - `tests/hazards.test.ts` — `hazardCellsAt` purity/determinism, saw stays in bounds, dart
    resets each period, collision detection.
  - `tests/theme.test.ts` — `themeForChamber` rotates every 5 (color) / 10 (texture).
- PWA is build-time: verify with `pnpm build` + `pnpm preview` (manifest + SW emit, installable).
- Update `CLAUDE.md`: new hazard system, progression/gating, theming cadence, PWA + asset script.

## Deferred (future slices)

Coins + score/combo (D); power-ups (Magnet/Freeze) and **bats** + freeze-destroy; Arcade
rising-tide mode + **pipe trap**; world-map theming preview; true saw chaser; puffer
solid-block-when-passive (alters sliding/coverage).
