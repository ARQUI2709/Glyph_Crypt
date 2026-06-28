import { defineConfig } from 'vite';

// Project Pages serve from https://arqui2709.github.io/Glyph_Crypt/ so assets must be
// referenced under that base (must match the repo name exactly, case-sensitive).
// Override locally with `--base=/`.
export default defineConfig({
  base: '/Glyph_Crypt/',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
