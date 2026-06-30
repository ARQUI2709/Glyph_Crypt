import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Generates the PWA icon set (192/512, maskable, apple-touch-icon, favicon) from a single
// neon-glyph artwork into `public/`. Run with `pnpm generate-pwa-assets`. The generator emits
// next to the source, so the source must stay in `public/`; it's excluded from the Workbox
// precache in vite.config.ts (globIgnores) so the 2.86 MB original doesn't blow the cache limit.

// Crypt background — keep in sync with manifest theme_color / styles.css :root.
const BG = '#060911';

// minimal2023Preset only sets sizes; its maskable/apple defaults are padding 0.3 + white
// background, which leaves the glyph small inside a white box once a launcher masks the icon.
// Override both to bleed the dark theme colour to the edges and use the 10% maskable safe-zone
// padding so the glyph fills the tile.
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: {
      sizes: [512],
      padding: 0.1,
      resizeOptions: { fit: 'contain', background: BG },
    },
    apple: {
      sizes: [180],
      padding: 0.05,
      resizeOptions: { fit: 'contain', background: BG },
    },
  },
  images: ['public/icon-source.png'],
});
