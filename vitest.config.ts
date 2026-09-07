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
      // The list is also the boundary: a new top-level product directory must be added here or it is
      // invisible to the gate. `scripts/` is left out on purpose (one-off operator scripts, not product code).
      include: ['src/**', 'workers/**'],
      // Vitest appends the test-file globs, setup files, config files, and node_modules to this list and
      // does not let user config override that, so a bare `exclude` no longer drops test files into the
      // product-code count. What remains here is product-directory content that is not measurable code.
      exclude: [
        '**/*.config.{ts,js,mjs,cjs}',
        '**/*.d.ts',
        '**/*.css',
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
