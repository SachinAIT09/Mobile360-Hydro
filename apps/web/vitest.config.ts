import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Pure-library tests only (src/lib); no React rendering. @demo/shared resolves to its source.
export default defineConfig({
  resolve: {
    alias: { '@demo/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});
