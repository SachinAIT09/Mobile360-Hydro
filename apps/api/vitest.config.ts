import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests cover pure functions only. Nest DI needs tsc's decorator metadata, which esbuild does not emit,
// so specs never import AppModule or @nestjs/testing (see CLAUDE.md). @demo/shared resolves to its source.
export default defineConfig({
  resolve: {
    alias: { '@demo/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});
