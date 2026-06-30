/**
 * Palette + glow source of truth, mirrored from the CSS custom properties in styles.css.
 *
 * Zones rotate their look on a fixed cadence (inspired by the wiki's "color every 5 stages,
 * texture every 10"): `themeForChamber(idx)` swaps the neon **palette** every 5 chambers and
 * the wall **texture** every 10. The CSS `:root` block stays the base/source-of-truth for the
 * page chrome (variant 0); the renderer drives the per-chamber variants. Keep palette 0 in
 * sync with the CSS when retheming.
 */
export type WallTexture = 'outline' | 'solid' | 'hatch';

export interface Theme {
  bg: string;
  wallFace: string;
  wallGlow: string;
  wallGlowSoft: string;
  neon: string;
  neonGlow: string;
  gold: string;
  goldGlowStrong: string;
  goldGlow: string;
  spike: string;
  spikeGlow: string;
  exit: string; // completed with alpha + ')'
  exitGlow: string;
  ink: string;
  texture: WallTexture;
}

// Collectible/hazard/exit colors stay constant across zones for readability; the **wall family is
// also fixed (always blue)** so the crypt walls read the same in every chamber. Only the background
// and player-neon family shift per zone.
const SHARED = {
  wallFace: '#0e1c38',
  wallGlow: 'rgba(47,125,240,0.85)',
  wallGlowSoft: 'rgba(47,125,240,0.7)',
  gold: '#ffcb3d',
  goldGlowStrong: 'rgba(255,203,61,0.95)',
  goldGlow: 'rgba(255,203,61,0.8)',
  spike: '#ff3b6b',
  spikeGlow: 'rgba(255,59,107,0.8)',
  exit: 'rgba(177,77,255,',
  exitGlow: 'rgba(177,77,255,0.9)',
  ink: '#060911',
} as const;

/**
 * Per-zone palettes rotated one per 5 chambers. Index 0 mirrors the CSS `:root`. The wall family
 * is **not** part of this — walls are always blue (see `SHARED`); only the background and player
 * neon shift per zone.
 */
const palettes = [
  {
    bg: '#060911',
    neon: '#25e0d8',
    neonGlow: 'rgba(37,224,216,0.9)',
  },
  {
    bg: '#0a0713',
    neon: '#ff7be0',
    neonGlow: 'rgba(255,123,224,0.9)',
  },
  {
    bg: '#04110d',
    neon: '#7dffb0',
    neonGlow: 'rgba(125,255,176,0.9)',
  },
  {
    bg: '#12080a',
    neon: '#ffd36b',
    neonGlow: 'rgba(255,211,107,0.9)',
  },
] as const;

/** Wall textures rotated one per 10 chambers. */
const textures: WallTexture[] = ['outline', 'solid', 'hatch'];

/** Build the full theme for a chamber: palette every 5 chambers, texture every 10. */
export function themeForChamber(idx: number): Theme {
  const pal = palettes[Math.floor(idx / 5) % palettes.length];
  const texture = textures[Math.floor(idx / 10) % textures.length];
  return { ...pal, ...SHARED, texture };
}

/** Base theme (variant 0) — kept as the default and CSS mirror. */
export const theme: Theme = themeForChamber(0);
