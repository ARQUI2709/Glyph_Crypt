import { defineConfig } from 'vite';

// Project Pages serve from https://<user>.github.io/glyph-crypt/
// so assets must be referenced under that base. Override locally with `--base=/`.
export default defineConfig({
  base: '/glyph-crypt/',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
