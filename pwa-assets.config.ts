import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Generates the PWA icon set (192/512, maskable, apple-touch-icon, favicon) from a single
// neon-glyph artwork into `public/`. Run with `pnpm generate-pwa-assets`.
export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/icon-source.png'],
});
