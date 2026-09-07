// ABOUT: Vitest configuration for Ansible AI Reader
// ABOUT: Configures TypeScript path aliases and coverage thresholds

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // tsconfig keeps `jsx: preserve` for Next.js; Vite's transformer must compile JSX for the test runner
  oxc: {
    jsx: {
      runtime: 'automatic',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Without `include`, only files some test imports are measured, so an untested module would not
      // lower the number at all. Listing the product directories keeps untested files counted at 0%.
      include: ['src/**', 'workers/**'],
      // Test files, setup files, and type declarations are excluded automatically; these are not product code
      exclude: [
        '**/*.config.{ts,js,mjs,cjs}',
        '**/*.d.ts',
        '**/*.css',
        'SCRATCH/**',
      ],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 90,
        statements: 95,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
