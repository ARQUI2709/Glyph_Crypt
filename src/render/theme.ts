/**
 * Single source of truth for palette + glow, mirrored from the CSS custom properties in
 * styles.css. The original MVP duplicated these literals across draw calls; keep this file
 * and the CSS `:root` block in sync when retheming.
 */
export const theme = {
  bg: '#060911',
  wallFace: '#0e1c38',
  wallGlow: 'rgba(47,125,240,0.85)',
  wallGlowSoft: 'rgba(47,125,240,0.7)',
  neon: '#25e0d8',
  neonGlow: 'rgba(37,224,216,0.9)',
  gold: '#ffcb3d',
  goldGlowStrong: 'rgba(255,203,61,0.95)',
  goldGlow: 'rgba(255,203,61,0.8)',
  spike: '#ff3b6b',
  spikeGlow: 'rgba(255,59,107,0.8)',
  exit: 'rgba(177,77,255,', // completed with alpha + ')'
  exitGlow: 'rgba(177,77,255,0.9)',
  ink: '#060911',
} as const;
