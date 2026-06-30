import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Generates the PWA icon set (192/512, maskable, apple-touch-icon, favicon) from a single
// neon-glyph artwork into `public/`. Run with `pnpm generate-pwa-assets`. The generator emits
// next to the source, so the source must stay in `public/`; it's excluded from the Workbox
// precache in vite.config.ts (globIgnores) so the 2.86 MB original doesn't blow the cache limit.
export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/icon-source.png'],
});
