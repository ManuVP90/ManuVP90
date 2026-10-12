import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: false,
  server: { port: 5173 },
  build: {
    outDir: fileURLToPath(new URL('../../dist/client', import.meta.url)),
    emptyOutDir: true,
  },
});
