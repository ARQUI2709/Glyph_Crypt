import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Project Pages serve from https://arqui2709.github.io/Glyph_Crypt/ so assets must be
// referenced under that base (must match the repo name exactly, case-sensitive).
// Override locally with `--base=/`.
export default defineConfig({
  base: '/Glyph_Crypt/',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
  plugins: [
    VitePWA({
      // Ship updates silently — the game is small and fully client-side, so a fresh service
      // worker can take over without prompting. `scope`/`start_url` are derived from `base`.
      registerType: 'autoUpdate',
      // Icon set + head links generated from public/glyph.svg via pwa-assets.config.ts.
      pwaAssets: { config: true },
      manifest: {
        name: 'Glyph Crypt',
        short_name: 'Glyph Crypt',
        description: 'A neon slide-maze arcade game — sweep the dots, grab 3 stars, reach the gate.',
        theme_color: '#060911',
        background_color: '#060911',
        display: 'standalone',
        orientation: 'portrait',
        categories: ['games', 'entertainment'],
      },
      workbox: {
        // Precache the whole built app so it plays fully offline once installed.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // icon-source.png is the 2.86 MB artwork master the icon generator reads; it ships in
        // public/ but is never referenced at runtime, so skip it (it also exceeds the 2 MiB
        // precache limit and would otherwise fail the build).
        globIgnores: ['**/icon-source.png'],
      },
    }),
  ],
});
