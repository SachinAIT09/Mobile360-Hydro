import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// @demo/shared is a linked workspace package compiled to CommonJS.
// Pre-bundling it lets Vite serve it as ESM in dev; commonjsOptions covers the production build.
// Production builds are served by the API server under /staff/ (see apps/api/src/static.ts).
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/staff/' : '/',
  plugins: [react()],
  optimizeDeps: { include: ['@demo/shared'] },
  build: { commonjsOptions: { include: [/packages\/shared/, /node_modules/] } },
  server: { port: 5173 },
}));
